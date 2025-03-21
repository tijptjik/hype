// SVELTEKIT
import { error } from '@sveltejs/kit';
// DRIZZLE
import { eq } from 'drizzle-orm';
// LIB
import { toNestedTranslations, updatePartial } from '..';
// SUPERFORMS
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
// SCHEMAS
import { feature, featureI18n, featureProperty } from '../schema';
// ZOD
import {
  FeatureInsert,
  FeatureUpdate,
  FeatureUpdateAPI,
  FeaturePropertyUpdateExtra
} from '../zod';
// TYPES
import type {
  NewFeatureDB,
  FeatureDB,
  Id,
  NewFeature,
  Feature,
  FeatureI18n,
  FeatureProperty,
  NewFeatureI18n,
  Layer,
  PropertyI18n,
  TargetLang,
  NewFeatureProperty
} from '$lib/types';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

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

export const updateFeature = async (
  db: Database,
  data: FeatureDB,
  ref: string
): Promise<FeatureDB> => {
  const [updatedFeature] = await db
    .update(feature)
    .set({ ...data })
    .where(eq(feature.id, ref))
    .returning();

  if (!updatedFeature) {
    return error(
      404,
      `Feature <code>${ref}</code> has stepped through the looking glass`
    );
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
  properties: NewFeatureProperty[] | FeatureProperty[],
  featureId: Id
) => {
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

  // Insert new properties, including those with null values
  for (const prop of propsToInsert) {
    const insertData = {
      ...prop,
      featureId,
      value: prop.value ?? null, // Explicitly handle null values
      propertyValueId: prop.propertyValueId ?? null // Explicitly handle null values
    };
    await db.insert(featureProperty).values(insertData);
  }

  // Update existing properties, including those with null values
  for (const prop of propsToUpdate) {
    const updateData = {
      ...prop,
      value: prop.value ?? null, // Explicitly handle null values
      propertyValueId: prop.propertyValueId ?? null // Explicitly handle null values
    };
    await db
      .update(featureProperty)
      .set(updateData)
      .where(eq(featureProperty.id, prop.id!));
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

export const patchFeature = async (
  db: Database,
  ref: string,
  data: Partial<FeatureDB>
) => {
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
  feature: FeatureDB | NewFeatureDB,
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

export function mergeFeatureProperties(feature: Feature, layer: Layer): Feature {
  // Initialize properties array if it doesn't exist
  if (!feature.properties) {
    feature.properties = [];
  }

  // Get existing property IDs
  const existingPropertyIds = new Set(
    feature.properties.map((prop) => prop.propertyId)
  );

  // Add layer properties that aren't already in the feature
  layer.properties.forEach((layerProp) => {
    if (!existingPropertyIds.has(layerProp.propertyId)) {
      // Ensure property translations are in the correct format
      if (typeof layerProp.property.translations !== 'object') {
        layerProp.property.translations = toNestedTranslations<PropertyI18n>(
          layerProp.property.translations
        );
      }

      // Add new feature property following FeaturePropertyInsertAPI schema
      feature.properties.push({
        featureId: feature.id,
        propertyId: layerProp.propertyId,
        value: null,
        translations: {},
        property: layerProp.property,
        propertyValue: undefined
      });
    }
  });

  return feature;
}

export const createTranslations = async (
  db: Database,
  translations: Record<TargetLang, NewFeatureI18n>,
  featureId: Id
) => {
  const translationsToInsert = Object.entries(translations).map(
    ([lang, translation]) => ({
      ...translation,
      featureId,
      lang: lang as TargetLang
    })
  );

  return await db.insert(featureI18n).values(translationsToInsert).returning();
};

export const createProperties = async (
  db: Database,
  featureId: string,
  properties: (typeof FeaturePropertyUpdateExtra)[]
) => {
  await db.insert(featureProperty).values(
    properties.map((prop) => ({
      featureId,
      propertyId: prop.property.id,
      value: prop.value ?? null,
      propertyValueId: prop.propertyValue?.id ?? null
    }))
  );

  const insertedProperties = await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      property: {
        with: {
          translations: true,
          values: true
        }
      }
    }
  });
  return insertedProperties;
};
