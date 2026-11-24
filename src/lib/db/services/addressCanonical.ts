// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// SCHEMA
import { address, addressRevision } from '../schema/locationRelationships'
// DOMAIN
import {
  LocalLocationAddressSchema,
  LocalAddressI18nSchema,
  createLocalLocationAddress,
} from '#lib/addresses/localLocationAddress.js'
// TYPES
import type { Database } from '#lib/types.js'

export const CanonicalAddressInputSchema = z.strictObject({
  sourceKey: z.strictObject({
    provider: z.string().min(1),
    family: z.string().min(1),
    id: z.string().min(1),
  }),
  components: LocalLocationAddressSchema,
  geometry: z
    .strictObject({
      type: z.literal('Point'),
      coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    })
    .nullable(),
  sourceVersion: z.string().nullable(),
  sourceReferences: z
    .array(
      z.strictObject({
        provider: z.string(),
        dataset: z.string(),
        apiVersion: z.string().nullable(),
        releaseId: z.string().nullable(),
        snapshotId: z.string().nullable(),
      }),
    )
    .min(1),
  rawSource: z.record(z.string(), z.unknown()),
})
/** Produce stable content keys independently of JSON property order.
 * @param value Source content. @returns Deterministic JSON text.
 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
/** Hash canonical content, not mutable publication metadata.
 * @param value Validated canonical JSON. @returns SHA-256 hexadecimal digest.
 */
export async function canonicalAddressDigest(value: unknown): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value))),
    ),
  )
    .map(n => n.toString(16).padStart(2, '0'))
    .join('')
}
/** Retain a curated publisher address without allowing Organisation projections to author it.
 * @param db Request database. @param raw Trusted publisher/curator snapshot, authorized by caller.
 * @returns Deduplicated immutable content version. No Feature or correction is overwritten.
 */
export async function retainCanonicalAddress(
  db: Database,
  raw: z.infer<typeof CanonicalAddressInputSchema>,
  guard: SQL = sql`1`,
  expectedPreviousRevisionId?: string | null,
): Promise<typeof addressRevision.$inferSelect> {
  const input = CanonicalAddressInputSchema.parse(raw)
  const addressId = 'address:' + (await canonicalAddressDigest(input.sourceKey))
  if (expectedPreviousRevisionId !== undefined) {
    guard = and(
      guard,
      sql`(SELECT id FROM addressRevision WHERE addressId=${addressId} ORDER BY rowid DESC LIMIT 1) IS ${expectedPreviousRevisionId}`,
    )!
  }
  if (!(await db.get(sql`SELECT 1 WHERE ${guard}`)))
    throw new Error('Canonical address head changed; reload before importing')
  const contentHash = await canonicalAddressDigest({
    components: input.components,
    geometry: input.geometry,
  })
  const id = addressId + ':' + contentHash
  await db.batch([
    db
      .insert(address)
      .select(
        sql`SELECT ${addressId},${JSON.stringify(input.sourceKey)} WHERE ${guard}`,
      )
      .onConflictDoNothing(),
    db
      .insert(addressRevision)
      .select(
        sql`SELECT ${id},${addressId},${input.components.scope},${JSON.stringify(input.components)},${input.geometry ? JSON.stringify(input.geometry) : null},${input.sourceVersion},${contentHash},${JSON.stringify(input.sourceReferences)},${JSON.stringify(input.rawSource)},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`,
      )
      .onConflictDoNothing(),
  ])
  const row = await db
    .select()
    .from(addressRevision)
    .where(
      and(
        eq(addressRevision.addressId, addressId),
        eq(addressRevision.contentHash, contentHash),
      ),
    )
    .get()
  if (!row) throw new Error('Canonical address retention failed')
  return row
}

/** Mirror a publication-verified SaanSeoi parent address using the shared content schema.
 * @param db Request database. @param reference Address whose snapshot was already validated by the source adapter.
 * @param guard Existing source-refresh lease fence. @returns Retained version or null for incomplete evidence.
 * @remarks This is called only after forward-publication checks; source disappearance never creates a deletion.
 */
export async function retainResolvedAddress(
  db: Database,
  reference: import('#lib/locations/model.js').LocationPosition['address'],
  guard: SQL,
) {
  if (
    reference.status !== 'resolved' ||
    !reference.address2dId ||
    !reference.snapshotId
  )
    return null
  return retainPublishedAddress(
    db,
    reference.address2dId,
    reference.snapshotId,
    reference.rawSource,
    guard,
  )
}

/** Retain full publisher content only when it matches the reviewed address and snapshot.
 * @param db Request database. @param addressId Reviewed source identity. @param snapshotId Reviewed snapshot.
 * @param rawSource Trusted full-profile response. @param guard Write fence. @returns Retained revision, or null on a mismatch.
 */
export async function retainPublishedAddress(
  db: Database,
  addressId: string,
  snapshotId: string,
  rawSource: Record<string, unknown>,
  guard: SQL,
): Promise<typeof addressRevision.$inferSelect | null> {
  const response = z
    .object({
      data: z.object({
        id: z.string(),
        attributes: z.object({
          snapshotId: z.string(),
          scope: z
            .enum([
              'unknown',
              'premises',
              'phase',
              'building',
              'section',
              'floor',
              'unit',
              'unit_portion',
            ])
            .optional(),
          i18n: z.record(z.string(), LocalAddressI18nSchema.strip()),
          geometry: CanonicalAddressInputSchema.shape.geometry.optional(),
        }),
      }),
      meta: z.object({ apiReleaseSet: z.string().min(1) }),
    })
    .safeParse(rawSource)
  if (
    !response.success ||
    response.data.data.id !== addressId ||
    response.data.data.attributes.snapshotId !== snapshotId
  )
    return null
  const attributes = response.data.data.attributes
  return retainCanonicalAddress(
    db,
    {
      sourceKey: {
        provider: 'saanseoi',
        family: 'addresses',
        id: addressId,
      },
      components: {
        ...createLocalLocationAddress(),
        scope: attributes.scope ?? 'unknown',
        i18n: attributes.i18n,
      },
      geometry: attributes.geometry ?? null,
      sourceVersion: snapshotId,
      sourceReferences: [
        {
          provider: 'saanseoi',
          dataset: 'addresses',
          apiVersion: null,
          releaseId: response.data.meta.apiReleaseSet,
          snapshotId: snapshotId,
        },
      ],
      rawSource,
    },
    guard,
  )
}
