// ═══════════════════════
// TABLE OF CONTENTS
// 1. LOCK READS AND REVISION FENCES
// 2. SUPERADMIN LOCK ADMINISTRATION
// ---
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { CurationOpenFieldsSchema } from '#lib/locations/curationLocks.js'
// SCHEMA
import { locationCurationLockRevision } from '../schema/locationCurationLocks'
// SERVICES
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { CurationLocks, CurationOpenFields } from '#lib/locations/curationLocks.js'

/** Read current lock controls without changing older unmigrated installations.
 * @param db Request database. @param locationId Community Location identity.
 * @returns Immutable head and boolean openness; absent keys are open.
 */
export async function readLocationCurationLocks(
  db: Database,
  locationId: string,
): Promise<CurationLocks> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='locationCurationLockRevision'`,
  )
  if (!storage?.n) return { revision: null, openFields: {}, available: false }
  const row = await db.get<{ id: string; openFields: string }>(
    sql`SELECT id,openFields FROM locationCurationLockHead WHERE locationId=${locationId}`,
  )
  return {
    revision: row?.id ?? null,
    openFields: CurationOpenFieldsSchema.parse(JSON.parse(row?.openFields ?? '{}')),
    available: true,
  }
}

/** Fence edits against a lock change between preparation and commit.
 * @param locationId Location identity. @param locks Previously read head.
 * @returns SQL assertion used inside the same atomic community-write batch.
 */
export function locationCurationLockFence(
  locationId: string,
  locks: CurationLocks,
): SQL {
  return locks.available
    ? sql`(SELECT id FROM locationCurationLockHead WHERE locationId=${locationId}) IS ${locks.revision}`
    : sql`NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='locationCurationLockRevision')`
}

/** Append a SuperAdmin's lock decision without rewriting curations or earlier lock history.
 * @param db Request database. @param input Authenticated role, expected head and complete boolean controls.
 * @returns New immutable head, or null on a concurrent change.
 * @remarks Role is resolved server-side; being a community editor does not grant lock administration.
 */
export async function saveLocationCurationLocks(
  db: Database,
  input: {
    locationId: string
    expectedRevision: string | null
    openFields: CurationOpenFields
    actorId: string
    superAdmin: boolean
  },
): Promise<CurationLocks | null> {
  if (!input.superAdmin || !input.actorId)
    throw new Error('CURATION_LOCK_SUPERADMIN_REQUIRED')
  const fields = CurationOpenFieldsSchema.parse(input.openFields)
  const current = await readLocationCurationLocks(db, input.locationId)
  if (!current.available) throw new Error('CURATION_LOCK_STORAGE_UNAVAILABLE')
  if (current.revision !== input.expectedRevision) return null
  const guard = sql`(${locationCurationLockFence(input.locationId, current)}) AND EXISTS(SELECT 1 FROM location WHERE id=${input.locationId} AND state IN ('linked','unresolved'))`
  const id = crypto.randomUUID()
  // Lock administration commits atomically with its expected-head check.
  const saved = await executeRevisionBatch(db, guard, [
    db.insert(locationCurationLockRevision).values({
      id,
      locationId: input.locationId,
      previousRevisionId: current.revision,
      openFields: fields,
      actorId: input.actorId,
      createdAt: new Date().toISOString(),
    }),
  ])
  return saved ? { revision: id, openFields: fields, available: true } : null
}
