// IMAGE INTENT POLICY
import {
  readFeatureImageIntentPolicy,
  resolvePolicyImageIntent,
} from './imageIntentPolicy'
// INDEX SEARCH
import { taskIndexSearchCondition } from './taskIndexFilters.js'
// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, asc, desc, eq, ne, or, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  featureI18n,
  feature,
  image,
  featureImage,
  hub,
  organisation,
  project,
  task,
  taskImage,
} from '#lib/db/schema/index.js'
// CRUD
import { update, del } from '../crud'
// SERVICES
import { getProjectForFeatureId } from './project'
import { getOrganisationForProjectId } from './organisation'
import { getTaskHubFilter } from './hub'
import {
  taskSubmissionScopeCondition,
  taskFeatureScopeCondition,
  taskLifecycleScopeCondition,
} from './task-scope'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import {
  prepareFeatureUploadSubmission,
  prepareFeatureUploadTaskRejection,
} from './featureUploadTasks'
import { prepareLegacyFeatureTaskImageReview } from './featureTaskImageRevision'
import { prepareInitialFeatureSubmission } from './featureInitialDraft'
import { reviewInitialFeatureContribution } from './featureInitialReview'
import { featureRevisionCreationEnabled } from './featureCreationRevision'
import {
  featureUploadEvidenceSource,
  hasFeatureTaskTransfer,
} from './featureUploadEvidence'
import { hasFeatureRevisionHead } from './featureImageUploadRevision'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { applyTaskUploadEvidence } from './featureUploadRead'
import { uploadAndProcessImage } from '#lib/client/services/image.js'
// FEATURE
// ENUMS
import { ImageContextResource } from '#lib/enums.js'
// DB
import { firstOrNull, toOrderByWithLocalizedFields } from '..'
// TYPES
import type { Database, Id, ListResponse, Locale, QueryParams } from '#lib/types.js'
import type {
  TaskDB,
  TaskDBRaw,
  TaskDBPartial,
  TaskNew,
} from '#lib/db/zod/schema/task.types.js'
import type {
  TaskFeatureReviewCommit,
  TaskReviewCommitContext,
} from '#lib/db/services/taskReview.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type { Image, ImageUploadCtx } from '#lib/db/zod/schema/image.types.js'
// API SERVICES
import { createUserContributedFeatureTask } from '#lib/api/services/feature.js'
import type { UserContributedFeature } from '#lib/db/zod/schema/feature.types.js'
// TYPES
import type {
  BaseTaskData,
  NewFeatureTask,
} from '#lib/api/services/taskCreation.types.js'
import type { FeatureDB } from '#lib/db/zod/schema/feature.types.js'

// Specific task types
type ReportedMissingTask = BaseTaskData & {
  type: 'reportedMissing'
  featureId: Id
  message?: string
}

type NewPhotoTask = BaseTaskData & {
  type: 'newPhoto'
  featureId: Id
}

// Union type for all task creation APIs
type TaskCreation = NewFeatureTask | ReportedMissingTask | NewPhotoTask

/* ----------------- */
// TASKS
/* -------- */

type TaskImageReviewStatement = Parameters<Database['batch']>[0][number]

type TaskImageReviewRow = {
  imageId: string
  intent: string | null
  featureId: string | null
}

type TaskImageReviewPlan = {
  statements: TaskImageReviewStatement[]
  processedCount: number
}

type TaskImageReviewCommit = TaskReviewCommitContext & {
  action: 'reject' | 'acceptAll' | 'acceptClassified'
}

