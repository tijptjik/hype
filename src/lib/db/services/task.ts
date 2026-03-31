// DRIZZLE
import { and, asc, desc, eq, ne, or, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import {
  featureI18n,
  image,
  featureImage,
  organisation,
  task,
  taskImage,
} from '$lib/db/schema/index'
// CRUD
import { insert, update, del } from '../crud'
// SERVICES
import { getProjectForFeatureId } from './project'
import { getOrganisationForProjectId } from './organisation'
import { getTaskHubFilter } from './hub'
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

  const scopedConditions = [...conditions]
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
    where: conditions.length > 0 ? and(...conditions) : undefined,
  })) as TaskDBRaw | undefined
}

/**
 * Probes minimal task fields required for read authorization decisions.
 * Used to evaluate access before hydrating the full task relation graph.
 */
export const probeTaskQuery = async (
  db: Database,
  params: { ref: string },
): Promise<{
  id: string
  organisationId: string
  projectId: string
  resourceHubId: string | null
} | null> =>
  firstOrNull(
    await db
      .select({
        id: task.id,
        organisationId: task.organisationId,
        projectId: task.projectId,
        resourceHubId: organisation.hubId,
      })
      .from(task)
      .innerJoin(organisation, eq(task.organisationId, organisation.id))
      .where(eq(task.id, params.ref))
      .limit(1),
  )

/**
 * Creates a new task in the database
 * @param db - The database instance
 * @param data - The task data to create
 * @returns The created task
 * @throws {Error} If task creation fails
 */
export const createTask = async (db: Database, data: TaskNew): Promise<TaskDB> =>
  await insert(db, task, data)

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
): Promise<
  Array<{ imageId: string; intent: string | null; featureId: string | null }>
> =>
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
 * Demotes any existing canonical image so a new canonical assignment can be published safely.
 * @param db - The database instance
 * @param featureId - The feature receiving the canonical image
 * @param nextCanonicalImageId - The image that should remain canonical
 * @returns void
 */
const clearCompetingCanonicalIntent = async (
  db: Database,
  featureId: string,
  nextCanonicalImageId: string,
): Promise<void> => {
  // Canonical intent is exclusive per feature.
  await db
    .update(featureImage)
    .set({
      intent: 'undefined',
    })
    .where(
      and(
        eq(featureImage.featureId, featureId),
        eq(featureImage.intent, 'canonical'),
        ne(featureImage.imageId, nextCanonicalImageId),
      ),
    )
}

/**
 * Archives images associated with a task, optionally only archiving images with undefined intent. This is used to archive (some) images of a task which was (partially) rejected.
 * @param db - The database instance
 * @param taskId - The ID of the task
 * @param isUndefinedOnly - Whether to only archive images with undefined intent
 * @returns The result of the operation
 * @throws {Error} If archiving fails
 */
export const archiveImages = async (
  db: Database,
  taskId: string,
  isUndefinedOnly: boolean = false,
): Promise<{ success: boolean; processedCount: number }> => {
  try {
    const taskImages = await loadTaskImageReviewRows(db, taskId)

    // Filter images based on isUndefinedOnly parameter
    const imagesToProcess = isUndefinedOnly
      ? taskImages.filter(ti => ti.intent === 'undefined')
      : taskImages

    // Process each image
    for (const ti of imagesToProcess) {
      // Delete feature image association
      if (ti.featureId) {
        await db
          .delete(featureImage)
          .where(
            and(
              eq(featureImage.imageId, ti.imageId),
              eq(featureImage.featureId, ti.featureId),
            ),
          )
      }

      // Update image record
      await db.update(image).set({ isArchived: true }).where(eq(image.id, ti.imageId))
    }

    return { success: true, processedCount: imagesToProcess.length }
  } catch (error) {
    console.error('Failed to archive images:', error)
    throw error
  }
}

/**
 * Publishes images associated with a task. This is used to publish images of a task which was (partially) accepted. Optionally skipping images with undefined intent.
 * @param db - The database instance
 * @param taskId - The ID of the task
 * @param skipUndefined - Whether to skip images with undefined intent
 * @returns The result of the operation
 * @throws {Error} If publishing fails
 */
export const publishImages = async (
  db: Database,
  taskId: string,
  skipUndefined: boolean = false,
  publisherId: Id,
): Promise<{ success: boolean; processedCount: number }> => {
  try {
    const taskImages = await loadTaskImageReviewRows(db, taskId)
    const publishedAt = new Date().toISOString()

    // Filter images based on skipUndefined parameter
    const imagesToProcess = skipUndefined
      ? taskImages.filter(ti => ti.intent !== 'undefined')
      : taskImages

    // Process each image
    for (const ti of imagesToProcess) {
      if (!ti.featureId) {
        console.warn(`Skipping image ${ti.imageId} - no featureId found`)
        continue
      }

      if (ti.intent === 'canonical') {
        await clearCompetingCanonicalIntent(db, ti.featureId, ti.imageId)
      }

      // Update or create feature image association
      await db
        .insert(featureImage)
        .values({
          imageId: ti.imageId,
          featureId: ti.featureId,
          intent: ti.intent ?? 'undefined',
          isPublished: true,
          publisherId,
          publishedAt,
        })
        .onConflictDoUpdate({
          target: [featureImage.imageId, featureImage.featureId],
          set: {
            intent: ti.intent ?? 'undefined',
            isPublished: true,
            publisherId,
            publishedAt,
          },
        })
    }

    return { success: true, processedCount: imagesToProcess.length }
  } catch (error) {
    console.error('Failed to publish images:', error)
    throw error
  }
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
