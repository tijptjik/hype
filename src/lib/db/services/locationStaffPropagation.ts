// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. ATOMIC STAFF PROPAGATION
// 2. PENDING CORRECTION REPLAY
// ---

// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { locationRefreshItem } from '../schema/locationRefresh'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { prepareSharedFeatureAdoption } from './locationSharedFeature'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { readSharedLocationCorrection, sharedLocationFacts } from './locationShared'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'

/** Prepare direct propagation of an authorized shared staff correction.
 * @param db Request database.
 * @param input Exact staff-authored fields and immutable shared revision being saved.
 * @returns Association-set fence and atomic Feature/history/refresh statements.
 * @remarks Call only after shared-resource authorization. Source ingestion must use policy review.
 * Each Feature keeps its Organisation overrides, independent names and explicit manual placement.
 */
export async function prepareStaffLocationPropagation(
  db: Database,
  input: {
    locationId: string
    sourceRevisionId: string
    sharedRevisionId: string
    actorId: string
    facts: LocationFacts
    fields: string[]
  },
): Promise<{ guard: SQL; statements: BatchItem<'sqlite'>[]; featureIds: string[] }> {
  const subjects = sql`SELECT f.id,f.projectId,b.version,b.acceptancePolicy FROM feature f JOIN featureLocation b ON b.featureId=f.id
    WHERE b.locationId=${input.locationId} AND f.isDraft=0 ORDER BY f.id`
  const rows = await db.all<{
    id: string
    projectId: string
    version: string
    acceptancePolicy: string | null
  }>(subjects)
  // A new link or reassociation during preparation must retry the entire save, not miss the correction.
  const signature = JSON.stringify(
    rows.map(row => [row.id, row.projectId, row.version]),
  )
  const guard = sql`(SELECT json_group_array(json_array(id,projectId,version)) FROM (${subjects}))=${signature}`
  const statements: BatchItem<'sqlite'>[] = []
  for (const row of rows) {
    if (
      JSON.parse(row.acceptancePolicy ?? '{}').lastSharedRevision ===
      input.sharedRevisionId
    )
      continue
    const prepared = await prepareSharedFeatureAdoption(db, {
      ...input,
      action: 'staff-update',
      featureId: row.id,
      projectId: row.projectId,
      includeLocation: input.fields.includes('location'),
      guard: sql`EXISTS(SELECT 1 FROM feature f JOIN featureLocation b ON b.featureId=f.id
        WHERE f.id=${row.id} AND f.projectId=${row.projectId} AND f.isDraft=0
          AND b.locationId=${input.locationId} AND b.version=${row.version})`,
    })
    if (!prepared) throw new Error('FEATURE_CHANGED')
    statements.push(prepareRevisionCheck(db, prepared.guard), ...prepared.statements)
  }
  // Staff saves already applied these exact fields; do not manufacture a later policy review for them.
  statements.push(
    db
      .update(locationRefreshItem)
      .set({ status: 'processed' })
      .where(
        and(
          eq(locationRefreshItem.runId, `shared:${input.sharedRevisionId}`),
          eq(locationRefreshItem.locationId, input.locationId),
          eq(locationRefreshItem.origin, 'local'),
        ),
      ),
  )
  return { guard, statements, featureIds: rows.map(row => row.id) }
}

/** Replay a pending staff correction through the same atomic path used by Save.
 * @param db Primary-session database.
 * @param locationId Exact refresh subject.
 * @param revisionId Exact immutable shared correction; never resolve a later head on its behalf.
 * @returns Null for system/superseded evidence, otherwise the committed/conflicting replay result.
 * @remarks Provenance and unchanged source pins prevent staff authority from leaking into upstream updates.
 */
export async function replayStaffLocationCorrection(
  db: Database,
  locationId: string,
  revisionId: string,
): Promise<'processed' | 'conflict' | null> {
  if (!(await hasFeatureLifecycleStorage(db))) return null
  const shared = await readSharedLocationCorrection(db, locationId)
  if (!shared || shared.id !== revisionId) return null
  const provenance = JSON.parse(shared.provenance)
  if (!['staff-correction', 'location-editor'].includes(provenance.kind)) return null
  const source = await db.get<{ id: string; facts: string }>(sql`
    SELECT id,facts FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1`)
  if (!source || source.id !== shared.sourceRevisionId) return null
  const previous = await db.get<{ corrections: string }>(sql`
    SELECT p.corrections FROM locationSharedRevision r JOIN locationSharedRevision p ON p.id=r.previousRevisionId
    WHERE r.id=${revisionId}`)
  const before = JSON.parse(previous?.corrections ?? '{}')
  const after = JSON.parse(shared.corrections)
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    field => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  )
  const effective = await sharedLocationFacts(
    db,
    locationId,
    readLocationFacts(source.facts),
    revisionId,
  )
  const prepared = await prepareStaffLocationPropagation(db, {
    locationId,
    sourceRevisionId: source.id,
    sharedRevisionId: revisionId,
    actorId: shared.actorId,
    facts: effective.facts,
    fields,
  })
  const guard = sql`(${prepared.guard}) AND
    (SELECT id FROM locationSharedHead WHERE locationId=${locationId})=${revisionId} AND
    (SELECT id FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1)=${source.id} AND
    EXISTS(SELECT 1 FROM locationRefreshItem WHERE runId=${`shared:${revisionId}`} AND locationId=${locationId} AND origin='local' AND status='pending')`
  return (await executeRevisionBatch(db, guard, prepared.statements))
    ? 'processed'
    : 'conflict'
}
