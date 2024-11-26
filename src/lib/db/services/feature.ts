import type {
  NewFeatureDB,
  FeatureDB,
  Id,
  NewFeature,
  Feature,
  FeatureI18n,
  FeatureProperty,
  NewFeatureI18n,
  NewFeatureProperty
} from '$lib/types';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { feature, featureI18n, featureProperty } from '../schema';
import {
  FeatureInsert,
  FeatureUpdate,
  FeatureUpdateAPI,
  FeatureI18nInsert,
  FeatureI18nUpdate,
  FeaturePropertyInsert,
  FeaturePropertyUpdate
} from '../zod';
import { toNestedTranslations, updatePartial } from '..';

export type Database = DrizzleD1Database<
  typeof import('/home/io/code/ghostsigns/src/lib/db/schema')
>;

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
    return error(404, `Feature <code>${ref}</code> has stepped through the looking glass`);
  }

  return updatedFeature;
};

export const updateTranslations = async (
  db: Database,
  translations: Record<string, FeatureI18n>,
  featureId: Id
) => {
  const updatedTranslations: FeatureI18n[] = [];

  for (const lang of Object.keys(translations)) {
    const [translation] = await db
      .insert(featureI18n)
      .values({ ...translations[lang], featureId })
      .onConflictDoUpdate({
        target: [featureI18n.featureId, featureI18n.lang],
        set: translations[lang]
      })
      .returning();

    if (translation) {
      updatedTranslations.push(translation);
    }
  }

  return updatedTranslations;
};

export const updateProperties = async (
  db: Database,
  properties: FeatureProperty[],
  featureId: Id
) => {
  const updatedProperties: FeatureProperty[] = [];

  // Get existing property IDs from database
  const existingProps = await db
    .select({ id: featureProperty.id })
    .from(featureProperty)
    .where(eq(featureProperty.featureId, featureId));

  const existingIds = new Set(existingProps.map((p) => p.id));
  const incomingIds = new Set(
    properties.map((p) => p.id).filter((id): id is string => id !== undefined)
  );

  // Find IDs to delete (in DB but not in properties)
  const idsToDelete = [...existingIds].filter((id) => !incomingIds.has(id));

  // Find properties to insert (in properties but not in DB)
  const propsToInsert = properties.filter((p) => !p.id || !existingIds.has(p.id));

  // Find properties to update (in both)
  const propsToUpdate = properties.filter((p) => p.id && existingIds.has(p.id));

  // Delete removed properties
  if (idsToDelete.length > 0) {
    await db
      .delete(featureProperty)
      .where(eq(featureProperty.featureId, featureId))
      .where(featureProperty.id.in(idsToDelete));
  }

  // Insert new properties
  for (const prop of propsToInsert) {
    await db.insert(featureProperty).values({ ...prop, featureId });
  }

  // Update existing properties
  for (const prop of propsToUpdate) {
    await db.update(featureProperty).set(prop).where(eq(featureProperty.id, prop.id!));
  }

  // Get all updated properties with their related property data
  return await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      translations: true,
      property: true
    }
  });
};

export const patchFeature = async (db: Database, ref: string, data: Partial<FeatureDB>) => {
  return await updatePartial(db, feature, ref, 'id', data);
};

// UTILS

export const extractEntitiesToInsert = (formData: NewFeature) => {
  let baseFeature = FeatureInsert.parse(formData);
  let formTranslations = formData.translations;
  let formProperties = formData.properties;
  return { baseFeature, formTranslations, formProperties };
};

export const extractEntitiesToUpdate = (formData: Feature) => {
  let baseFeature = FeatureUpdate.parse(formData);
  let formTranslations = formData.translations;
  let formProperties = formData.properties;
  return { baseFeature, formTranslations, formProperties };
};

export const rebuildFormData = async (
  feature: FeatureDB,
  translations: FeatureI18n[] = [],
  properties: FeatureProperty[] = []
) => {

  properties.forEach((prop) => {
    prop.translations = toNestedTranslations(prop.translations);
  });

  return await superValidate(
    {
      ...feature,
      translations: toNestedTranslations(translations),
      properties
    },
    zod(FeatureUpdateAPI)
  );
};