type TaskFeatureDraftFinalizationCommit = {
  task: Pick<TaskDB, 'id' | 'featureId' | 'contributorId' | 'modifiedAt'>
  feature: Pick<FeatureDB, 'id' | 'modifiedAt'>
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listTasks
//    - getTask
//    - probeTaskQuery
//    - createTask
//    - updateTask
//
// 2. CRUD :: IMAGE HANDLING
//    - archiveImages
//    - publishImages
//    - commitTaskImageReview
//    - commitTaskFeatureReview
//    - commitTaskFeatureDraftFinalization
//    - commitTaskDraftFinalization
//    - taskDraftFinalizationCondition
//    - taskReviewPendingCondition
//    - prepareTaskImageArchives
//    - prepareTaskImagePublications
//
// 3. CRUD :: ORCHESTRATION
//    - createTaskWithDependencies
//    - processTaskImages
//
// 4. UTILS :: HELPERS
//    - addContributorId
//    - getImagesFromFormData
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

/**
 * Lists tasks from the database
 * @param db - The database instance
 * @param withRelations - Relations to include
 * @param conditions - Query conditions
 * @param opts - Hub filtering options
 * @returns Array of tasks
 */
export const listTasks = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: {
    q?: string
    filtersToApply?: QueryParams
    locale?: Locale
  },
): Promise<ListResponse<TaskDBRaw>> => {
  const startedAt = Date.now()

  // Stored task scopes must agree with the feature before related data is hydrated.
  const scopedConditions = [...conditions, await taskLifecycleScopeCondition(db)]
  const hubFilter = getTaskHubFilter(db, opts)
  if (hubFilter) {
    scopedConditions.push(hubFilter)
  }

  // Search the same related text for both the stored and live task queues.
  if (query?.q) scopedConditions.push(taskIndexSearchCondition(query.q))

  const sortBy = sorting?.sortBy || 'modifiedAt'
  const sortOrder = sorting?.sortOrder || 'desc'
  const orderBy =
    sortBy === 'title'
      ? toOrderByWithLocalizedFields({
          db,
          locale: query?.locale,
          sortBy,
          sortOrder,
          fallbackColumn: task.modifiedAt,
          baseTable: task,
          localizedSortColumns: {
            title: featureI18n.title,
          },
          i18nTable: featureI18n,
          parentIdColumn: task.featureId,
          foreignKeyColumn: featureI18n.featureId,
          localeColumn: featureI18n.locale,
        })
      : [
          sortOrder === 'asc'
            ? asc(
                (task[sortBy as keyof typeof task] as
                  | typeof task.modifiedAt
                  | undefined) ?? task.modifiedAt,
              )
            : desc(
                (task[sortBy as keyof typeof task] as
                  | typeof task.modifiedAt
                  | undefined) ?? task.modifiedAt,
              ),
          desc(task.modifiedAt),
        ]

  const whereClause = scopedConditions.length > 0 ? and(...scopedConditions) : undefined
  const data = await db.query.task.findMany({
    with: withRelations,
    where: whereClause,
    limit: pagination?.limit,
    offset: pagination?.offset,
    orderBy,
  })

  const countQuery = db.select({ count: sql<number>`count(*)` }).from(task)
  const totalRows = whereClause ? await countQuery.where(whereClause) : await countQuery
  const totalCount = Number(totalRows[0]?.count || 0)
  const offset = pagination?.offset ?? 0
  const hasMore = offset + data.length < totalCount
  const nextOffset = hasMore ? offset + data.length : null
  const durationMs = Date.now() - startedAt

  return {
    data: await applyTaskUploadEvidence(db, data as TaskDBRaw[]),
    limit: pagination?.limit,
    offset,
    totalCount,
    hasMore,
    nextOffset,
    sortBy,
    sortOrder,
    appliedFilters: query?.filtersToApply,
    q: query?.q,
    durationMs,
  }
}

/**
 * Gets a single task from the database
 * @param db - The database instance
 * @param withRelations - Relations to include
 * @param conditions - Query conditions
 * @param opts - Hub filtering options
 * @returns Single task or undefined
 */
export const loadTask = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended,
): Promise<TaskDBRaw | undefined> => {
  // Apply hub filtering - always needed as some resources are hub-exclusive
  const hubFilter = getTaskHubFilter(db, opts)
  if (hubFilter) {
    conditions = [...conditions, hubFilter]
  }

  const row = (await db.query.task.findFirst({
    with: withRelations,
    where: and(...conditions, await taskLifecycleScopeCondition(db)),
  })) as TaskDBRaw | undefined
  return row ? (await applyTaskUploadEvidence(db, [row]))[0] : undefined
}

/**
 * Probes minimal task fields required for read authorization decisions.
 * Used to evaluate access before hydrating the full task relation graph.
 * @param db Database handle.
 * @param params Task identifier to probe.
 * @returns Scope-consistent authorization fields, or null for missing/inconsistent tasks.
 */
export const probeTaskQuery = async (
  db: Database,
  params: { ref: string },
): Promise<{
  id: string
  organisationId: string
  projectId: string
  isReviewed: boolean
  resourceHubId: string | null
} | null> => {
  return firstOrNull(
    await db
      .select({
        id: task.id,
        organisationId: task.organisationId,
        projectId: task.projectId,
        isReviewed: task.isReviewed,
        resourceHubId: organisation.hubId,
      })
      .from(task)
      .innerJoin(organisation, eq(task.organisationId, organisation.id))
      .where(and(eq(task.id, params.ref), await taskLifecycleScopeCondition(db)))
      .limit(1),
  )
}

/**
 * Creates a new task in the database
 * @param db - The database instance
 * @param data - The task data to create
 * @returns The created task
 * @throws {Error} If task creation fails
 * @remarks Scope validation and insertion share a transaction so reparenting cannot
 * create a task under the former project or organisation.
 */
export const createTask = async (db: Database, data: TaskNew): Promise<TaskDB> => {
  // Validate live ancestry before inserting within the same D1 transaction.
  const result = await executeRevisionBatch(db, taskSubmissionScopeCondition(data), [
    db.insert(task).values(data).returning(),
  ])
  if (!result) throw error(400, 'TASK_FEATURE_SCOPE_MISMATCH')
  const created = (result[0] as TaskDB[])[0]
  if (!created) throw error(404, 'Task creation failed')
  return created
}

/**
 * Updates an existing task in the database
 * @param db - The database instance
 * @param data - The updated task data
 * @param ref - The ID of the task to update
 * @returns The updated task
 * @throws {Error} If task update fails
 */
export const updateTask = async (
  db: Database,
  data: TaskDBPartial,
  ref: Id,
): Promise<TaskDB> => await update(db, task, data, task.id, ref)

/**
 * Deletes a task from the database
 * @param db - The database instance
 * @param ref - The ID of the task to delete
 * @returns The result of the operation
 * @throws {Error} If task deletion fails
 */
export const deleteTask = async (db: Database, ref: Id): Promise<TaskDB> =>
  await del(db, task, task.id, ref)

