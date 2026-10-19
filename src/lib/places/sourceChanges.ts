// VALIDATION
import { z } from 'zod'
// TYPES
import type { PlaceSourceClient } from './sourceClient'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. COMPARISON CONTRACTS
// 2. EVIDENCE VALIDATION
// 3. SOURCE TRANSPORT
// ---

const id = z.string().min(1).max(200)
export const PlaceSourceChangesInputSchema = z.strictObject({
  fromRelease: id,
  toRelease: id,
  resourceType: z.string().min(1).max(80).optional(),
  type: z.enum(['added', 'changed', 'removed']).optional(),
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).max(4096).optional(),
})
export const PlaceSourceComparisonPinSchema = z.object({
  datasetCode: id,
  resourceType: id,
  fromRelease: id,
  toRelease: id,
})
const record = z
  .object({
    sourceRecordId: z.string().min(1),
    properties: z.record(z.string(), z.unknown()).nullable(),
    geometry: z.unknown().optional(),
    resourceType: z.string().optional(),
    variant: z.string().optional(),
  })
  .passthrough()
const change = z
  .object({
    sourceRecordId: z.string().min(1),
    type: z.enum(['added', 'changed', 'removed']),
    before: record.nullable(),
    after: record.nullable(),
    fields: z.array(
      z
        .object({
          path: z.array(z.string()),
          beforeExists: z.boolean(),
          afterExists: z.boolean(),
          before: z.unknown(),
          after: z.unknown(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export const PlaceSourceChangesPageSchema = z
  .object({
    pin: PlaceSourceComparisonPinSchema,
    records: z.array(change).max(100),
    nextCursor: z.string().min(1).max(4096).nullable(),
  })
  .passthrough()
export type PlaceSourceComparisonPin = z.infer<typeof PlaceSourceComparisonPinSchema>
export type PlaceSourceChangesPage = z.infer<typeof PlaceSourceChangesPageSchema>

/**
 * Validate publisher change evidence independently of transport and persistence.
 * @param document Upstream response or retained page being checked during resume.
 * @param input Exact bounded request, including the opaque cursor and filters.
 * @param expectedPin Resolved IDs from the first page; required for a continuation.
 * @returns Validated complete publisher evidence, retaining unknown source fields.
 * @remarks Release codes may resolve to IDs on the first page only. No source record
 * ID is asserted to be a canonical Place ID, and removals do not imply shop closure.
 */
export function validatePlaceSourceChangesPage(
  document: unknown,
  input: z.input<typeof PlaceSourceChangesInputSchema>,
  expectedPin?: PlaceSourceComparisonPin,
): PlaceSourceChangesPage {
  const request = PlaceSourceChangesInputSchema.parse(input)
  const page = PlaceSourceChangesPageSchema.parse(document)
  if ('summary' in page)
    throw new Error('Expected source change records, not summary counts')
  const pin = expectedPin
    ? PlaceSourceComparisonPinSchema.parse(expectedPin)
    : undefined
  if (request.cursor && !pin)
    throw new Error('Continuation requires a resolved source comparison pin')
  if (
    pin &&
    (page.pin.datasetCode !== pin.datasetCode ||
      page.pin.resourceType !== pin.resourceType ||
      page.pin.fromRelease !== pin.fromRelease ||
      page.pin.toRelease !== pin.toRelease ||
      request.fromRelease !== pin.fromRelease ||
      request.toRelease !== pin.toRelease)
  )
    throw new Error('Source changes do not match the retained comparison pin')
  if (
    page.pin.fromRelease === page.pin.toRelease ||
    (request.resourceType && request.resourceType !== page.pin.resourceType)
  )
    throw new Error('Invalid source comparison identity')
  if (
    page.records.length > request.limit ||
    (page.nextCursor !== null && page.records.length !== request.limit) ||
    (request.cursor && page.nextCursor === request.cursor)
  )
    throw new Error('Invalid source changes pagination')
  const seen = new Set<string>()
  for (const row of page.records) {
    if (seen.has(row.sourceRecordId) || (request.type && row.type !== request.type))
      throw new Error('Duplicate or incorrectly filtered source change')
    seen.add(row.sourceRecordId)
    if (
      (row.before && row.before.sourceRecordId !== row.sourceRecordId) ||
      (row.after && row.after.sourceRecordId !== row.sourceRecordId) ||
      (row.type === 'added' && (row.before !== null || row.after === null)) ||
      (row.type === 'removed' && (row.before === null || row.after !== null)) ||
      (row.type === 'changed' && (row.before === null || row.after === null))
    )
      throw new Error(
        'Source change identities or before/after evidence are inconsistent',
      )
  }
  return page
}

/**
 * Read one retained publisher comparison page from the actual Places changes endpoint.
 * @param client Trusted source host, credential and transport.
 * @param input Resource-release IDs or first-page aliases, filters and cursor.
 * @param expectedPin Resolved comparison identity persisted after the first successful page.
 * @returns Publisher changes; canonical Places still require a pinned collection refresh.
 * @remarks Callers persist evidence before advancing the cursor. This does not ingest,
 * adopt or remove HYPE Places. Credentials cannot follow redirects and errors omit bodies.
 */
export async function readSaanSeoiPlaceSourceChanges(
  client: PlaceSourceClient,
  input: z.input<typeof PlaceSourceChangesInputSchema>,
  expectedPin?: PlaceSourceComparisonPin,
): Promise<PlaceSourceChangesPage> {
  const request = PlaceSourceChangesInputSchema.parse(input)
  if (request.cursor && !expectedPin)
    throw new Error('Continuation requires a resolved source comparison pin')
  if (
    expectedPin &&
    (request.fromRelease !== expectedPin.fromRelease ||
      request.toRelease !== expectedPin.toRelease)
  )
    throw new Error('Request does not match the retained comparison pin')
  const url = new URL('/places/v0.1/sources/changes', client.baseUrl)
  url.search = new URLSearchParams({
    region: 'hk',
    view: 'records',
    fromRelease: request.fromRelease,
    toRelease: request.toRelease,
    limit: String(request.limit),
    ...(request.resourceType ? { resourceType: request.resourceType } : {}),
    ...(request.type ? { type: request.type } : {}),
    ...(request.cursor ? { cursor: request.cursor } : {}),
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`SaanSeoi Place source changes failed (${response.status})`)
  return validatePlaceSourceChangesPage(await response.json(), request, expectedPin)
}
