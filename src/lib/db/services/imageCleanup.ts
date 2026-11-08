// DRIZZLE
import { and, eq, notExists, sql } from 'drizzle-orm'
// DB
import {
  featureImage,
  hub,
  image,
  organisation,
  project,
  taskImage,
} from '#lib/db/schema/index.js'
// SERVICES
import { organisationImageDeletionGuard } from './organisationImage.js'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Checks whether a persisted image still owns objects in this storage namespace.
 * @param db Request database.
 * @param asset Environment and public object identity scheduled for cleanup.
 * @returns Whether storage deletion must be skipped.
 * @remarks Call after row deletion. This check does not serialize future attachments with R2.
 */
export async function hasImageStorageReference(
  db: Database,
  asset: Pick<typeof image.$inferSelect, 'env' | 'publicId'>,
): Promise<boolean> {
  const owners = await db
    .select({ id: image.id })
    .from(image)
    .where(and(eq(image.env, asset.env), eq(image.publicId, asset.publicId)))
    .limit(1)
  return owners.length > 0
}

/**
 * Deletes an image only while no resource or evidence link references it.
 * @param db Request database.
 * @param imageId Candidate detached image identity.
 * @returns Whether this call actually deleted the row.
 * @remarks Reference checks run in the DELETE statement, avoiding a read/delete race.
 */
export async function deleteDetachedImage(
  db: Database,
  imageId: string,
): Promise<boolean> {
  const historyGuard = await organisationImageDeletionGuard(db, imageId)
  // Avatar compatibility URLs are recorded on receipts; preserve any currently selected one.
  const hasUploads = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='imageUpload'`,
  )
  const avatarGuard = hasUploads?.n
    ? sql`NOT EXISTS (
    SELECT 1 FROM imageUpload receipt JOIN user owner ON owner.image = receipt.selectedUrl
    WHERE receipt.imageId = ${imageId} AND receipt.ctxType = 'user' AND receipt.state = 'attached'
  )`
    : undefined
  // Preserve historical logos and images reattached since upload preflight, including shared task evidence.
  const deleted = await db
    .delete(image)
    .where(
      and(
        eq(image.id, imageId),
        historyGuard,
        avatarGuard,
        notExists(
          db
            .select({ id: project.id })
            .from(project)
            .where(eq(project.imageId, imageId)),
        ),
        notExists(
          db
            .select({ id: organisation.id })
            .from(organisation)
            .where(eq(organisation.imageId, imageId)),
        ),
        notExists(db.select({ id: hub.id }).from(hub).where(eq(hub.imageId, imageId))),
        notExists(
          db
            .select({ id: featureImage.imageId })
            .from(featureImage)
            .where(eq(featureImage.imageId, imageId)),
        ),
        notExists(
          db
            .select({ id: taskImage.imageId })
            .from(taskImage)
            .where(eq(taskImage.imageId, imageId)),
        ),
      ),
    )
    .returning({ id: image.id })
  return deleted.length > 0
}