// ═══════════════════════
// 2. CRUD :: IMAGE HANDLING
// ═══════════════════════

/**
 * Loads task images with feature-image state scoped to the task's owning feature.
 * @param db - The database instance
 * @param taskId - The task identifier
 * @returns Task image review rows
 */
const loadTaskImageReviewRows = async (
  db: Database,
  taskId: string,
): Promise<TaskImageReviewRow[]> =>
  await db
    .select({
      imageId: taskImage.imageId,
      intent: featureImage.intent,
      featureId: task.featureId,
    })
    .from(taskImage)
    .leftJoin(task, eq(taskImage.taskId, task.id))
    .leftJoin(
      featureImage,
      and(
        eq(taskImage.imageId, featureImage.imageId),
        eq(featureImage.featureId, task.featureId),
      ),
    )
    .where(eq(taskImage.taskId, taskId))

/**
 * Builds a demotion statement to batch with the new canonical assignment.
 * @param db - The database instance
 * @param featureId - The feature receiving the canonical image
 * @param nextCanonicalImageId - The image that should remain canonical
 * @param guard - Optional write-time review guard
 * @returns An unexecuted update statement for an atomic publication batch.
 */
const buildCompetingCanonicalDemotion = (
  db: Database,
  featureId: string,
  nextCanonicalImageId: string,
  guard?: SQL<unknown>,
) => {
  // Canonical intent is exclusive per feature.
  return db
    .update(featureImage)
    .set({
      intent: 'general',
      isPublished: true,
      localIsPublished: true,
    })
    .where(
      and(
        eq(featureImage.featureId, featureId),
        eq(featureImage.intent, 'canonical'),
        ne(featureImage.imageId, nextCanonicalImageId),
        guard,
      ),
    )
}

/**
 * Prepares archival of images associated with a task, optionally only those with undefined intent.
 * This is used to archive (some) images of a task which was (partially) rejected.
 * @param db - The database instance
 * @param taskId - The ID of the task
 * @param isUndefinedOnly - Whether to only archive images with undefined intent
 * @param guard - Optional write-time review guard
 * @param rows - Optional shared review snapshot
 * @returns Unexecuted statements and the selected image count
 * @remarks Shared uses remain intact; the caller owns the transaction.
 * @throws {Error} If archiving fails
 */
const prepareTaskImageArchives = async (
  db: Database,
  taskId: string,
  isUndefinedOnly: boolean = false,
  guard?: SQL<unknown>,
  rows?: TaskImageReviewRow[],
): Promise<TaskImageReviewPlan> => {
  try {
    const taskImages = rows ?? (await loadTaskImageReviewRows(db, taskId))

    // Missing feature assignments have null intent and are also unclassified.
    // Filter images based on isUndefinedOnly parameter.
    const imagesToProcess = isUndefinedOnly
      ? taskImages.filter(ti => (ti.intent ?? 'undefined') === 'undefined')
      : taskImages

    const storage = guard
      ? await db.get<{ n: number }>(
          sql`SELECT count(*) n FROM sqlite_master WHERE name='imageRevision' AND type='table'`,
        )
      : null
    // Prepare every image change before committing the archival operation atomically.
    const statements = imagesToProcess.flatMap(ti => {
      // Prepare the image update so removal and archival can commit together;
      // evaluate remaining references at write time, after the scoped removal.
      const archival = db
        .update(image)
        .set({ isArchived: true })
        .where(
          and(
            eq(image.id, ti.imageId),
            guard,
            storage?.n
              ? sql`NOT EXISTS (SELECT 1 FROM imageRevision WHERE imageId=${image.id})`
              : undefined,
            sql`not exists (select 1 from ${featureImage} where ${featureImage.imageId} = ${image.id})`,
            sql`not exists (select 1 from ${project} where ${project.imageId} = ${image.id})`,
            sql`not exists (select 1 from ${organisation} where ${organisation.imageId} = ${image.id})`,
            sql`not exists (select 1 from ${hub} where ${hub.imageId} = ${image.id})`,
            sql`not exists (select 1 from ${taskImage} where ${taskImage.imageId} = ${image.id} and ${taskImage.taskId} <> ${taskId})`,
          ),
        )
      // Delete the feature image association only if no other task shares it.
      if (ti.featureId) {
        return [
          db.delete(featureImage).where(
            and(
              eq(featureImage.imageId, ti.imageId),
              eq(featureImage.featureId, ti.featureId),
              guard,
              sql`not exists (
                  select 1 from ${taskImage}
                  inner join ${task} on ${task.id} = ${taskImage.taskId}
                  where ${taskImage.imageId} = ${featureImage.imageId}
                    and ${task.featureId} = ${featureImage.featureId}
                    and ${taskImage.taskId} <> ${taskId}
                )`,
            ),
          ),
          archival,
        ]
      } else {
        // Update image record when no feature association remains to remove.
        return [archival]
      }
    })
    return { statements, processedCount: imagesToProcess.length }
  } catch (error) {
    console.error('Failed to archive images:', error)
    throw error
  }
}

