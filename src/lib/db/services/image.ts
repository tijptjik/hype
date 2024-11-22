import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { image, featureImage } from '../schema';
import { ImageInsert, ImageUpdate } from '../zod';
import { updatePartial } from '$lib/db';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  NewImageDB,
  ImageDB,
  NewImage,
  Image,
  NewFeatureImage,
  FeatureImage
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

export const createFeatureImages = async (
  db: Database,
  featureImages: NewFeatureImage[],
  imageId: string
) => {
  const featureImagesToInsert = featureImages.map((fi) => ({
    ...fi,
    imageId
  }));

  const insertedFeatureImages = await db
    .insert(featureImage)
    .values(featureImagesToInsert)
    .returning();

  return insertedFeatureImages;
};

export const updateFeatureImages = async (
  db: Database,
  featureImages: FeatureImage[],
  imageId: string
) => {
  await db.delete(featureImage).where(eq(featureImage.imageId, imageId));
  return await createFeatureImages(
    db,
    featureImages,
    imageId
  );
};

export const patchImage = async (db: Database, ref: string, data: Partial<ImageDB>) => {
  return await updatePartial(db, image, ref, 'id', data);
};

// UTILS

export const extractEntitiesToInsert = (formData: NewImage) => {
  let baseImage = ImageInsert.parse(formData);
  let formFeatureImages: NewFeatureImage[] = formData.featureImages || [];
  return { baseImage, formFeatureImages };
};

export const extractEntitiesToUpdate = (formData: Image) => {
  let baseImage = ImageUpdate.parse(formData);
  let formFeatureImages: FeatureImage[] = formData.featureImages || [];
  return { baseImage, formFeatureImages };
};