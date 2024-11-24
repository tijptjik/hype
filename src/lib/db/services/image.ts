import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { image, featureImage, feature, projectRole, project, layer } from '../schema';
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
  Id
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
    return error(404, 'Image has stepped through the looking glass');
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

// UTILS

export const extractEntitiesToInsert = (formData: NewImageAPI) : { baseImage: NewImageDB, relatedFeatureImage: NewFeatureImage } => {
  let baseImage = ImageInsert.parse(formData);
  let relatedFeatureImage = formData.featureImage as NewFeatureImage;
  return { baseImage, relatedFeatureImage };
}

export const extractEntitiesToUpdate = (formData: ImageAPI) : { baseImage: ImageDB, relatedFeatureImage: FeatureImage } => {
  let baseImage = ImageUpdate.parse(formData);
  let relatedFeatureImage = formData.featureImage as FeatureImage;
  return { baseImage, relatedFeatureImage };
};

export const checkProjectAccessForImage = async (db: Database, userId: Id, imageId: Id) : Promise<{ projectId: Id; role: string|null }|undefined> => {
  return await db
    .select({
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
};

export const checkProjectAccessForFeature = async (db: Database, userId: Id, featureId: Id) : Promise<{ projectId: Id; role: string|null }|undefined> => {
  return await db
    .select({
      projectId: project.id,
      role: projectRole.role
    })
    .from(featureImage)
    .innerJoin(feature, eq(featureImage.featureId, feature.id))
    .innerJoin(layer, eq(feature.layerId, layer.id))
    .innerJoin(project, eq(layer.projectId, project.id))
    .leftJoin(
      projectRole,
      and(eq(projectRole.projectId, project.id), eq(projectRole.userId, userId))
    )
    .where(eq(featureImage.featureId, featureId))
    .get();
};