/**
 * Prepares publication of images associated with a task, optionally skipping undefined intent.
 * This is used to publish images of a task which was (partially) accepted.
 * @param db - The database instance
 * @param taskId - The ID of the task
 * @param skipUndefined - Whether to skip images with undefined intent
 * @param publisherId - Reviewer responsible for publishing the selected images
 * @param guard - Optional write-time review guard
 * @param rows - Optional shared review snapshot
 * @returns Unexecuted statements and the selected image count
 * @remarks The caller owns the publication and canonical-demotion transaction.
 * @throws {Error} If publishing fails
 */
const prepareTaskImagePublications = async (
  db: Database,
  taskId: string,
  skipUndefined: boolean = false,
  publisherId: Id,
  guard?: SQL<unknown>,
  rows?: TaskImageReviewRow[],
): Promise<TaskImageReviewPlan> => {
  try {
    const taskImages = rows ?? (await loadTaskImageReviewRows(db, taskId))
    const publishedAt = new Date().toISOString()

    // Missing feature assignments have null intent and must not be accepted as classified.
    // Filter images based on skipUndefined parameter.
    const policies = new Map<
      string,
      Awaited<ReturnType<typeof readFeatureImageIntentPolicy>>
    >()
    for (const row of taskImages)
      if (row.featureId && !policies.has(row.featureId))
        policies.set(
          row.featureId,
          await readFeatureImageIntentPolicy(db, row.featureId),
        )
    const imagesToProcess = taskImages
      .filter(
        row =>
          row.featureId &&
          (!skipUndefined || (row.intent ?? 'undefined') !== 'undefined'),
      )
      .map(row => ({
        ...row,
        ...resolvePolicyImageIntent(
          policies.get(row.featureId!)!,
          row.intent ?? 'undefined',
          !skipUndefined,
        ),
      }))
      .filter(row => row.isPublished)

    // Prepare every image change before committing the publication operation atomically.
    const statements = imagesToProcess.flatMap(ti => {
      if (!ti.featureId) {
        console.warn(`Skipping image ${ti.imageId} - no featureId found`)
        return []
      }

      // Update or create feature image association
      const insertQuery = guard
        ? db.insert(featureImage).select(
            db
              .select({
                // Insert-select fields must follow the complete table column order.
                featureId: sql<string>`${ti.featureId}`.as('featureId'),
                imageId: sql<string>`${ti.imageId}`.as('imageId'),
                intent: sql<string>`${ti.intent ?? 'undefined'}`.as('intent'),
                isPublished: sql<boolean>`1`.as('isPublished'),
                localIsPublished: sql<boolean | null>`null`.as('localIsPublished'),
                publishedAt: sql<string>`${publishedAt}`.as('publishedAt'),
                publisherId: sql<string>`${publisherId}`.as('publisherId'),
              })
              .from(task)
              .where(and(eq(task.id, taskId), guard)),
          )
        : db.insert(featureImage).values({
            imageId: ti.imageId,
            featureId: ti.featureId,
            intent: ti.intent ?? 'undefined',
            isPublished: true,
            publisherId,
            publishedAt,
          })
      const publication = insertQuery.onConflictDoUpdate({
        target: [featureImage.imageId, featureImage.featureId],
        set: {
          intent: ti.intent ?? 'undefined',
          isPublished: true,
          publisherId,
          publishedAt,
        },
      })
      // Keep canonical demotion and publication atomic if either statement fails.
      if (ti.intent === 'canonical') {
        return [
          buildCompetingCanonicalDemotion(db, ti.featureId, ti.imageId, guard),
          publication,
        ]
      } else {
        return [publication]
      }
    })
    return {
      statements: [
        ...[...policies.values()]
          .filter(policy => policy.hubVersion >= 0)
          .map(policy => prepareRevisionCheck(db, policy.guard)),
        ...statements,
      ],
      processedCount: imagesToProcess.length,
    }
  } catch (error) {
    console.error('Failed to publish images:', error)
    throw error
  }
}

/**
 * Archives selected task images in one transaction while preserving shared uses.
 * @param db Database handle.
 * @param taskId Task whose image assignments are being rejected.
 * @param isUndefinedOnly Whether to select only unclassified images.
 * @returns Selected image count and success state.
 */
export const archiveImages = async (
  db: Database,
  taskId: string,
  isUndefinedOnly: boolean = false,
): Promise<{ success: boolean; processedCount: number }> => {
  const plan = await prepareTaskImageArchives(db, taskId, isUndefinedOnly)
  const [first, ...rest] = plan.statements
  try {
    if (first) await db.batch([first, ...rest])
  } catch (error) {
    console.error('Failed to archive images:', error)
    throw error
  }
  return { success: true, processedCount: plan.processedCount }
}

/**
 * Publishes selected task images and canonical demotions in one transaction.
 * @param db Database handle.
 * @param taskId Task whose images are being accepted.
 * @param skipUndefined Whether to select only classified images.
 * @param publisherId Reviewer responsible for publication.
 * @returns Selected image count and success state.
 */
export const publishImages = async (
  db: Database,
  taskId: string,
  skipUndefined: boolean = false,
  publisherId: Id,
): Promise<{ success: boolean; processedCount: number }> => {
  const plan = await prepareTaskImagePublications(
    db,
    taskId,
    skipUndefined,
    publisherId,
  )
  const [first, ...rest] = plan.statements
  try {
    if (first) await db.batch([first, ...rest])
  } catch (error) {
    console.error('Failed to publish images:', error)
    throw error
  }
  return { success: true, processedCount: plan.processedCount }
}

