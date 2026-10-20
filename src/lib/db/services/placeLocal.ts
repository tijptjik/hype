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
import { place, placeRevision } from '../schema/place'
// SHARED PARSER
import { parseAddressContent } from '@saanseoi/address'
// VALIDATION
import { LocalPlaceAddressSchema } from '#lib/addresses/localPlaceAddress.js'
import { PlaceFactsSchema } from '#lib/places/validation.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Create a private manual or unresolved Place and its immutable local baseline.
 * @param db Request-local database with atomic D1 batch support.
 * @param organisationId Persisted, authorized owning organisation.
 * @param input Local facts and the intentional manual/unresolved distinction.
 * @param actorId Authenticated author retained in baseline provenance.
 * @returns Stable local Place identity and initial revision identity.
 * @remarks The caller must authorize organisation management. No Feature is linked or
 * rewritten; canonical identities and addresses require separate verified workflows.
 */
export async function createLocalPlace(
  db: Database,
  organisationId: string,
  input: unknown,
  actorId: string,
): Promise<{ placeId: string; revisionId: string }> {
  const parsed = LocalPlaceInputSchema.parse(input)
  const placeId = nanoid(12)
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
    db.insert(place).values({
      id: placeId,
      state: parsed.state,
      ownerOrganisationId: organisationId,
    }),
    db.insert(placeRevision).values({
      id: revisionId,
      placeId,
      sequence: 1,
      origin: 'local',
      contentHash,
      payload,
      facts: parsed.facts,
    }),
  ])
  return { placeId, revisionId }
}

/**
 * Append structured address content without rewriting accepted or historical revisions.
 * @param db Request-local database.
 * @param input Authorized Organisation (null only for a shared-Place steward), expected revision and validated authored content.
 * @returns New revision identity, or null if ownership, source identity or revision changed.
 * @remarks Existing Features retain their accepted revision until explicitly adopting this one.
 */
export async function updateLocalPlaceAddress(
  db: Database,
  input: {
    placeId: string
    organisationId: string | null
    expectedRevisionId: string
    address: unknown
    parseSource?: Record<string, string>
    actorId: string
  },
): Promise<{ revisionId: string } | null> {
  if (!input.actorId.trim()) throw new Error('Local Place edits require an author')
  const address = LocalPlaceAddressSchema.parse(input.address)
  const current = await db
    .select({
      facts: placeRevision.facts,
      payload: placeRevision.payload,
      sequence: placeRevision.sequence,
      ssId: place.ssId,
      apiVersion: placeRevision.apiVersion,
      releaseId: placeRevision.releaseId,
      snapshotId: placeRevision.snapshotId,
    })
    .from(placeRevision)
    .innerJoin(place, eq(place.id, placeRevision.placeId))
    .where(
      and(
        eq(place.id, input.placeId),
        sql`${place.ownerOrganisationId} IS ${input.organisationId}`,
        eq(placeRevision.id, input.expectedRevisionId),
        sql`${place.state} IN ('manual','unresolved','linked')`,
        sql`${placeRevision.sequence}=(SELECT max(r.sequence) FROM placeRevision r WHERE r.placeId=${place.id})`,
      ),
    )
    .get()
  if (!current) return null
  const facts = PlaceFactsSchema.parse(current.facts)
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
    .insert(placeRevision)
    .select(sql`SELECT ${revisionId},p.id,${current.sequence + 1},'local',${current.ssId},${current.apiVersion},${current.releaseId},${current.snapshotId},${contentHash},${JSON.stringify(payload)},${JSON.stringify(facts)},strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM place p JOIN placeRevision r ON r.placeId=p.id
    WHERE p.id=${input.placeId} AND p.ownerOrganisationId IS ${input.organisationId}
      AND p.ssId IS ${current.ssId} AND p.state IN ('manual','unresolved','linked')
      AND r.id=${input.expectedRevisionId}
      AND r.sequence=(SELECT max(latest.sequence) FROM placeRevision latest WHERE latest.placeId=p.id)`)
    .returning({ revisionId: placeRevision.id })
  return rows[0] ?? null
}
