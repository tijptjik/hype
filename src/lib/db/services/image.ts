// DRIZZLE
import { and, eq, getTableColumns, SQL } from 'drizzle-orm';
// SCHEMA
import { featureImage, image, organisation, project, taskImage, user } from '../schema';
// CRUD
import { insert, insertRelated, update, updateRelated } from '../crud';
// ENUMS
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums';
// TYPES
import type {
  FeatureImage,
  FeatureImageDB,
  Id,
  ImageDBNew,
  Database,
  ImageDBPartial,
  Image,
  ImageDB,
  ImageDBFlat,
  ImageDBFlatUpdate
} from '$lib/types';
// UTILS
import { sortImages } from '$lib/api/services/image';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - createImage
//    - updateImage
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createFeatureImage
//    - updateFeatureImage
//    - createTaskImagesFromImageIds
//
// 3. LOOKUPS
//    - getImageById
//    - getImageForContextType
//    - getImagesForFeature
//    - getImagesForTask
//    - getImageForProject
//    - getImageForOrganisation
//
// 4. ACCESS CONTROL
//    - applyResourceContextConstraints
//
// 5. UTILS :: RESHAPE
//    - toResponseShape
//    - toResponseShapeProjectOrOrganisation
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

/**
 * Creates a new image in the database
 * @param db - The database instance
 * @param data - The image data to insert
 * @returns The newly created image
 * @throws {Error} If the image creation fails
 */
export const createImage = async (db: Database, data: ImageDBNew): Promise<ImageDB> =>
  await insert(db, image, data);

/**
 * Updates an existing image in the database
 * @param db - The database instance
 * @param data - The updated image data
 * @param ref - The image id
 * @returns The updated image
 * @throws {Error} If the image update fails or image is not found
 */
export const updateImage = async (
  db: Database,
  data: ImageDBPartial,
  ref: Id
): Promise<ImageDB> => await update(db, image, data, image.id, ref);

// ═══════════════════════
// 2. CRUD :: RELATIONAL OPERATIONS
// ═══════════════════════

export const createFeatureImage = async (
  db: Database,
  newFeatureImage: FeatureImage,
  imageId: Id
): Promise<FeatureImageDB> =>
  await insertRelated(db, featureImage, newFeatureImage, 'imageId', imageId);

export const updateFeatureImage = async (
  db: Database,
  modifiedFeatureImage: ImageDBFlatUpdate,
  imageId: string
): Promise<FeatureImageDB> =>
  await updateRelated(
    db,
    featureImage,
    modifiedFeatureImage,
    featureImage.imageId,
    imageId,
    featureImage.featureId,
    modifiedFeatureImage.featureId
  );

export const createTaskImagesFromImageIds = async (
  db: Database,
  taskId: string,
  imageIds: string[]
) => {
  await db.insert(taskImage).values(
    imageIds.map((imageId) => ({
      taskId,
      imageId
    }))
  );
};

// ═══════════════════════
// 3. LOOKUPS
// ═══════════════════════

export const getImageById = async (
  db: Database,
  conditions: SQL<unknown>[]
): Promise<ImageDBFlat | undefined> => {
  const [result] = await db
    .select({
      ...getTableColumns(image),
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution
    })
    .from(image)
    .leftJoin(featureImage, eq(image.id, featureImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions));
  if (!result) return undefined;
  return result as ImageDBFlat;
};

export const getImageForContextType = async (
  db: Database,
  ctxType: ImageContextResource | ImageContextResourceExtended,
  conditions: SQL<unknown>[]
): Promise<ImageDBFlat[] | ImageDB[]> => {
  let images;
  if (ctxType === ImageContextResource.feature) {
    images = await getImagesForFeature(db, conditions);
  } else if (ctxType === ImageContextResource.project) {
    images = await getImageForProject(db, conditions);
  } else if (ctxType === ImageContextResource.organisation) {
    images = await getImageForOrganisation(db, conditions);
  } else if (ctxType === ImageContextResourceExtended.task) {
    images = await getImagesForTask(db, conditions);
  }
  return sortImages(images as ImageDBFlat[]);
};

