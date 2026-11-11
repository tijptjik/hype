// SERVICES
import {
  hasFeatureLifecycleStorage,
  readCurrentFeatureRevision,
  saveFeatureEdit,
} from './featureLifecycle'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/** Route archive and restore through attributed accepted history.
 * @param db Request database.
 * @param input Authorized identity, actor, scope fence and requested archive state.
 * @returns Legacy routing, successful update, or stale evidence.
 * @remarks Retired split/merge sources cannot be restored by this ordinary toggle.
 */
export async function routeFeatureRevisionArchive(
  db: Database,
  input: { featureId: string; actorId: string; state: boolean; guard: SQL },
): Promise<'legacy' | 'updated' | 'stale'> {
  if (!(await hasFeatureLifecycleStorage(db))) return 'legacy'
  const current = await readCurrentFeatureRevision(db, input)
  if (!current) return 'stale'
  if (current.retired) throw new Error('Retired Feature history is read-only')
  if (current.state.isArchived === input.state) return 'updated'
  // Persist the archive state and its attributed revision in the same transaction.
  return (await saveFeatureEdit(db, {
    ...input,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    state: { isArchived: input.state },
    derive: content => content,
    validate: () => [],
    reason: input.state ? 'Feature archived' : 'Feature restored',
  }))
    ? 'updated'
    : 'stale'
}