/**
 * Builds the shared optimistic and resource-scope guard for task review writes.
 * @param input Authorized task snapshot and hub scope.
 * @returns A condition matching only that pending task version and scope.
 */
const taskReviewPendingCondition = (input: TaskReviewCommitContext): SQL<unknown> => {
  const expected = input.task
  if (!expected.featureId) return sql`0`
  return sql`${and(
    eq(task.id, expected.id),
    eq(task.type, expected.type),
    eq(task.featureId, expected.featureId),
    eq(task.projectId, expected.projectId),
    eq(task.organisationId, expected.organisationId),
    eq(task.modifiedAt, expected.modifiedAt),
    eq(task.isDraft, false),
    eq(task.isReviewed, false),
    taskFeatureScopeCondition(),
    sql`exists (select 1 from ${organisation} where ${organisation.id} = ${expected.organisationId} and ${organisation.hubId} is ${input.resourceHubId})`,
  )}`
}

/**
 * Commits a feature-changing review and task completion in one transaction.
 * @param db Database handle.
 * @param input Authorized task/feature snapshots and reviewer decision.
 * @returns True on commit, false if either snapshot or resource scope became stale.
 * @remarks The adjacent feature update uses SQLite changes() to require a winning task write.
 */
export const commitTaskFeatureReview = async (
  db: Database,
  input: TaskFeatureReviewCommit,
): Promise<boolean> => {
  const isNewFeature = input.task.type === 'newFeature'
  if (
    input.feature.id !== input.task.featureId ||
    (isNewFeature
      ? input.action !== 'accept' && input.action !== 'reject'
      : input.task.type !== 'reportedMissing' ||
        (input.action !== 'setIntangible' &&
          input.action !== 'setUnpublished' &&
          input.action !== 'setArchived'))
  ) {
    throw error(400, 'INVALID_TASK_ACTION')
  }
  const featureData = isNewFeature
    ? { isPendingReview: false, isArchived: input.action === 'reject' }
    : input.action === 'setIntangible'
      ? { isIntangible: true }
      : input.action === 'setUnpublished'
        ? { isPublished: false, isVisitable: false }
        : { isArchived: true, isPublished: false, isVisitable: false }
  const featureSnapshot = and(
    eq(feature.id, input.feature.id),
    eq(feature.modifiedAt, input.feature.modifiedAt),
  )

  if (isNewFeature) {
    const transferred = await hasFeatureTaskTransfer(db, input.task.id)
    if (transferred) {
      // A moved contribution is work about the destination, never authority to archive it.
      const guard = sql`EXISTS(SELECT 1 FROM task WHERE ${taskReviewPendingCondition(input)}) AND EXISTS(SELECT 1 FROM feature WHERE ${featureSnapshot})`
      const rejection =
        input.action === 'reject'
          ? await prepareFeatureUploadTaskRejection(db, {
              taskId: input.task.id,
              featureId: input.feature.id,
              actorId: input.reviewerId,
              reason: input.reason?.trim() || 'Transferred contribution reviewed',
              guard,
              reject: true,
            })
          : null
      if (rejection) return Boolean(await executeRevisionBatch(db, guard, rejection))
      const evidence = await featureUploadEvidenceSource(db)
      const noPending = sql`NOT EXISTS(SELECT 1 FROM ${evidence} u JOIN featureRevisionProposal p ON p.id=u.proposalId
        WHERE u.featureId=${input.feature.id} AND p.status IN('draft','submitted') AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.task.id}))`
      return Boolean(
        await executeRevisionBatch(db, sql`(${guard}) AND (${noPending})`, [
          db
            .update(task)
            .set({
              isReviewed: true,
              reviewerId: input.reviewerId,
              reviewReason: input.reason?.trim() || null,
              reviewOutcome: input.action === 'accept' ? 'accepted' : 'rejected',
              reviewAction: input.action === 'accept' ? 'added-feature' : 'ignored',
            })
            .where(taskReviewPendingCondition(input)),
          prepareRevisionCheck(db, sql`changes()=1`),
        ]),
      )
    }
    const initial = await reviewInitialFeatureContribution(db, {
      imageReview: input.imageReview,
      featureId: input.feature.id,
      taskId: input.task.id,
      actorId: input.reviewerId,
      reason: input.reason?.trim() || 'Initial Feature reviewed',
      accept: input.action === 'accept',
      guard: sql`EXISTS (SELECT 1 FROM task WHERE ${taskReviewPendingCondition(input)}) AND EXISTS (SELECT 1 FROM feature WHERE ${featureSnapshot})`,
      completion: [
        db
          .update(task)
          .set({
            isReviewed: true,
            reviewerId: input.reviewerId,
            reviewReason: input.reason?.trim() || null,
            reviewOutcome: input.action === 'accept' ? 'accepted' : 'rejected',
            reviewAction: input.action === 'accept' ? 'added-feature' : 'ignored',
          })
          .where(taskReviewPendingCondition(input)),
        prepareRevisionCheck(db, sql`changes()=1`),
      ],
    })
    if (initial !== null) return initial
  }

  // Claim completion only when both snapshots are current inside the same transaction.
  const completion = db
    .update(task)
    .set({
      isReviewed: true,
      reviewerId: input.reviewerId,
      reviewReason: input.reason?.trim() || null,
      reviewOutcome: input.action === 'reject' ? 'rejected' : 'accepted',
      reviewAction: isNewFeature
        ? input.action === 'reject'
          ? 'ignored'
          : 'added-feature'
        : input.action === 'setIntangible'
          ? 'set-intangible'
          : input.action === 'setUnpublished'
            ? 'set-unpublished'
            : 'set-archived',
    })
    .where(
      and(
        taskReviewPendingCondition(input),
        sql`exists (select 1 from ${feature} where ${featureSnapshot})`,
      ),
    )
    .returning({ id: task.id })
  const mutation = db
    .update(feature)
    .set(featureData)
    .where(and(featureSnapshot, sql`changes() = 1`))
    .returning({ id: feature.id })

  const capture = isNewFeature
    ? { before: [], after: [], revisionId: null }
    : await prepareFeatureAcceptedCapture(db, {
        featureId: input.feature.id,
        actorId: input.reviewerId,
        reason: input.reason?.trim() || 'Missing report reviewed',
        guard: sql`EXISTS (SELECT 1 FROM task WHERE ${taskReviewPendingCondition(input)})`,
        unpublish: input.action === 'setUnpublished' || input.action === 'setArchived',
        derive: previous => {
          const content = structuredClone(previous)
          if (input.action === 'setIntangible') content.profile.isIntangible = true
          else content.profile.visitability.isVisitable = false
          return content
        },
      })
  // Keep these statements adjacent: changes() must describe the task completion above.
  const result = await executeRevisionBatch(
    db,
    sql`EXISTS (SELECT 1 FROM task WHERE ${taskReviewPendingCondition(input)})`,
    [
      ...capture.before,
      completion,
      mutation,
      prepareRevisionCheck(db, sql`changes() = 1`),
      ...capture.after,
    ],
  )
  return Boolean(
    result &&
      (result[capture.before.length] as unknown[]).length === 1 &&
      (result[capture.before.length + 1] as unknown[]).length === 1,
  )
}

