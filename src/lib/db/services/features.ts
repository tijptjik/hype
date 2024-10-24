import type { NewFeatureDB, FeatureDB, Id, NewFeature, Feature } from '$lib/types';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { feature } from '../schema';
import { FeatureInsert, FeatureUpdate, FeatureUpdateAPI } from '../zod';

export type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;

// CREATE / UPDATE

export const createFeature = async (db: Database, data: NewFeatureDB) => {
  const [insertedFeature] = await db
    .insert(feature)
    .values({ ...data })
    .returning();

  if (!insertedFeature) {
    return error(404, 'Feature has stepped through the looking glass');
  }

  return insertedFeature;
};

export const updateFeature = async (db: Database, data: FeatureDB, ref: string) => {
  const [updatedFeature] = await db
    .update(feature)
    .set({ ...data })
    .where(eq(feature.id, ref))
    .returning();

  if (!updatedFeature) {
    return error(404, 'Feature has stepped through the looking glass');
  }

  return updatedFeature;
};

// UTILS

export const extractEntitiesToInsert = (formData: NewFeature) => {
  let baseFeature = FeatureInsert.parse(formData);
  return { baseFeature };
};

export const extractEntitiesToUpdate = (formData: Feature) => {
  let baseFeature = FeatureUpdate.parse(formData);
  return { baseFeature };
};

export const rebuildFormData = async (
  feature: FeatureDB
) => {
  return await superValidate(
    {
      ...feature
    },
    zod(FeatureUpdateAPI)
  );
};

