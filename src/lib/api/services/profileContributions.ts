// DRIZZLE
import { and, eq, inArray, or } from 'drizzle-orm'
// DB
import { feature, featureImage, image, task, taskImage } from '#lib/db/schema/index.js'
// SERVICES
import { toUserContributionFeatureScope } from './user'
import { taskFeatureScopeCondition } from '#lib/db/services/task-scope.js'
import { getContributionStatus } from '#lib/contributions/profile.js'
import { ImageListProfileAPI } from '#lib/db/zod/schema/image.js'
// TYPES
import type { PrivateContributionDetails } from '#lib/contributions/profile.js'
import type { Database, Prisms, SessionUser } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

/**
 * Loads a contributor's own nonpublic previews without widening general resource reads.
 * @param db Request database.
 * @param params Server-resolved viewer, hub and selected map scope.
 * @returns Minimal feature labels and image thumbnails with persisted review status.
 * @remarks Only the authenticated contributor can receive these previews. Drafts and
 * unrelated archived content are excluded; rejected submissions remain visible to their author.
 */
export async function loadPrivateContributions(
  db: Database,
  params: {
    sessionUser: SessionUser
    prisms?: Prisms
    hubOpts?: Partial<HubOptsExtended> | null
  },
): Promise<PrivateContributionDetails> {
  const result: PrivateContributionDetails = { features: {}, images: {} }
  if (params.sessionUser.isAnonymous) return result
  // Personal previews obey the same live-parent, hub and prism scope as public contributions.
  const scope = toUserContributionFeatureScope(db, {
    ...params,
    isAdminRequest: false,
    includeOwnUnpublished: true,
  })
  const features = await db.query.feature.findMany({
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    where: and(
      inArray(feature.id, scope),
      eq(feature.contributorId, params.sessionUser.id),
    ),
    columns: {
      id: true,
      projectId: true,
      createdAt: true,
      isPublished: true,
      isArchived: true,
      isPendingReview: true,
    },
    with: {
      i18n: { columns: { locale: true, title: true, displayAddress: true } },
      tasks: {
        where: and(
          eq(task.type, 'newFeature'),
          eq(task.isDraft, false),
          eq(task.contributorId, params.sessionUser.id),
          taskFeatureScopeCondition(),
        ),
        orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
      },
    },
  })
  for (const row of features) {
    const status = getContributionStatus({ ...row, review: row.tasks[0] })
    if (status === 'published' || (row.isArchived && status !== 'rejected')) continue
    const translation =
      row.i18n.find(value => value.locale === params.sessionUser.locale) ??
      row.i18n.find(value => value.locale === 'en') ??
      row.i18n[0]
    result.features[row.id] = {
      id: row.id,
      projectId: row.projectId,
      createdAt: row.createdAt,
      title: translation?.title ?? row.id,
      address: translation?.displayAddress ?? null,
      status,
    }
  }
  // Include both assigned images and task-only uploads; use subqueries instead of unbounded ID parameters.
  const scopedTasks = db
    .select({ id: task.id })
    .from(task)
    .where(
      and(
        inArray(task.featureId, scope),
        eq(task.contributorId, params.sessionUser.id),
        eq(task.isDraft, false),
        taskFeatureScopeCondition(),
      ),
    )
  const assigned = db
    .select({ id: featureImage.imageId })
    .from(featureImage)
    .where(inArray(featureImage.featureId, scope))
  const submitted = db
    .select({ id: taskImage.imageId })
    .from(taskImage)
    .where(inArray(taskImage.taskId, scopedTasks))
  const images = await db.query.image.findMany({
    where: and(
      eq(image.contributorId, params.sessionUser.id),
      or(inArray(image.id, assigned), inArray(image.id, submitted)),
    ),
    with: {
      featureImages: {
        where: inArray(featureImage.featureId, scope),
        with: {
          feature: {
            columns: { id: true, projectId: true, isPublished: true, isArchived: true },
          },
        },
      },
      taskImages: {
        where: inArray(taskImage.taskId, scopedTasks),
        with: { task: true },
      },
    },
  })
  for (const row of images) {
    const review = row.taskImages
      .map(value => value.task)
      .sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0]
    const assignment =
      row.featureImages.find(
        value =>
          value.isPublished && value.feature.isPublished && !value.feature.isArchived,
      ) ?? row.featureImages[0]
    const status = getContributionStatus({
      isPublished: Boolean(
        assignment?.isPublished &&
          assignment.feature.isPublished &&
          !assignment.feature.isArchived,
      ),
      isArchived: row.isArchived,
      isRejectedByPartialReview:
        row.isArchived && review?.reviewAction === 'added-all-photos-with-intent',
      review,
    })
    if (status === 'published' || (row.isArchived && status !== 'rejected')) continue
    const projectId = assignment?.feature.projectId ?? review?.projectId
    const featureId = assignment?.featureId ?? review?.featureId
    if (!projectId || !featureId) continue
    result.images[row.id] = {
      projectId,
      featureId,
      status,
      image: ImageListProfileAPI.parse(row),
    }
  }
  return result
}
