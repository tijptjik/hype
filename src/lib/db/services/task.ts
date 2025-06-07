// DRIZZLE
import { eq, and, SQL } from 'drizzle-orm';
// DB
import { resourceConfig } from '$lib/db';
// SCHEMA
import { task, taskImage, image, featureImage, feature } from '$lib/db/schema';
import * as schema from '$lib/db/schema';
// CRUD
import { insert, update, del } from '../crud';
// SERVICES
import { getProjectForFeatureId } from './project';
import { getOrganisationForProjectId } from './organisation';
import { getTaskHubFilter } from './hub';
import { uploadAndProcessImage } from '$lib/client/services/image';
import {
  createTaskImagesFromImageIds,
  createImage,
  createFeatureImage
} from '$lib/db/services/image';
import {
  getCloudinarySignature,
  createCloudinaryImage,
  getPublicPathCloudinaryImage,
  getImageFromCloudinaryResponse,
  extendFeatureImage,
  extendImageWithResource
} from '$lib/client/services/image';
// FEATURE
// ENUMS
import { ImageContextResource } from '$lib/enums';
// TYPES
import type {
  TaskNew,
  TaskDB,
  TaskDBPartial,
  Image,
  TaskCreation,
  ImageUploadCtx,
  Id,
  ResourceHierarchy,
  Database,
  UserContributedFeature,
  HubOpts,
  TaskDBRaw
} from '$lib/types';
// API SERVICES
import { createUserContributedFeature } from '$lib/api/services/feature';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CONFIG
//    - customHierarchy (const)
//
// 2. CRUD :: CORE OPERATIONS
//    - listTasks
//    - getTask
//    - createTask
//    - updateTask
//
// 3. CRUD :: IMAGE HANDLING
//    - archiveImages
//    - publishImages
//
// 4. CRUD :: ORCHESTRATION
//    - createTaskWithDependencies
//    - processTaskImages
//
// 5. UTILS :: HELPERS
//    - addContributorId
//    - getImagesFromFormData
//

// ═══════════════════════
// 1. CONFIG
// ═══════════════════════

/**
 * Resource hierarchy configuration for tasks
 */
export const customHierarchy: ResourceHierarchy = [
  {
    name: 'task',
    table: schema.task,
    parentName: 'project',
    parentTable: schema.project,
    keyToParent: 'projectId',
    keyToSelf: 'taskId',
    depth: 2
  },
  resourceConfig.project,
  resourceConfig.organisation
];

// ═══════════════════════
// 2. CRUD :: CORE OPERATIONS
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
  opts: HubOpts
): Promise<TaskDBRaw[]> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getTaskHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.task.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

/**
 * Gets a single task from the database
 * @param db - The database instance
 * @param withRelations - Relations to include
 * @param conditions - Query conditions
 * @param opts - Hub filtering options
 * @returns Single task or undefined
 */
export const getTask = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<TaskDBRaw | undefined> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getTaskHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.task.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

/**
 * Creates a new task in the database
 * @param db - The database instance
 * @param data - The task data to create
 * @returns The created task
 * @throws {Error} If task creation fails
 */
export const createTask = async (db: Database, data: TaskNew): Promise<TaskDB> =>
  await insert(db, task, data);

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
  ref: Id
): Promise<TaskDB> => await update(db, task, data, task.id, ref);

/**
 * Deletes a task from the database
 * @param db - The database instance
 * @param ref - The ID of the task to delete
 * @returns The result of the operation
 * @throws {Error} If task deletion fails
 */
export const deleteTask = async (db: Database, ref: Id): Promise<TaskDB> =>
  await del(db, task, task.id, ref);

