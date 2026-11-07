// TYPES
import type { Database } from 'bun:sqlite'
import type { MediaLocator } from './cache-media'

export type LegacyMediaOptions = {
  featureIds?: readonly string[]
  /** Explicit user-approved reason; permits empty metadata only for missing exact sidecars. */
  emptyMetadataReason?: string
}

/** Validates an explicit repair cohort before fetching or registering any image.
 * @param db Local source connection. @param options Optional scoped recovery authorization.
 * @returns Nothing; rejects broad recovery and missing Feature identities.
 */
export function validateMediaScope(db: Database, options: LegacyMediaOptions): void {
  if (
    options.emptyMetadataReason !== undefined &&
    (!options.emptyMetadataReason.trim() || !options.featureIds?.length)
  )
    throw new Error(
      'Empty metadata recovery requires explicit Feature IDs and a reason',
    )
  if (options.featureIds) {
    if (
      !options.featureIds.length ||
      new Set(options.featureIds).size !== options.featureIds.length
    )
      throw new Error('Feature scope must be nonempty and unique')
    const count = db
      .query(
        'SELECT count(*) n FROM feature WHERE id IN (SELECT value FROM json_each(?))',
      )
      .get(JSON.stringify(options.featureIds)) as { n: number }
    if (count.n !== options.featureIds.length)
      throw new Error('Feature scope contains missing identities')
  }
}

/** Reads exact image locators, optionally restricted to a Feature gallery and pending evidence.
 * @param db Local source connection. @param featureIds Validated optional Feature scope.
 * @returns Deterministically ordered locators; JSON membership uses one binding per scope.
 */
export function scopedMediaRows(
  db: Database,
  featureIds?: readonly string[],
): MediaLocator[] {
  const columns = 'SELECT id,cdn,env,publicId,version,modifiedAt,contentHash FROM image'
  if (!featureIds) return db.query(columns + ' ORDER BY id').all() as MediaLocator[]
  return db
    .query(
      columns +
        ` WHERE id IN (
    SELECT imageId FROM featureImage WHERE featureId IN (SELECT value FROM json_each(?))
    UNION SELECT ti.imageId FROM taskImage ti JOIN task t ON t.id=ti.taskId
      WHERE t.isReviewed=0 AND t.featureId IN (SELECT value FROM json_each(?))
  ) ORDER BY id`,
    )
    .all(JSON.stringify(featureIds), JSON.stringify(featureIds)) as MediaLocator[]
}
