import { error } from '@sveltejs/kit';
import { and, eq, or } from 'drizzle-orm';
import {
  image,
  featureImage,
  feature,
  projectRole,
  project,
  layer,
  organisation,
  organisationRole,
  taskImage,
  user
} from '../schema';
import { ImageInsert, ImageUpdate } from '../zod';
import db, { updatePartial } from '$lib/db';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  NewImageDB,
  ImageDB,
  NewFeatureImage,
  FeatureImage,
  ImageAPI,
  NewImageAPI,
  FeatureImageDB,
  Id,
  AccessStrategyOption,
  NewFeatureImages
} from '$lib/types';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;

// CREATE / UPDATE

export const createImage = async (db: Database, data: NewImageDB) => {
  const [insertedImage] = await db
    .insert(image)
    .values({ ...data })
    .returning();

  if (!insertedImage) {
    return error(404, 'Image has stepped through the looking glass');
  }

  return insertedImage;
};

export const updateImage = async (db: Database, data: ImageDB, ref: string) => {
  const [updatedImage] = await db
    .update(image)
    .set({ ...data })
    .where(eq(image.id, ref))
    .returning();

  if (!updatedImage) {
    return error(
      404,
      `Image <code>${ref}</code> has stepped through the looking glass`
    );
  }

  return updatedImage;
};

export const createFeatureImage = async (
  db: Database,
  newFeatureImage: NewFeatureImage,
  imageId: string
): Promise<FeatureImageDB> => {
  const featureImageToInsert = {
    ...newFeatureImage,
    imageId
  };

  const [insertedFeatureImage] = await db
    .insert(featureImage)
    .values(featureImageToInsert)
    .returning();

  return insertedFeatureImage as FeatureImageDB;
};

export const createFeatureImagesFromImageIds = async (
  db: Database,
  newFeatureImage: NewFeatureImages,
  imageIds: string[]
) => {
  await db
    .insert(featureImage)
    .values(imageIds.map((imageId) => ({ ...newFeatureImage, imageId })));
};

export const updateFeatureImage = async (
  db: Database,
  modifiedFeatureImage: FeatureImage,
  imageId: string
): Promise<FeatureImageDB> => {
  await db.delete(featureImage).where(eq(featureImage.imageId, imageId));
  return await createFeatureImage(db, modifiedFeatureImage, imageId);
};

export const patchImage = async (db: Database, ref: string, data: Partial<ImageDB>) => {
  return await updatePartial(db, image, ref, 'id', data);
};

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

// UTILS

export const extractEntitiesToInsert = (
  formData: NewImageAPI
): { baseImage: NewImageDB; relatedFeatureImage: NewFeatureImage } => {
  let entities: { baseImage: NewImageDB; relatedFeatureImage?: NewFeatureImage } = {
    baseImage: ImageInsert.parse(formData)
  };
  if (formData.featureImage) {
    entities.relatedFeatureImage = formData.featureImage as NewFeatureImage;
  }
  return entities;
};

export const extractEntitiesToUpdate = (
  formData: ImageAPI
): { baseImage: ImageDB; relatedFeatureImage: FeatureImage } => {
  let baseImage = ImageUpdate.parse(formData);
  let relatedFeatureImage = formData.featureImage as FeatureImage;
  return { baseImage, relatedFeatureImage };
};