// ═══════════════════════
// 3. CRUD :: IMAGE HANDLING
// ═══════════════════════

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
  isUndefinedOnly: boolean = false
): Promise<{ success: boolean; processedCount: number }> => {
  try {
    // Get all task images for this task
    const taskImages = await db
      .select({
        imageId: taskImage.imageId,
        intent: featureImage.intent
      })
      .from(taskImage)
      .leftJoin(featureImage, eq(taskImage.imageId, featureImage.imageId))
      .where(eq(taskImage.taskId, taskId));

    // Filter images based on isUndefinedOnly parameter
    const imagesToProcess = isUndefinedOnly
      ? taskImages.filter((ti) => ti.intent === 'undefined')
      : taskImages;

    // Process each image
    for (const ti of imagesToProcess) {
      // Delete feature image association
      await db.delete(featureImage).where(eq(featureImage.imageId, ti.imageId));

      // Update image record
      await db.update(image).set({ isArchived: true }).where(eq(image.id, ti.imageId));
    }

    return { success: true, processedCount: imagesToProcess.length };
  } catch (error) {
    console.error('Failed to archive images:', error);
    throw error;
  }
};

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
  skipUndefined: boolean = false
): Promise<{ success: boolean; processedCount: number }> => {
  try {
    // Get all task images for this task
    const taskImages = await db
      .select({
        imageId: taskImage.imageId,
        intent: featureImage.intent,
        featureId: task.featureId
      })
      .from(taskImage)
      .leftJoin(featureImage, eq(taskImage.imageId, featureImage.imageId))
      .leftJoin(task, eq(taskImage.taskId, task.id))
      .where(eq(taskImage.taskId, taskId));

    // Filter images based on skipUndefined parameter
    const imagesToProcess = skipUndefined
      ? taskImages.filter((ti) => ti.intent !== 'undefined')
      : taskImages;

    // Process each image
    for (const ti of imagesToProcess) {
      if (!ti.featureId) {
        console.warn(`Skipping image ${ti.imageId} - no featureId found`);
        continue;
      }

      // Update or create feature image association
      await db
        .insert(featureImage)
        .values({
          imageId: ti.imageId,
          featureId: ti.featureId,
          intent: 'undefined',
          isPublished: true
        })
        .onConflictDoUpdate({
          target: [featureImage.imageId, featureImage.featureId],
          set: { isPublished: true }
        });
    }

    return { success: true, processedCount: imagesToProcess.length };
  } catch (error) {
    console.error('Failed to publish images:', error);
    throw error;
  }
};

// ═══════════════════════
// 4. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new task with all its dependencies (feature, images, etc.)
 * @param db - The database instance
 * @param taskData - The task data to create
 * @param formData - Optional form data containing images
 * @param fetch - Optional fetch function for image processing
 * @throws {Error} If task creation fails
 */
