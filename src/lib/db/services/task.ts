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
} from '$lib/db/schema/index'
// CRUD
import { insert, update, del } from '../crud'
// SERVICES
import { getProjectForFeatureId } from './project'
import { getOrganisationForProjectId } from './organisation'
import { getTaskHubFilter } from './hub'
import { assertTaskFeatureScope, taskFeatureScopeCondition } from './task-scope'
import { uploadAndProcessImage } from '$lib/client/services/image'
// FEATURE
// ENUMS
import { ImageContextResource } from '$lib/enums'
// DB
import { firstOrNull, toOrderByWithLocalizedFields } from '..'
// TYPES
import type {
  Database,
  Id,
  ListResponse,
  Locale,
  QueryParams,
  TaskCreation,
  TaskDB,
  TaskDBRaw,
  TaskDBPartial,
  TaskNew,
  TaskImageReviewCommit,
  TaskImageReviewPlan,
  TaskImageReviewRow,
  TaskFeatureReviewCommit,
  TaskReviewCommitContext,
} from '$lib/types'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import type { Image, ImageUploadCtx } from '$lib/db/zod/schema/image.types'
// API SERVICES
import { createUserContributedFeature } from '$lib/api/services/feature'
import type { UserContributedFeature } from '$lib/db/zod/schema/feature.types'

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
  const scopedConditions = [...conditions, taskFeatureScopeCondition()]
  const hubFilter = getTaskHubFilter(db, opts)
  if (hubFilter) {
    scopedConditions.push(hubFilter)
  }

  if (query?.q) {
    const search = query.q.toLowerCase()
    const searchConditions: SQL<unknown>[] = [
      sql`("task"."message" IS NOT NULL AND lower("task"."message") like ${`%${search}%`})`,
      sql`EXISTS (
        SELECT 1 FROM "featureI18n"
        WHERE "featureI18n"."featureId" = "task"."featureId"
        AND lower("featureI18n"."title") like ${`%${search}%`}
      )`,
    ]

    const combinedSearchCondition = or(...searchConditions)
    if (combinedSearchCondition) {
      scopedConditions.push(combinedSearchCondition)
    }
  }

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
    data: data as TaskDBRaw[],
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

  return (await db.query.task.findFirst({
    with: withRelations,
    where: and(...conditions, taskFeatureScopeCondition()),
  })) as TaskDBRaw | undefined
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
} | null> =>
  firstOrNull(
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
      .where(and(eq(task.id, params.ref), taskFeatureScopeCondition()))
      .limit(1),
  )

/**
 * Creates a new task in the database
 * @param db - The database instance
 * @param data - The task data to create
 * @returns The created task
 * @throws {Error} If task creation fails
 */
export const createTask = async (db: Database, data: TaskNew): Promise<TaskDB> => {
  await assertTaskFeatureScope(db, data)
  return await insert(db, task, data)
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
      intent: 'undefined',
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
    const imagesToProcess = skipUndefined
      ? taskImages.filter(ti => (ti.intent ?? 'undefined') !== 'undefined')
      : taskImages

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
    return { statements, processedCount: imagesToProcess.length }
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

  // Keep these statements adjacent: changes() must describe the task completion above.
  const [completed, updated] = await db.batch([completion, mutation])
  return completed.length === 1 && updated.length === 1
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
  if (
    expected.type !== 'newPhoto' &&
    !(expected.type === 'reportedMissing' && input.action === 'reject')
  ) {
    throw error(400, 'INVALID_TASK_ACTION')
  }
  const pending = taskReviewPendingCondition(input)
  const guard = sql`exists (select 1 from ${task} where ${pending})`

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
            : 'added-all-photos-with-intent',
    })
    .where(pending)
    .returning({ id: task.id })

  // Complete last so the pending-version guard stays true throughout the winning batch.
  const [first, ...rest] = [
    ...publications.statements,
    ...archives.statements,
    completion,
  ]
  if (!first) return false
  const results = await db.batch([first, ...rest])
  const completed = results.at(-1)
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

  // Step 2: Create feature if needed for newFeature tasks
  if (taskData.type === 'newFeature') {
    // Pass the raw UserContributedFeature data to the API service
    // The API service will handle enrichment, translation, and defaults
    const createdFeature = await createUserContributedFeature(
      db,
      taskData.feature as UserContributedFeature,
      region,
      subscriptionKey,
    )
    taskData.featureId = createdFeature.id

    // Update task data with the actual hierarchical IDs from the created feature
    // This ensures the task references the correct project/organisation
    taskData.organisationId = createdFeature.organisationId
    taskData.projectId = createdFeature.projectId

    // Remove the feature object from taskData since we now have featureId
    // and task validation doesn't need the full feature object
    const { feature: _feature, ...taskDataWithoutFeature } = taskData
    taskData = taskDataWithoutFeature as TaskCreation
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
 */
export function getImagesFromFormData(formData: FormData): File[] {
  const photoEntries = Array.from(formData.entries()).filter(([key]) =>
    key.startsWith('photo_'),
  )
  return photoEntries.map(([_, fileValue]) => fileValue as File)
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
