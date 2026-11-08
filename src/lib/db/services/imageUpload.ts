// IMAGE INTENT POLICY
import {
  readFeatureImageIntentPolicy,
  resolvePolicyImageIntent,
} from './imageIntentPolicy'
// DRIZZLE
import { and, eq, exists, sql } from 'drizzle-orm'
// DB
import {
  feature,
  featureImage,
  image,
  organisation,
  project,
  task,
  taskImage,
} from '#lib/db/schema/index.js'
import { getUploadedImageId } from './image.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import { prepareTaskEvidenceRevision } from './taskEvidenceRevision.js'
import { taskFeatureScopeCondition } from './task-scope.js'
// ENUMS
import { ImageContextResource } from '#lib/enums.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  FeatureImageDB,
  ImageDB,
  ImageNewWithFeature,
} from '#lib/db/zod/schema/image.types.js'

export type FeatureImageCreationScope = {
  projectId: string
  organisationId: string
  hubId: string | null
}

/**
 * Captures the Feature ancestry used to authorize image creation.
 * @param db Request database.
 * @param featureId Target Feature identity.
 * @returns Canonical parent identities, or null for missing ancestry.
 */
export async function getFeatureImageCreationScope(
  db: Database,
  featureId: string,
): Promise<FeatureImageCreationScope | null> {
  const [scope] = await db
    .select({
      projectId: sql<string>`${project.id}`.as('projectId'),
      organisationId: sql<string>`${organisation.id}`.as('organisationId'),
      hubId: organisation.hubId,
    })
    .from(feature)
    .innerJoin(project, eq(project.id, feature.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .where(eq(feature.id, featureId))
    .limit(1)
  return scope ?? null
}

/**
 * Commits a verified Feature upload and all evidence links under live task guards.
 * @param db Request database.
 * @param data Verified image metadata; the storage identity arbitrates retries.
 * @param taskIds Complete set of requested task associations.
 * @param draftContributorId Contributor identity when access comes only from owning a draft.
 * @param newImageId Fresh server-generated identity for non-upload creation; omit for upload replay.
 * @param expectedScope Parent identities captured before request authorization.
 * @returns Persisted image/assignment, or null when the context changed before persistence.
 * @remarks One D1 batch rolls back every write on failure. Retried rows preserve existing
 * moderation state. JSON-bound task identities keep every statement within D1's parameter budget.
 */
export async function createUploadedFeatureImage(
  db: Database,
  data: ImageNewWithFeature,
  taskIds: string[],
  draftContributorId?: string,
  newImageId?: string,
  expectedScope?: FeatureImageCreationScope,
): Promise<{ image: ImageDB; featureImage: FeatureImageDB } | null> {
  if (data.ctxType !== ImageContextResource.feature || !data.ctxId)
    throw new Error('Feature upload requires a Feature context')
  if (draftContributorId && !taskIds.length) return null
  const featureId = data.ctxId
  const policy = await readFeatureImageIntentPolicy(db, featureId)
  const assignment = resolvePolicyImageIntent(
    policy,
    data.featureImage?.intent ?? 'undefined',
    !taskIds.length && !draftContributorId && policy.autoPublishUnclassified,
  )
  const id = newImageId ?? (await getUploadedImageId(data))
  const requested = JSON.stringify([...new Set(taskIds)])
  const target = db
    .select({ id: feature.id })
    .from(feature)
    .innerJoin(project, eq(project.id, feature.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .where(
      and(
        eq(feature.id, featureId),
        expectedScope ? eq(project.id, expectedScope.projectId) : undefined,
        expectedScope ? eq(organisation.id, expectedScope.organisationId) : undefined,
        expectedScope
          ? sql`${organisation.hubId} IS ${expectedScope.hubId}`
          : undefined,
      ),
    )
  const allowedTask = db
    .select({ id: task.id })
    .from(task)
    .where(
      and(
        sql`${task.id} = requested.value`,
        eq(task.featureId, featureId),
        eq(task.isReviewed, false),
        taskFeatureScopeCondition(),
        draftContributorId ? eq(task.isDraft, true) : undefined,
        draftContributorId ? eq(task.contributorId, draftContributorId) : undefined,
      ),
    )
  const guard = sql`(${policy.guard}) AND ${exists(target)} AND NOT EXISTS (
    SELECT 1 FROM json_each(${requested}) AS requested WHERE NOT ${exists(allowedTask)}
  )`
  const storedImage = db
    .select()
    .from(image)
    .where(
      and(
        eq(image.id, id),
        eq(image.publicId, data.publicId),
        eq(image.env, data.env),
        eq(image.isArchived, false),
        draftContributorId ? eq(image.contributorId, draftContributorId) : undefined,
      ),
    )
  const storedAssignment = db
    .select()
    .from(featureImage)
    .where(and(eq(featureImage.imageId, id), eq(featureImage.featureId, featureId)))
  const completeLinks = sql`NOT EXISTS (
    SELECT 1 FROM json_each(${requested}) AS requested
    WHERE NOT EXISTS (SELECT 1 FROM taskImage WHERE taskId=requested.value AND imageId=${id})
  )`

  // Validate before any write, then prove every association exists before committing the batch.
  const result = await executeRevisionBatch(db, guard, [
    db
      .insert(image)
      .values({ ...data, id })
      .onConflictDoNothing({ target: image.id }),
    prepareRevisionCheck(db, exists(storedImage)),
    db
      .insert(featureImage)
      .values({
        ...data.featureImage,
        ...assignment,
        isPublished: !taskIds.length && !draftContributorId && assignment.isPublished,
        imageId: id,
        featureId,
      })
      .onConflictDoNothing({ target: [featureImage.featureId, featureImage.imageId] }),
    // A new evidence link invalidates review snapshots; a replay must not change the revision.
    ...prepareTaskEvidenceRevision(
      db,
      and(
        sql`${task.id} IN (SELECT value FROM json_each(${requested}))`,
        sql`NOT EXISTS (SELECT 1 FROM taskImage WHERE taskId=${task.id} AND imageId=${id})`,
      )!,
    ),
    db
      .insert(taskImage)
      .select(
        db
          .select({
            taskId: sql<string>`CAST(value AS TEXT)`.as('taskId'),
            imageId: sql<string>`${id}`.as('imageId'),
          })
          .from(sql`json_each(${requested})`)
          .where(sql`1`),
      )
      .onConflictDoNothing({ target: [taskImage.taskId, taskImage.imageId] }),
    prepareRevisionCheck(
      db,
      and(guard, exists(storedImage), exists(storedAssignment), completeLinks)!,
    ),
    storedImage,
    storedAssignment,
  ])
  if (!result) return null
  return {
    image: (result.at(-2) as ImageDB[])[0],
    featureImage: (result.at(-1) as FeatureImageDB[])[0],
  }
}