/**
 * Requires an owned pending draft, live ancestry and retained image evidence at write time.
 * @param expected Persisted task identity and revision.
 * @param type Expected contribution type.
 * @returns Conditions for an atomic finalization update.
 */
function taskDraftFinalizationCondition(
  expected: TaskFeatureDraftFinalizationCommit['task'],
  type: TaskDB['type'],
): SQL {
  if (!expected.featureId) return sql`0`
  return and(
    eq(task.id, expected.id),
    eq(task.featureId, expected.featureId),
    eq(task.contributorId, expected.contributorId),
    eq(task.modifiedAt, expected.modifiedAt),
    eq(task.type, type),
    eq(task.isDraft, true),
    eq(task.isReviewed, false),
    taskFeatureScopeCondition(),
    sql`EXISTS (SELECT 1 FROM taskImage ti JOIN image i ON i.id=ti.imageId
      WHERE ti.taskId=${task.id} AND i.isArchived=0)`,
  )!
}

/**
 * Finalizes a photo or missing-report draft only while its authorized snapshot is current.
 * @param db Request-local database.
 * @param expected Persisted task snapshot checked by the contribution handler.
 * @returns Submitted task, or undefined when evidence, scope or task state changed.
 */
export async function commitTaskDraftFinalization(
  db: Database,
  expected: TaskFeatureDraftFinalizationCommit['task'] & Pick<TaskDB, 'type'>,
): Promise<TaskDB | undefined> {
  if (
    !expected.featureId ||
    (expected.type !== 'newPhoto' && expected.type !== 'reportedMissing')
  )
    return undefined
  const pending = taskDraftFinalizationCondition(expected, expected.type)
  const proposals = await prepareFeatureUploadSubmission(db, {
    taskId: expected.id,
    featureId: expected.featureId,
    actorId: expected.contributorId,
  })
  const result = await executeRevisionBatch(
    db,
    sql`EXISTS (SELECT 1 FROM task WHERE ${pending})`,
    [...proposals, db.update(task).set({ isDraft: false }).where(pending).returning()],
  )
  return result ? (result.at(-1) as TaskDB[])[0] : undefined
}

/**
 * Finalizes a new-feature draft and its task together.
 * @param db Database handle.
 * @param input Current task and feature snapshots.
 * @returns True on commit, false if either draft snapshot or scope became stale.
 * @remarks The adjacent feature update uses SQLite changes() to require a winning task write.
 */