export const checkFeatureAccessForImage = async (
  db: Database,
  userId: Id,
  imageId: Id
): Promise<{ projectId: Id; role: string | null } | undefined> => {
  let result = await db
    .select({
      featureId: feature.id,
      projectId: project.id,
      role: projectRole.role
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .innerJoin(feature, eq(featureImage.featureId, feature.id))
    .innerJoin(layer, eq(feature.layerId, layer.id))
    .innerJoin(project, eq(layer.projectId, project.id))
    .leftJoin(
      projectRole,
      and(eq(projectRole.projectId, project.id), eq(projectRole.userId, userId))
    )
    .where(eq(image.id, imageId))
    .get();
  return result;
};

export const checkProjectAccessForNewImage = async (
  db: Database,
  userId: Id,
  projectId: Id
): Promise<{ projectId: Id; role: string | null } | undefined> => {
  let result = await db
    .select({
      projectId: project.id,
      role: projectRole.role
    })
    .from(project)
    .leftJoin(
      projectRole,
      and(eq(projectRole.projectId, project.id), eq(projectRole.userId, userId))
    )
    .where(eq(project.id, projectId))
    .get();
  return result;
};
export const checkProjectAccessForImage = async (
  db: Database,
  userId: Id,
  imageId: Id
): Promise<{ projectId: Id; role: string | null } | undefined> => {
  let result = await db
    .select({
      projectId: project.id,
      role: projectRole.role
    })
    .from(image)
    .innerJoin(project, eq(image.id, project.imageId))
    .leftJoin(
      projectRole,
      and(eq(projectRole.projectId, project.id), eq(projectRole.userId, userId))
    )
    .where(eq(image.id, imageId))
    .get();
  return result;
};

export const checkOrganisationAccessForImage = async (
  db: Database,
  userId: Id,
  imageId: Id
): Promise<{ organisationId: Id; role: string | null } | undefined> => {
  let result = await db
    .select({
      organisationId: organisation.id,
      role: organisationRole.role
    })
    .from(image)
    .innerJoin(organisation, eq(image.id, organisation.imageId))
    .leftJoin(
      organisationRole,
      and(
        eq(organisationRole.organisationId, organisation.id),
        eq(organisationRole.userId, userId)
      )
    )
    .where(eq(image.id, imageId))
    .get();
  return result;
};

export const checkProjectAccessForFeature = async (
  db: Database,
  userId: Id,
  featureId: Id
): Promise<{ projectId: Id; role: string | null } | undefined> => {
  return await db
    .select({
      projectId: project.id,
      role: projectRole.role
    })
    .from(feature)
    .innerJoin(layer, eq(feature.layerId, layer.id))
    .innerJoin(project, eq(layer.projectId, project.id))
    .leftJoin(
      projectRole,
      and(eq(projectRole.projectId, project.id), eq(projectRole.userId, userId))
    )
    .where(eq(feature.id, featureId))
    .get();
};

let imageSelect = {
  id: image.id,
  publicId: image.publicId,
  env: image.env,
  cdn: image.cdn,
  version: image.version,
  originalWidth: image.originalWidth,
  originalHeight: image.originalHeight,
  originalFilename: image.originalFilename,
  originalExtension: image.originalExtension,
  contributorId: image.contributorId,
  capturedAt: image.capturedAt,
  createdAt: image.createdAt
};

export const getImagesForFeature = async (
  db: Database,
  featureId: Id,
  accessStrategy: AccessStrategyOption,
  privilegedStrategy: AccessStrategyOption
) => {
  return await db
    .select({
      ...imageSelect,
      // Include featureImage fields
      intent: featureImage.intent,
      isPublished: featureImage.isPublished,
      publishedAt: featureImage.publishedAt,
      // Include user fields
      attribution: user.attribution
    })
    .from(image)
    .innerJoin(featureImage, eq(image.id, featureImage.imageId))
    .innerJoin(user, eq(image.contributorId, user.id))
    .where(
      and(
        eq(featureImage.featureId, featureId),
        // Hide unpublished images from everyone except project maintainers and superadmins
        or(eq(featureImage.isPublished, true), accessStrategy === privilegedStrategy)
      )
    );
};

export const getImageForProject = async (db: Database, projectId: Id) => {
  return await db
    .select(imageSelect)
    .from(image)
    .innerJoin(project, eq(image.id, project.imageId))
    .where(eq(project.id, projectId));
};

export const getImageForOrganisation = async (db: Database, organisationId: Id) => {
  return await db
    .select(imageSelect)
    .from(image)
    .innerJoin(organisation, eq(image.id, organisation.imageId))
    .where(eq(organisation.id, organisationId));
};
