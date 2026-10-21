// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. LOCAL PLACE CREATION
// 2. IMMUTABLE LOCAL ADDRESS REVISIONS
// ---

// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// SHARED PARSER
import { parseAddressContent } from '@saanseoi/address'
// VALIDATION
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Create a private manual or unresolved Location and its immutable local baseline.
 * @param db Request-local database with atomic D1 batch support.
 * @param organisationId Persisted, authorized owning organisation.
 * @param input Local facts, the manual/unresolved distinction and explicit sharing preference.
 * @param actorId Authenticated author retained in baseline provenance.
 * @returns Stable local Location identity and initial revision identity.
 * @remarks The caller must authorize organisation management. No Feature is linked or
 * rewritten; canonical identities and addresses require separate verified workflows.
 * Sharing permission is retained with the author in immutable provenance; it does not
 * publish the Location or change Organisation ownership.
 */
export async function createLocalLocation(
  db: Database,
  organisationId: string,
  input: unknown,
  actorId: string,
): Promise<{ locationId: string; revisionId: string }> {
  const parsed = LocalLocationInputSchema.parse(input)
  const locationId = nanoid(12)
  const revisionId = nanoid(12)
  const payload = {
    kind: 'local-baseline',
    actorId,
    organisationId,
    input: parsed,
    ...(parsed.parseSource
      ? {
          localAddress: {
            parse: parseAddressContent(parsed.parseSource),
            review: 'authored',
          },
        }
      : {}),
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // An atomic batch cannot leave an identity behind if its baseline insert fails.
  await db.batch([
    db.insert(locationTable).values({
      id: locationId,
      kind: parsed.kind,
      state: parsed.state,
      ownerOrganisationId: organisationId,
    }),
    db.insert(locationRevision).values({
      id: revisionId,
      locationId,
      sequence: 1,
      origin: 'local',
      contentHash,
      payload,
      facts: parsed.facts,
    }),
  ])
  return { locationId, revisionId }
}

/**
 * Append structured address content without rewriting accepted or historical revisions.
 * @param db Request-local database.
 * @param input Authorized Organisation (null only for a shared-Location steward), expected revision and validated authored content.
 * @returns New revision identity, or null if ownership, source identity or revision changed.
 * @remarks Existing Features retain their accepted revision until explicitly adopting this one.
 */
export async function updateLocalLocationAddress(
  db: Database,
  input: {
    locationId: string
    organisationId: string | null
    expectedRevisionId: string
    address: unknown
    parseSource?: Record<string, string>
    actorId: string
  },
): Promise<{ revisionId: string } | null> {
  if (!input.actorId.trim()) throw new Error('Local Location edits require an author')
  const address = LocalLocationAddressSchema.parse(input.address)
  const current = await db
    .select({
      facts: locationRevision.facts,
      payload: locationRevision.payload,
      sequence: locationRevision.sequence,
      ssId: locationTable.ssId,
      apiVersion: locationRevision.apiVersion,
      releaseId: locationRevision.releaseId,
      snapshotId: locationRevision.snapshotId,
    })
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationTable.id, input.locationId),
        sql`${locationTable.ownerOrganisationId} IS ${input.organisationId}`,
        eq(locationRevision.id, input.expectedRevisionId),
        sql`${locationTable.state} IN ('manual','unresolved','linked')`,
        sql`${locationRevision.sequence}=(SELECT max(r.sequence) FROM locationRevision r WHERE r.locationId=${locationTable.id})`,
      ),
    )
    .get()
  if (!current) return null
  const facts = LocationFactsSchema.parse(current.facts)
  facts.location.address = {
    status: 'unresolved',
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    addressSnapshotId: null,
    records: {},
    fallbackDisplay: {},
    authored: address,
  }
  const revisionId = nanoid(12)
  const payload = {
    ...current.payload,
    kind: 'local-address-edit',
    ...(current.ssId
      ? {
          sourceAddress:
            current.payload.sourceAddress ?? current.facts.location.address,
        }
      : {}),
    localAddress: {
      actorId: input.actorId,
      organisationId: input.organisationId,
      previousRevisionId: input.expectedRevisionId,
      review: 'authored',
      ...(input.parseSource ? { parse: parseAddressContent(input.parseSource) } : {}),
    },
    actorId: input.actorId,
    organisationId: input.organisationId,
    previousRevisionId: input.expectedRevisionId,
  }
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ facts, payload })),
  )
  const contentHash = Array.from(new Uint8Array(bytes), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // The insert reads its expected predecessor and owner in the same SQLite statement.
  const rows = await db
    .insert(locationRevision)
    .select(sql`SELECT ${revisionId},p.id,${current.sequence + 1},'local',${current.ssId},${current.apiVersion},${current.releaseId},${current.snapshotId},${contentHash},${JSON.stringify(payload)},${JSON.stringify(facts)},strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM location p JOIN locationRevision r ON r.locationId=p.id
    WHERE p.id=${input.locationId} AND p.ownerOrganisationId IS ${input.organisationId}
      AND p.ssId IS ${current.ssId} AND p.state IN ('manual','unresolved','linked')
      AND r.id=${input.expectedRevisionId}
      AND r.sequence=(SELECT max(latest.sequence) FROM locationRevision latest WHERE latest.locationId=p.id)`)
    .returning({ revisionId: locationRevision.id })
  return rows[0] ?? null
}