export const commitTaskFeatureDraftFinalization = async (
  db: Database,
  input: TaskFeatureDraftFinalizationCommit,
): Promise<boolean> => {
  if (input.task.featureId !== input.feature.id) {
    throw error(400, 'TASK_FEATURE_REQUIRED')
  }
  const featureSnapshot = and(
    eq(feature.id, input.feature.id),
    eq(feature.modifiedAt, input.feature.modifiedAt),
    eq(feature.isDraft, true),
  )

  if (await hasFeatureTaskTransfer(db, input.task.id)) {
    // The destination is already published; submitting old work must not edit its profile.
    const pending = taskDraftFinalizationCondition(input.task, 'newFeature')
    return Boolean(
      await executeRevisionBatch(db, sql`EXISTS(SELECT 1 FROM task WHERE ${pending})`, [
        ...(await prepareFeatureUploadSubmission(db, {
          taskId: input.task.id,
          featureId: input.feature.id,
          actorId: input.task.contributorId,
        })),
        db.update(task).set({ isDraft: false }).where(pending),
        prepareRevisionCheck(db, sql`changes()=1`),
      ]),
    )
  }

  // Claim task submission only while its linked feature remains the exact draft snapshot.
  const completion = db
    .update(task)
    .set({ isDraft: false })
    .where(
      and(
        taskDraftFinalizationCondition(input.task, 'newFeature'),
        sql`exists (select 1 from ${feature} where ${featureSnapshot})`,
      ),
    )
    .returning({ id: task.id })
  const featureFinalization = db
    .update(feature)
    .set({ isDraft: false })
    .where(and(featureSnapshot, sql`changes() = 1`))
    .returning({ id: feature.id })

  const proposals = await prepareFeatureUploadSubmission(db, {
    taskId: input.task.id,
    featureId: input.feature.id,
    actorId: input.task.contributorId,
  })
  proposals.push(
    ...(await prepareInitialFeatureSubmission(db, {
      featureId: input.feature.id,
      actorId: input.task.contributorId,
      taskId: input.task.id,
      guard: sql`EXISTS (SELECT 1 FROM task WHERE ${taskDraftFinalizationCondition(input.task, 'newFeature')})`,
    })),
  )
  // Keep these statements adjacent: changes() must describe task submission above.
  const result = await executeRevisionBatch(
    db,
    sql`EXISTS (SELECT 1 FROM task WHERE ${taskDraftFinalizationCondition(input.task, 'newFeature')})`,
    [
      ...proposals,
      completion,
      featureFinalization,
      prepareRevisionCheck(db, sql`changes() = 1`),
    ],
  )
  if (!result) return false
  return (
    (result[proposals.length] as unknown[]).length === 1 &&
    (result[proposals.length + 1] as unknown[]).length === 1
  )
}

/**
 * Commits an image-only review and its task completion as one guarded transaction.
 * @param db Database handle.
 * @param input Authorized task snapshot and reviewer decision.
 * @returns True for the winning review, false for a stale task snapshot.
 * @remarks Every write checks the same pending task version and persisted resource scope.
 */
export const commitTaskImageReview = async (
  db: Database,
  input: TaskImageReviewCommit,
): Promise<boolean> => {
  const expected = input.task
  if (!expected.featureId) return false
  if (
    expected.type !== 'newPhoto' &&
    !(expected.type === 'reportedMissing' && input.action === 'reject')
  ) {
    throw error(400, 'INVALID_TASK_ACTION')
  }
  const pending = taskReviewPendingCondition(input)
  const guard = sql`exists (select 1 from ${task} where ${pending})`
  // A completed/stale task has no reviewable source; the same predicate is fenced again at commit.
  if (!(await db.get(sql`SELECT 1 AS eligible WHERE ${guard}`))) return false

  const revisionDecision = await prepareFeatureUploadTaskRejection(db, {
    taskId: expected.id,
    featureId: expected.featureId,
    actorId: input.reviewerId,
    reason: input.reason?.trim() || 'Photo contribution declined',
    guard,
    reject: input.action === 'reject',
  })
  if (revisionDecision) {
    const result = await executeRevisionBatch(db, guard, revisionDecision)
    return Boolean(result && (result.at(-1) as unknown[]).length === 1)
  }

  // Build both image phases without executing either; stale reviewers must write nothing.
  const rows = await loadTaskImageReviewRows(db, expected.id)
  const publications =
    input.action === 'reject'
      ? { statements: [], processedCount: 0 }
      : await prepareTaskImagePublications(
          db,
          expected.id,
          input.action === 'acceptClassified',
          input.reviewerId,
          guard,
          rows,
        )
  const archives =
    input.action === 'acceptAll'
      ? { statements: [], processedCount: 0 }
      : await prepareTaskImageArchives(
          db,
          expected.id,
          input.action === 'acceptClassified',
          guard,
          rows,
        )
  const completion = db
    .update(task)
    .set({
      isReviewed: true,
      reviewerId: input.reviewerId,
      reviewReason: input.reason?.trim() || null,
      reviewOutcome: input.action === 'reject' ? 'rejected' : 'accepted',
      reviewAction:
        input.action === 'reject'
          ? 'ignored'
          : input.action === 'acceptAll'
            ? 'added-all-photos'
            : 'added-classified-photos',
    })
    .where(pending)
    .returning({ id: task.id })

  const capture = await prepareLegacyFeatureTaskImageReview(db, {
    featureId: expected.featureId,
    taskId: expected.id,
    actorId: input.reviewerId,
    action: input.action,
    rows,
    guard,
  })
  // Complete last so the pending-version guard stays true throughout the winning batch.
  const results = await executeRevisionBatch(db, guard, [
    ...capture.before,
    ...publications.statements,
    ...archives.statements,
    ...capture.after,
    completion,
  ])
  const completed = results?.at(-1)
  return Array.isArray(completed) && completed.length === 1
}

// ═══════════════════════
// 3. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new task with all its dependencies (feature, images, etc.)
 * @param db - The database instance
 * @param taskData - The task data to create
 * @param images - Array of image files to process
 * @param userId - The user ID from the session
 * @param subscriptionKey - Azure translation API key for feature enrichment
 * @param fetch - Optional fetch function for image processing
 * @throws {Error} If task creation fails
 */