export const createTaskWithDependencies = async (
  db: Database,
  taskData: TaskCreation,
  images: File[],
  userId: string, // The user ID from the session
  fetch?: typeof globalThis.fetch
): Promise<TaskDB> => {
  let createdFeature: typeof feature.$inferSelect | undefined;

  // Step 1 : Set contributor ID from session
  taskData = setContributorId(taskData, userId);

  // Step 2: Create feature if needed for newFeature tasks
  if (taskData.type === 'newFeature') {
    
    // Pass the raw UserContributedFeature data to the API service
    // The API service will handle enrichment, translation, and defaults
    const createdFeature = await createUserContributedFeature(
      db, 
      taskData.feature as UserContributedFeature
    );
    taskData.featureId = createdFeature.id;
    
    // Remove the feature object from taskData since we now have featureId
    // and task validation doesn't need the full feature object
    delete (taskData as any).feature;
  }

  // Step 3: Validate that all tasks have valid featureIds
  if (!taskData.featureId) {
    throw new Error(`${taskData.type} task must have a valid featureId`);
  }

  // Add default isReviewed state before casting for createTask
  const taskToCreate = {
    ...taskData,
    isReviewed: false // Default for new tasks
  };

  // Step 4: Create the task
  const createdTask = await createTask(db, taskToCreate as any);

  // Step 5: Process images if provided
  if (images && images.length > 0) {
    await processTaskImagesDB(db, images, createdTask, fetch);
  }
  return createdTask;
};

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
  fetch?: typeof globalThis.fetch
): Promise<Image[]> => {
  const uploadedImages: Image[] = [];

  for (const image of images) {
    // Get context for image upload
    const project = await getProjectForFeatureId(db, taskData.featureId as Id);
    if (!project) {
      console.warn('No project found for feature:', taskData.featureId);
      continue;
    }

    const organisation = await getOrganisationForProjectId(db, project.id);
    if (!organisation) {
      console.warn('No organisation found for project:', project.id);
      continue;
    }

    // Create image context with required properties
    const imageCtx: ImageUploadCtx = {
      ctxType: ImageContextResource.feature,
      ctxId: taskData.featureId as Id,
      organisation,
      project
    };

    // Upload and process the image
    const uploadedImage = await uploadAndProcessImage(
      image,
      imageCtx,
      {
        isPublished: false,
        intent: taskData.type === 'reportedMissing' ? 'evidence' : 'undefined'
      },
      fetch
    );

    if (uploadedImage) {
      uploadedImages.push(uploadedImage);
    }
  }

  return uploadedImages;
};

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
  fetch?: typeof globalThis.fetch
): Promise<Image[]> => {
  const uploadedImages: Image[] = [];

  for (const file of images) {
    try {
      // Get context for image upload
      const project = await getProjectForFeatureId(db, taskData.featureId as Id);
      if (!project) {
        console.warn('No project found for feature:', taskData.featureId);
        continue;
      }

      const organisation = await getOrganisationForProjectId(db, project.id);
      if (!organisation) {
        console.warn('No organisation found for project:', project.id);
        continue;
      }

      // Create image context with required properties
      const imageCtx: ImageUploadCtx = {
        ctxType: ImageContextResource.feature,
        ctxId: taskData.featureId as Id,
        organisation,
        project
      };

      // 1. Determine public path for Cloudinary
      const { folder, public_id } = getPublicPathCloudinaryImage(imageCtx);
      const paramsToSign = { folder };

      // 2. Fetch Cloudinary signature
      const signData = await getCloudinarySignature(paramsToSign, fetch);

      // 3. Upload file to Cloudinary
      const cloudinaryResponse = await createCloudinaryImage(
        file,
        paramsToSign,
        signData,
        fetch
      );

      // 4. Process Cloudinary response into our image format
      let imageData = getImageFromCloudinaryResponse(cloudinaryResponse);

      // 5. Extend image data with feature/hierarchical info
      const extendedFeatureInfo = {
        isPublished: false,
        intent: taskData.type === 'reportedMissing' ? 'evidence' : 'undefined'
      };

      extendFeatureImage(imageData, imageCtx, { featureImage: extendedFeatureInfo });
      extendImageWithResource(imageData, imageCtx);

      // 6. Set the contributor ID from the task
      imageData.contributorId = taskData.contributorId;

      // 7. Create image directly in database (bypasses API permission checks)
      const createdImage = await createImage(db, imageData as any);

      // 8. Create feature image association
      const featureImageData = {
        imageId: createdImage.id,
        featureId: taskData.featureId as Id,
        intent: extendedFeatureInfo.intent as any,
        isPublished: extendedFeatureInfo.isPublished
      };

      await createFeatureImage(db, featureImageData as any, createdImage.id);

      // 9. Create task image association
      await createTaskImagesFromImageIds(db, taskData.id, [createdImage.id]);

      uploadedImages.push(createdImage as any);
    } catch (error) {
      console.error('Failed to process task image:', error);
      // Continue with other images instead of failing the entire task
    }
  }

  return uploadedImages;
};

// ═══════════════════════
// 5. UTILS :: HELPERS
// ═══════════════════════

/**
 * Extracts files from FormData object.
 */
export function getImagesFromFormData(formData: FormData): File[] {
  const photoEntries = Array.from(formData.entries()).filter(([key]) =>
    key.startsWith('photo_')
  );
  return photoEntries.map(([_, fileValue]) => fileValue as File);
}

/**
 * Adds contributorId to taskData if not present.
 */
function setContributorId(taskData: TaskCreation, userId: string): TaskCreation {

  // Set the user as the contributor of the task
  // Always takes the userId from the session, so we don't need to trust
  // the user provided contributorId.
  taskData.contributorId = userId;

  // Set the user as the contributor of the feature
  if (taskData.type === 'newFeature') {
    taskData.feature.contributorId = taskData.contributorId;
  }
  return taskData;
}
