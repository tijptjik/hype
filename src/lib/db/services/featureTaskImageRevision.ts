// IMAGE INTENT POLICY
import {
  readFeatureImageIntentPolicy,
  resolvePolicyImageIntent,
} from './imageIntentPolicy'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureImage } from '../schema/image'
// SERVICES
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Reviews legacy task evidence already included in an enrolled Feature's verified gallery baseline.
 * @param db Request database.
 * @param input Reviewer scope, exact task images and explicit review action.
 * @returns Capture statements enclosing the task/gallery transaction, preserving immutable media.
 * @remarks New uploads use independent proposals. This path handles only retained legacy task
 * evidence; missing gallery pins cannot be invented during task acceptance.
 */
export async function prepareLegacyFeatureTaskImageReview(
  db: Database,
  input: {
    featureId: string
    taskId: string
    actorId: string
    guard: SQL
    action: 'acceptAll' | 'acceptClassified' | 'reject'
    rows: { imageId: string; featureId: string | null; intent: string | null }[]
  },
): Promise<Awaited<ReturnType<typeof prepareFeatureAcceptedCapture>>> {
  const policy = await readFeatureImageIntentPolicy(db, input.featureId)
  const ids = JSON.stringify(input.rows.map(row => row.imageId))
  const published: string[] = []
  let inputGuard: SQL = sql`1`
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input,
    revisionBoundary: true,
    reason: 'Legacy photo task reviewed',
    derive: async previous => {
      const content = structuredClone(previous)
      const shared = await db.all<{ imageId: string; taskId: string }>(sql`
        SELECT ti.imageId,ti.taskId FROM taskImage ti JOIN task t ON t.id=ti.taskId
        WHERE t.featureId=${input.featureId} AND ti.taskId<>${input.taskId}
          AND ti.imageId IN (SELECT value FROM json_each(${ids})) ORDER BY ti.imageId,ti.taskId`)
      const sharedIds = new Set(shared.map(row => row.imageId))
      // Another task may gain or release the same photo after review; fence that exact relation set.
      inputGuard = sql`(SELECT json_group_array(json_object('imageId',imageId,'taskId',taskId)) FROM (
        SELECT ti.imageId,ti.taskId FROM taskImage ti JOIN task t ON t.id=ti.taskId
        WHERE t.featureId=${input.featureId} AND ti.taskId<>${input.taskId}
          AND ti.imageId IN (SELECT value FROM json_each(${ids})) ORDER BY ti.imageId,ti.taskId))=${JSON.stringify(shared)}`
      for (const row of input.rows) {
        const entry = content.gallery.entries[row.imageId]
        const intent = row.intent ?? 'undefined'
        const assignment = resolvePolicyImageIntent(
          policy,
          intent,
          input.action === 'acceptAll',
        )
        const accept =
          input.action !== 'reject' &&
          assignment.isPublished &&
          (input.action === 'acceptAll' || intent !== 'undefined')
        const remove =
          input.action === 'reject' ||
          (input.action === 'acceptClassified' && intent === 'undefined')
        if (accept) {
          if (!entry || row.featureId !== input.featureId)
            throw new Error('Task photo requires a verified Feature gallery revision')
          if (entry.intent === 'canonical')
            for (const [id, other] of Object.entries(content.gallery.entries))
              if (id !== row.imageId && other.intent === 'canonical') {
                other.intent = 'general'
                other.isPublished = true
              }
          Object.assign(entry, assignment)
          published.push(row.imageId)
        } else if (remove && !sharedIds.has(row.imageId) && entry) {
          delete content.gallery.entries[row.imageId]
          content.gallery.order = content.gallery.order.filter(id => id !== row.imageId)
        }
      }
      return content
    },
  })
  capture.before.unshift(prepareRevisionCheck(db, policy.guard))
  if (capture.revisionId) {
    capture.before.push(prepareRevisionCheck(db, inputGuard))
    if (published.length)
      capture.after.unshift(
        db
          .update(featureImage)
          .set({ localIsPublished: true })
          .where(
            and(
              eq(featureImage.featureId, input.featureId),
              sql`imageId IN (SELECT value FROM json_each(${JSON.stringify(published)}))`,
            ),
          ),
      )
  }
  return capture
}