export const createTaskWithDependencies = async (
  db: Database,
  taskData: TaskCreation,
  images: File[],
  userId: string, // The user ID from the session
  region: string, // Azure translation region for feature enrichment
  subscriptionKey: string, // Azure translation API key for feature enrichment
  fetch?: typeof globalThis.fetch,
): Promise<TaskDB> => {
  // Step 1 : Set contributor ID from session
  taskData = setContributorId(taskData, userId)
  // Older one-shot clients cannot freeze verified uploads and content together; modern clients use draft submission.
  const requiresDraftSubmission =
    taskData.type === 'newFeature'
      ? await featureRevisionCreationEnabled(db)
      : Boolean(
          taskData.featureId && (await hasFeatureRevisionHead(db, taskData.featureId)),
        )
  if (requiresDraftSubmission) throw error(409, 'USE_TASK_DRAFT_SUBMISSION')

  // Step 2: Commit a new Feature and its review task together before uploading photos.
  if (taskData.type === 'newFeature') {
    // Preparation retains translation/default handling; the task uses persisted Feature ancestry.
    const created = await createUserContributedFeatureTask(
      db,
      { ...taskData.feature, isDraft: false } as UserContributedFeature,
      region,
      subscriptionKey,
      { contributorId: userId },
    )
    if (images.length > 0) await processTaskImagesDB(db, images, created.task, fetch)
    return created.task
  }

  // Step 3: Validate that all tasks have valid featureIds
  if (!taskData.featureId) {
    throw new Error(`${taskData.type} task must have a valid featureId`)
  }

  // Add default isReviewed state before casting for createTask
  const taskToCreate = {
    ...taskData,
    isDraft: false, // Current task creation endpoints finalize submissions immediately.
    isReviewed: false, // Default for new tasks
  }

  // Step 4: Create the task
  const createdTask = await createTask(db, taskToCreate as TaskNew)

  // Step 5: Process images if provided
  if (images && images.length > 0) {
    await processTaskImagesDB(db, images, createdTask, fetch)
  }
  return createdTask
}

/**
 * Processes and uploads images associated with a task
 * @param db - The database instance
 * @param formData - The form data containing images
 * @param taskData - The task data
 * @param fetch - Optional fetch function for image processing
 * @throws {Error} If image processing fails
 */
export const processTaskImages = async (
  db: Database,
  images: File[],
  taskData: TaskDB,
  fetch?: typeof globalThis.fetch,
): Promise<Image[]> => {
  const uploadedImages: Image[] = []

  for (const image of images) {
    // Get context for image upload
    const project = await getProjectForFeatureId(db, taskData.featureId as Id)
    if (!project) {
      console.warn('No project found for feature:', taskData.featureId)
      continue
    }

    const organisation = await getOrganisationForProjectId(db, project.id)
    if (!organisation) {
      console.warn('No organisation found for project:', project.id)
      continue
    }

    // Create image context with required properties
    const imageCtx: ImageUploadCtx = {
      ctxType: ImageContextResource.feature,
      ctxId: taskData.featureId as Id,
      organisation,
      project,
      isAdminRequest: true,
      links: [{ type: 'taskImage', taskId: taskData.id }],
    }

    // Upload and process the image
    const uploadedImage = await uploadAndProcessImage(
      image,
      imageCtx,
      {
        isPublished: false,
        intent: taskData.type === 'reportedMissing' ? 'research' : 'undefined',
      },
      fetch,
    )

    if (uploadedImage) {
      uploadedImages.push(uploadedImage.image as Image)
    }
  }

  return uploadedImages
}

/**
 * Processes and uploads images associated with a task directly to the database
 * This bypasses the API permission checks that require admin access
 * @param db - The database instance
 * @param images - Array of image files to process
 * @param taskData - The task data
 * @param fetch - Optional fetch function for image processing
 * @throws {Error} If image processing fails
 */
export const processTaskImagesDB = async (
  db: Database,
  images: File[],
  taskData: TaskDB,
  fetch?: typeof globalThis.fetch,
): Promise<Image[]> => {
  return processTaskImages(db, images, taskData, fetch)
}

// ═══════════════════════
// 4. UTILS :: HELPERS
// ═══════════════════════

/**
 * Extracts files from FormData object.
 * @param formData Submitted photo fields.
 * @returns File entries whose field names start with photo_.
 * @remarks Text values are ignored even when they use a photo field name.
 */
export function getImagesFromFormData(formData: FormData): File[] {
  const photoEntries = Array.from(formData.entries()).filter(([key]) =>
    key.startsWith('photo_'),
  )
  return photoEntries.flatMap(([, fileValue]) => {
    const value: unknown = fileValue
    return value instanceof File ? [value] : []
  })
}

/**
 * Adds contributorId to taskData if not present.
 */
function setContributorId(taskData: TaskCreation, userId: string): TaskCreation {
  // Set the user as the contributor of the task
  // Always takes the userId from the session, so we don't need to trust
  // the user provided contributorId.
  taskData.contributorId = userId

  // Set the user as the contributor of the feature
  if (taskData.type === 'newFeature') {
    taskData.feature.contributorId = taskData.contributorId
  }
  return taskData
}
