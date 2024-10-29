import type { 
  NewPropertyDB, 
  PropertyDB, 
  TargetLang, 
  NewPropertyI18n, 
  PropertyI18n,
  Id,
  NewProperty,
  Property,
  PropertyI18nDB,
  NewPropertyValue,
  PropertyValue,
  PropertyValueI18n,
  PropertyValueI18nDB,
  PropertyValueDB
} from '$lib/types';
import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { property, propertyI18n, propertyValue, propertyValueI18n } from '../schema';
import { PropertyInsert, PropertyUpdate, PropertyUpdateAPI } from '../zod';

export type Database = DrizzleD1Database<typeof import('/home/io/code/ghostsigns/src/lib/db/schema')>;

// CREATE / UPDATE

export const createProperty = async (db: Database, data: NewPropertyDB) => {
  const [insertedProperty] = await db
    .insert(property)
    .values({ ...data })
    .returning();

  if (!insertedProperty) {
    error(404, 'Property has stepped through the looking glass');
  }

  return insertedProperty;
};

export const updateProperty = async (db: Database, data: PropertyDB, propertyId: string) => {
  const [updatedProperty] = await db
    .update(property)
    .set({ ...data })
    .where(eq(property.id, propertyId))
    .returning();

  if (!updatedProperty) {
    error(404, 'Property has stepped through the looking glass');
  }

  return updatedProperty;
};

export const createTranslations = async (
  db: Database,
  translations: Record<TargetLang, NewPropertyI18n>,
  propertyId: string
) => {
  const translationsToInsert = Object.entries(translations).map(([lang, translation]) => ({
    ...translation,
    propertyId,
    lang: lang as 'zh-hant' | 'zh-hans'
  }));

  return await db.insert(propertyI18n).values(translationsToInsert).returning();
};

export const updateTranslations = async (
  db: Database,
  translations: Record<TargetLang, PropertyI18n>,
  propertyId: string
) => {
  await db.delete(propertyI18n).where(eq(propertyI18n.propertyId, propertyId));
  return await createTranslations(db, translations, propertyId);
};

export const createPropertyValues = async (
  db: Database,
  values: Record<Id, NewPropertyValue>,
  propertyId: string
) => {
  const valuesToInsert = Object.entries(values).map(([id, value]) => ({
    ...value,
    propertyId,
    id
  }));

  n await db.insert(propertyValue).values(valuesToInsert).returning();
};

export const updatePropertyValues = async (
  db: Database,
  values: Record<Id, PropertyValue>,
  propertyId: string
) => {
  // Get existing records
  const existingValues = await db
    .select()
    .from(propertyValue)
    .where(eq(propertyValue.propertyId, propertyId));

  // Create sets for comparison
  const existingIds = new Set(existingValues.map(v => v.id));
  const newIds = new Set(Object.keys(values));

  // Determine which records to add and remove
  const idsToAdd = [...newIds].filter(id => !existingIds.has(id));
  const idsToRemove = [...existingIds].filter(id => !newIds.has(id));

  // Remove records that are no longer present
  if (idsToRemove.length > 0) {
    await db
      .delete(propertyValue)
      .where(
        and(
        eq(propertyValue.propertyId, propertyId),
        inArray(propertyValue.id, idsToRemove)
      )
    );
  }

  // Add new records
  if (idsToAdd.length > 0) {
    const valuesToInsert = idsToAdd.map(id => ({
      ...values[id],
      propertyId,
      id
    }));
    await db.insert(propertyValue).values(valuesToInsert);
  }

  // Return all current values
  return await db
    .select()
    .from(propertyValue)
    .where(eq(propertyValue.propertyId, propertyId));
};

export const createPropertyValueTranslations = async (
  db: Database,
  translations: Record<string, Record<TargetLang, PropertyValueI18n>>,
  propertyValueIds: string[]
) => {
  const translationsToInsert = propertyValueIds.flatMap(valueId => 
    Object.entries(translations[valueId] || {}).map(([lang, translation]) => ({
      ...translation,
      propertyValueId: valueId,
      lang: lang as 'zh-hant' | 'zh-hans'
    }))
  );

  if (translationsToInsert.length > 0) {
    return await db.insert(propertyValueI18n).values(translationsToInsert).returning();
  }
  return [];
};

export const updatePropertyValueTranslations = async (
  db: Database,
  translations: Record<string, Record<TargetLang, PropertyValueI18n>>,
  propertyValueIds: string[]
) => {
  await db.delete(propertyValueI18n)
    .where(eq(propertyValueI18n.propertyValueId, propertyValueIds[0]));
  return await createPropertyValueTranslations(db, translations, propertyValueIds);
};

// UTILS

export const extractEntitiesToInsert = (formData: NewProperty) => {
  const baseProperty = PropertyInsert.parse(formData);
  const formTranslations: Record<TargetLang, NewPropertyI18n> = formData.translations;
  const formValues: Record<Id, NewPropertyValue> = formData.values;
  const formValueTranslations: Record<Id, Record<TargetLang, PropertyValueI18n>> = 
    formData.valuesTranslations;
  
  return { baseProperty, formTranslations, formValues, formValueTranslations };
};

export const extractEntitiesToUpdate = (formData: Property) => {
  const baseProperty = PropertyUpdate.parse(formData);
  const formTranslations: Record<TargetLang, PropertyI18n> = formData.translations;
  const formValues: Record<Id, PropertyValue> = formData.values;
  const formValueTranslations: Record<Id, Record<TargetLang, PropertyValueI18n>> = 
    formData.valuesTranslations;
  
  return { baseProperty, formTranslations, formValues, formValueTranslations };
};

export const rebuildFormData = async (
  property: PropertyDB,
  translations: PropertyI18nDB[],
  values: PropertyValueDB[],
  valueTranslations: PropertyValueI18nDB[]
) => {
  const formTranslations = translations.reduce(
    (acc: Record<string, Record<string, any>>, translation: Record<string, any>) => {
      const { lang, ...translationWithoutLang } = translation;
      acc[lang] = translationWithoutLang;
      return acc;
    },
    {}
  ) as Record<TargetLang, PropertyI18n>;

  const formValueTranslations = valueTranslations.reduce(
    (acc: Record<string, Record<string, Record<string, any>>>, translation: Record<string, any>) => {
      const { propertyValueId, lang, ...translationData } = translation;
      acc[propertyValueId] = acc[propertyValueId] || {};
      acc[propertyValueId][lang] = translationData;
      return acc;
    },
    {}
  ) as Record<string, Record<TargetLang, PropertyValueI18n>>;

  return await superValidate(
    {
      ...property,
      translations: formTranslations,
      values,
      valueTranslations: formValueTranslations
    },
    zod(PropertyUpdateAPI)
  );
};
