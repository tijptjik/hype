// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

/** Archive a local identity if the authorized scope and reviewed revision still match.
 * @param db Request-local database.
 * @param input Persisted ownership and state, revision shown to the editor, and authenticated actor.
 * @returns The outcome of the guarded insert. The trigger retires the identity in the same statement.
 */
export async function archiveLocalLocation(
  db: Database,
  input: {
    locationId: string
    revisionId: string
    draftVersion?: string | null
    ownerOrganisationId: string | null
    state: 'manual' | 'unresolved'
    actorId: string
  },
): Promise<'deleted' | 'in-use' | 'changed' | 'migration-required'> {
  if (
    !(await db.get(
      sql`SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='location_deletion_apply'`,
    ))
  )
    return 'migration-required'

  // Recheck dependencies at write time. A concurrent Feature association must win or lose atomically.
  const referenced = sql`EXISTS(SELECT 1 FROM locationDeletionBlocker WHERE locationId=${input.locationId})`
  const receipt = await db.get<{ locationId: string }>(sql`
    INSERT INTO locationDeletion(locationId,revisionId,previousState,actorId)
    SELECT l.id,${input.revisionId},l.state,${input.actorId} FROM location l
    WHERE l.id=${input.locationId} AND l.ownerOrganisationId IS ${input.ownerOrganisationId}
      AND l.ssId IS NULL AND l.state=${input.state}
      AND (SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)=${input.revisionId}
      AND (l.ownerOrganisationId IS NOT NULL OR EXISTS(SELECT 1 FROM locationRevision
        WHERE id=${input.revisionId} AND contentHash=${input.draftVersion ?? null}))
      AND NOT (${referenced})
    RETURNING locationId`)
  if (receipt) return 'deleted'
  return (await db.get(sql`SELECT 1 WHERE ${referenced}`)) ? 'in-use' : 'changed'
}
