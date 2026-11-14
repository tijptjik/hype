// NODE
import { createHash } from 'node:crypto'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  location,
  locationRevisionInput,
  locationIdentityHistory,
} from '../schema/location'
import { locationCanonicalDraft } from '../schema/locationCanonicalDraft'
// DOMAIN
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { serializeLocationFacts } from '#lib/locations/factsSnapshot.js'
import { deriveLocationId } from '#lib/locations/id.server.js'
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
import { isCanonicalLocationDraft } from '#lib/locations/canonicalDraft.js'
import { prepareSaanSeoiRevision } from './locationSource'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

// TABLE OF CONTENTS
// - createCanonicalLocationDraft: trusted, idempotent shared baseline ingestion
// - updateCanonicalLocationDraft: mutable working facts without history
// - publishCanonicalLocationDraft: explicit upload receipt promotes the same identity

/** Create one shared canonical draft; existing source keys never overwrite reviewed data.
 * @param db Request database.
 * @param input Trusted source identity, typed facts and unmodified evidence.
 * @returns Normal Hype identity and whether it was already retained.
 * @remarks Trusted ingestion only. Callers must be core administrators or an authorized importer.
 * A source key is an exact provider/family/ID tuple encoded by the importer, never a name or coordinate.
 */
export async function createCanonicalLocationDraft(
  db: Database,
  input: {
    sourceKey: string
    kind: 'premises' | 'building_part' | 'establishment'
    facts: LocationFacts
    rawSource: Record<string, unknown>
    actorId: string
  },
): Promise<{ locationId: string; existing: boolean }> {
  if (!input.sourceKey.trim() || !input.actorId.trim())
    throw new Error('Draft requires source identity and actor')
  const prior = await db
    .select()
    .from(locationCanonicalDraft)
    .where(eq(locationCanonicalDraft.sourceKey, input.sourceKey))
    .get()
  if (prior) {
    const retained = await db
      .select()
      .from(location)
      .where(eq(location.id, prior.locationId))
      .get()
    if (!retained || retained.kind !== input.kind || retained.state === 'redirect')
      throw new Error('Retained draft identity requires review')
    return { locationId: prior.locationId, existing: true }
  }
  const facts = LocationFactsSchema.parse(input.facts)
  if (facts.entity && facts.entity.kind !== input.kind)
    throw new Error('Draft facts classification differs from identity')
  const id = deriveLocationId('canonical-draft', input.sourceKey)
  const taxonomy = locationTaxonomy(input.kind)
  const rawSource = {
    ...input.rawSource,
    canonicalDraft: { sourceKey: input.sourceKey, actorId: input.actorId },
  }
  const serialized = serializeLocationFacts(facts, input.kind)
  const hash = createHash('sha256')
    .update(JSON.stringify({ rawSource, serialized }))
    .digest('hex')
  // All identity, correlation and baseline writes share one atomic conflict fence.
  const result = await executeRevisionBatch(
    db,
    sql`NOT EXISTS(SELECT 1 FROM location WHERE id=${id}) AND NOT EXISTS(SELECT 1 FROM locationCanonicalDraft WHERE sourceKey=${input.sourceKey})`,
    [
      db.insert(location).values({
        id,
        entityKind: taxonomy.kind,
        class: taxonomy.class,
        state: 'unresolved',
        ssId: null,
        ownerOrganisationId: null,
      }),
      db.insert(locationCanonicalDraft).values({
        locationId: id,
        sourceKey: input.sourceKey,
        createdBy: input.actorId,
      }),
      db
        .insert(locationRevisionInput)
        .select(
          sql`SELECT ${`${id}_draft`},${id},1,'local',NULL,NULL,NULL,NULL,${hash},${JSON.stringify(rawSource)},${serialized},strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        ),
    ],
  )
  if (!result) {
    const winner = await db
      .select()
      .from(locationCanonicalDraft)
      .where(eq(locationCanonicalDraft.sourceKey, input.sourceKey))
      .get()
    if (winner) return { locationId: winner.locationId, existing: true }
    throw new Error('Canonical draft identity conflict')
  }
  return { locationId: id, existing: false }
}

/** Promote an exact upload correlation to a real upstream publication without replacing the Hype ID.
 * @param db Request database.
 * @param input Trusted upload receipt and reviewed latest revision.
 * @returns The retained Hype Location ID.
 * @remarks Core-admin/importer only. Names and proximity never authorize this operation.
 * Existing accepted Feature revisions stay pinned; normal adoption handles upstream content changes.
 */
export async function publishCanonicalLocationDraft(
  db: Database,
  input: {
    sourceKey: string
    expectedRevisionId: string
    expectedDraftVersion: string
    kind: 'premises' | 'building_part' | 'establishment'
    projection: SaanSeoiPlaceProjection
    actorId: string
  },
): Promise<string> {
  if (!input.actorId.trim()) throw new Error('Publication requires an actor')
  const draft = await db
    .select()
    .from(locationCanonicalDraft)
    .where(eq(locationCanonicalDraft.sourceKey, input.sourceKey))
    .get()
  if (!draft) throw new Error('Unknown canonical draft correlation')
  const current = await db
    .select()
    .from(location)
    .where(eq(location.id, draft.locationId))
    .get()
  if (!current || current.kind !== input.kind || !isCanonicalLocationDraft(current))
    throw new Error('Canonical draft changed or already published')
  if (
    input.projection.facts.entity &&
    input.projection.facts.entity.kind !== input.kind
  )
    throw new Error('Published classification differs from draft')
  const prepared = await prepareSaanSeoiRevision(current.id, input.projection)
  const projection = input.projection
  const historyId = `${current.id}_published`
  // Reject stale local edits, reused upstream IDs and retired source identities inside the write batch.
  const guard = sql`EXISTS(SELECT 1 FROM location WHERE id=${current.id} AND state='unresolved' AND ssId IS NULL AND ownerOrganisationId IS NULL AND matchingType=${input.kind})
    AND (SELECT id FROM locationRevisionContent WHERE locationId=${current.id} ORDER BY version DESC LIMIT 1)=${input.expectedRevisionId}
    AND (SELECT contentHash FROM locationRevisionContent WHERE id=${input.expectedRevisionId})=${input.expectedDraftVersion}
    AND NOT EXISTS(SELECT 1 FROM location WHERE ssId=${projection.ssId})
    AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory WHERE ssId=${projection.ssId} OR previousSsId=${projection.ssId})`
  const result = await executeRevisionBatch(db, guard, [
    db
      .insert(locationRevisionInput)
      .select(
        sql`SELECT ${prepared.revisionId},${current.id},(SELECT max(version)+1 FROM locationRevisionContent WHERE locationId=${current.id}),'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},${projection.snapshotId},${prepared.contentHash},${JSON.stringify(prepared.rawSource)},${serializeLocationFacts(prepared.facts, input.kind)},strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      ),
    db
      .insert(locationIdentityHistory)
      .select(
        sql`SELECT ${historyId},${current.id},NULL,'unresolved',NULL,${projection.ssId},${prepared.revisionId},${input.actorId},'Canonical draft published from exact upload correlation',NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      ),
    db
      .update(location)
      .set({ state: 'linked', ssId: projection.ssId, sourceAvailability: 'current' })
      .where(eq(location.id, current.id)),
  ])
  if (!result) throw new Error('Canonical draft publication conflict')
  return current.id
}

/** Replace a canonical draft's working facts without appending Location history.
 * @param db Request database.
 * @param input Validated facts and the exact version displayed by the editor.
 * @returns New concurrency token, or null if edited or published concurrently.
 * @remarks The caller must authorize SuperAdmin access. Published records are immutable.
 */
export async function updateCanonicalLocationDraft(
  db: Database,
  input: {
    locationId: string
    sourceRevisionId: string
    expectedDraftVersion: string
    facts: LocationFacts
  },
): Promise<string | null> {
  const current = await db.get<{ kind: string; rawSource: string }>(
    sql`SELECT l.matchingType kind,r.rawSource FROM location l
      JOIN locationCanonicalDraft d ON d.locationId=l.id
      JOIN locationRevisionContent r ON r.locationId=l.id
      WHERE l.id=${input.locationId} AND r.id=${input.sourceRevisionId}
        AND l.state='unresolved' AND l.ssId IS NULL AND l.ownerOrganisationId IS NULL`,
  )
  if (!current) return null
  const facts = LocationFactsSchema.parse(input.facts)
  const serialized = serializeLocationFacts(
    facts,
    current.kind as import('#lib/locations/kinds.js').LocationKind,
  )
  const contentHash = createHash('sha256')
    .update(JSON.stringify({ rawSource: JSON.parse(current.rawSource), serialized }))
    .digest('hex')
  // Hash fencing detects edits even though the working baseline retains its stable ID.
  const guard = sql`EXISTS(SELECT 1 FROM location l JOIN locationCanonicalDraft d ON d.locationId=l.id
    JOIN locationRevisionContent r ON r.locationId=l.id
    WHERE l.id=${input.locationId} AND l.state='unresolved' AND l.ssId IS NULL
      AND l.ownerOrganisationId IS NULL AND r.id=${input.sourceRevisionId}
      AND r.contentHash=${input.expectedDraftVersion}
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id))`
  const result = await executeRevisionBatch(db, guard, [
    db
      .update(locationRevisionInput)
      .set({ facts: sql`${serialized}`, contentHash })
      .where(
        sql`${locationRevisionInput.id}=${input.sourceRevisionId} AND ${locationRevisionInput.locationId}=${input.locationId}`,
      ),
  ])
  return result ? contentHash : null
}
