// DRIZZLE
import { eq, and, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featureImage } from '../schema/image'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch } from './revisionBatch'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Records explicit image visibility/intent commands with the accepted Feature gallery.
 * @param db Request database.
 * @param input Authorized image assignment changes and author.
 * @returns Capture statements to wrap the existing assignment/task-evidence transaction.
 * @remarks Canonical demotion follows the existing image command. No metadata revision
 * or new attachment is inferred; those need their own immutable asset workflow.
 */
export async function prepareFeatureGalleryAssignmentCapture(
  db: Database,
  input: {
    featureId: string
    imageId: string
    actorId: string
    guard: SQL
    intent?: string
    isPublished?: boolean
  },
): Promise<Awaited<ReturnType<typeof prepareFeatureAcceptedCapture>>> {
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input,
    reason: 'Feature gallery image intent or visibility changed',
    origin: input.actorId === 'system:image-assignment' ? 'system' : 'user',
    derive: previous => {
      const content = structuredClone(previous)
      const entry = content.gallery.entries[input.imageId]
      if (!entry) throw new Error('Image is not in the accepted Feature gallery')
      if (input.intent === 'canonical')
        for (const [id, other] of Object.entries(content.gallery.entries)) {
          if (id !== input.imageId && other.intent === 'canonical') {
            other.intent = 'general'
            other.isPublished = true
          }
        }
      if (input.intent !== undefined)
        entry.intent =
          FeatureRevisionContentSchema.shape.gallery.shape.entries.valueType.shape.intent.parse(
            input.intent,
          )
      if (input.isPublished !== undefined) entry.isPublished = input.isPublished
      return content
    },
  })
  if (capture.revisionId) {
    // Explicit local intent is retained even while parent visibility hides the Feature.
    const now = new Date().toISOString()
    capture.after.unshift(
      ...(input.isPublished === undefined
        ? []
        : [
            db
              .update(featureImage)
              .set({ localIsPublished: input.isPublished })
              .where(
                and(
                  eq(featureImage.featureId, input.featureId),
                  eq(featureImage.imageId, input.imageId),
                ),
              ),
          ]),
      db
        .update(feature)
        .set({
          modifiedAt: sql`CASE WHEN modifiedAt>=${now}
        THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds') ELSE ${now} END`,
        })
        .where(eq(feature.id, input.featureId)),
    )
  }
  return capture
}

/**
 * Removes an accepted gallery membership while retaining its image, bytes and task evidence.
 * @param db Request database.
 * @param input Authorized Feature/image pair and exact image mutation scope guard.
 * @returns Removed, stale, or legacy when this identity has not entered revision storage.
 * @remarks The existing delete button calls this path for enrolled Features. It creates
 * an attributed accepted revision atomically; image deletion is not a global side effect.
 */
export async function removeAcceptedFeatureImage(
  db: Database,
  input: { featureId: string; imageId: string; actorId: string; guard: SQL },
): Promise<'removed' | 'stale' | 'legacy'> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`,
  )
  const lifecycle = await hasFeatureLifecycleStorage(db)
  if (!storage?.n && !lifecycle) return 'legacy'
  const head = await db.get(
    lifecycle
      ? sql`SELECT id FROM feature WHERE id=${input.featureId} AND currentRevisionId IS NOT NULL`
      : sql`SELECT featureId FROM featureRevisionHead WHERE featureId=${input.featureId}`,
  )
  if (!head) return 'legacy'
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input,
    reason: 'Image removed from Feature gallery',
    derive: previous => {
      if (!Object.hasOwn(previous.gallery.entries, input.imageId))
        throw new Error('Image is not in the accepted gallery')
      const content = structuredClone(previous)
      delete content.gallery.entries[input.imageId]
      content.gallery.order = content.gallery.order.filter(id => id !== input.imageId)
      return content
    },
  })
  const now = new Date().toISOString()
  const result = await executeRevisionBatch(db, input.guard, [
    ...capture.before,
    db
      .delete(featureImage)
      .where(
        and(
          eq(featureImage.featureId, input.featureId),
          eq(featureImage.imageId, input.imageId),
        ),
      ),
    db
      .update(feature)
      .set({
        modifiedAt: sql`CASE WHEN modifiedAt>=${now}
      THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds') ELSE ${now} END`,
      })
      .where(eq(feature.id, input.featureId)),
    ...capture.after,
  ])
  return result ? 'removed' : 'stale'
}
