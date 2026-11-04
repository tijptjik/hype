// DRIZZLE
import { and, eq, exists, notExists } from 'drizzle-orm'
// DB
import { featureImage, image, task, taskImage } from '#lib/db/schema/index.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import { prepareTaskEvidenceRevision } from './taskEvidenceRevision.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Deletes an image and its links while invalidating pending evidence snapshots.
 * @param db Request database.
 * @param imageId Authorized image identity.
 * @param guard Optional image/scope snapshot guard captured before authorization.
 * @returns Whether deletion committed; false for a missing target or skipped write.
 * @remarks Revisions advance before links disappear, within the same transaction.
 * Storage cleanup must only be scheduled after a successful commit.
 */
export async function deleteImageWithEvidence(
  db: Database,
  imageId: string,
  guard?: SQL,
): Promise<boolean> {
  const current = db.select({ id: image.id }).from(image).where(eq(image.id, imageId))
  const evidence = db
    .select({ id: taskImage.taskId })
    .from(taskImage)
    .where(eq(taskImage.imageId, imageId))
  const assignments = db
    .select({ id: featureImage.imageId })
    .from(featureImage)
    .where(eq(featureImage.imageId, imageId))
  const affected = exists(
    db
      .select({ id: taskImage.taskId })
      .from(taskImage)
      .where(and(eq(taskImage.imageId, imageId), eq(taskImage.taskId, task.id))),
  )
  // A skipped deletion or revision update rolls back all links and earlier revisions.
  const result = await executeRevisionBatch(db, and(exists(current), guard)!, [
    ...prepareTaskEvidenceRevision(db, affected),
    db.delete(taskImage).where(eq(taskImage.imageId, imageId)),
    db.delete(featureImage).where(eq(featureImage.imageId, imageId)),
    db.delete(image).where(eq(image.id, imageId)),
    prepareRevisionCheck(
      db,
      and(notExists(current), notExists(evidence), notExists(assignments))!,
    ),
  ])
  return result !== null
}