/**
 * Retrieves images associated with a feature, including their intent, publication status, and attribution. The conditions should already have been applied and include the featureId.
 *
 * @param db - The database instance.
 * @param conditions - Additional SQL conditions to apply to the query.
 * @returns A promise that resolves to an array of image objects.
 */
export const getImagesForFeature = async (
  db: Database,
  conditions: SQL<unknown>[]
): Promise<ImageDBFlat[]> => {
  return (await db
    .select({
      ...getTableColumns(image),
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions))) as ImageDBFlat[];
};

/**
 * Retrieves images associated with a task, including their intent, publication status, and attribution. The conditions should already have been applied and include the taskId.
 *
 * @param db - The database instance.
 * @param conditions - Additional SQL conditions to apply to the query.
 * @returns A promise that resolves to an array of image objects.
 */
export const getImagesForTask = async (
  db: Database,
  conditions: SQL<unknown>[]
): Promise<ImageDBFlat[]> => {
  return (await db
    .select({
      ...getTableColumns(image),
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      attribution: user.attribution
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .innerJoin(taskImage, eq(image.id, taskImage.imageId))
    .leftJoin(user, eq(image.contributorId, user.id))
    .where(and(...conditions))) as ImageDBFlat[];
};

export const getImageForProject = async (
  db: Database,
  conditions: SQL<unknown>[]
): Promise<ImageDB[]> =>
  await db
    .select({ ...getTableColumns(image) })
    .from(image)
    .innerJoin(project, eq(image.id, project.imageId))
    .where(and(...conditions));

export const getImageForOrganisation = async (
  db: Database,
  conditions: SQL<unknown>[]
): Promise<ImageDB[]> =>
  await db
    .select({ ...getTableColumns(image) })
    .from(image)
    .innerJoin(organisation, eq(image.id, organisation.imageId))
    .where(and(...conditions));

// ═══════════════════════
// 4. ACCESS CONTROL
// ═══════════════════════

/**
 * Applies constraints to the query conditions based on the resource context.
 * Images are a second-class resource, and are always addressed in the context of a first-class resource :
 * organisation, project, feature, or task.
 *
 * This function is used to apply the context constraints to the query conditions.
 *
 * @param contextType - The type of the parent resource.
 * @param contextId - The ID of the parent resource.
 * @param conditions - The array of SQL conditions to modify.
 */
export const applyResourceContextConstraints = (
  contextType: ImageContextResource | ImageContextResourceExtended,
  contextId: Id,
  conditions: SQL<unknown>[]
) => {
  switch (contextType) {
    case ImageContextResource.feature:
      conditions.push(eq(featureImage.featureId, contextId));
      break;
    case ImageContextResource.project:
      conditions.push(eq(project.imageId, image.id));
      conditions.push(eq(project.id, contextId));
      break;
    case ImageContextResource.organisation:
      conditions.push(eq(organisation.imageId, image.id));
      conditions.push(eq(organisation.id, contextId));
      break;
    case ImageContextResourceExtended.task:
      // Assuming a taskImage join table
      // This requires joining with taskImage table
      conditions.push(eq(taskImage.taskId, contextId));
      conditions.push(eq(taskImage.imageId, image.id));
      break;
  }
};

// ═══════════════════════
//  5. UTILS :: RESHAPE
// ═══════════════════════

export const toResponseShape = async (
  image: ImageDB,
  featureImage: FeatureImageDB | undefined,
  attribution: string | undefined
): Promise<ImageDBFlat> => {
  return {
    ...image,
    attribution,
    ...(featureImage
      ? {
          featureId: (featureImage.featureId as Id) ?? undefined,
          intent: featureImage.intent ?? undefined,
          isPublished: featureImage.isPublished ?? undefined,
          publishedAt: featureImage.publishedAt ?? undefined
        }
      : {})
  };
};

export const toResponseShapeProjectOrOrganisation = async (
  image: ImageDB,
  attribution: string | undefined
): Promise<Image> => {
  return {
    ...image,
    attribution
  };
};
