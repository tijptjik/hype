
import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { property, propertyI18n, propertyValue, propertyValueI18n } from '../schema';
import { PropertyInsert, PropertyUpdate, PropertyUpdateAPI } from '../zod';
import { toNestedTranslations } from '$lib/db';
// TYPES
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { 
  NewPropertyDB, 
  PropertyDB, 
  TargetLang, 
  NewPropertyI18n, 
  PropertyI18n,
  Id,
  NewProperty,
  Property,
  NewPropertyValue,
  PropertyValue,
  PropertyValueI18n,
  PropertyValueDB,
  FormRelatedProperties
  
} from '$lib/types';

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

  return await db.insert(propertyValue).values(valuesToInsert).returning();
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

  // Determine which records to add, update, and remove
  const idsToAdd = [...newIds].filter(id => !existingIds.has(id));
  const idsToUpdate = [...newIds].filter(id => existingIds.has(id));
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

  // Update existing records
  await Promise.all(
    idsToUpdate.map(async (id) => {
      await db
        .update(propertyValue)
        .set({
          ...values[id],
          propertyId
        })
        .where(eq(propertyValue.id, id));
    })
  );

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
  const formValues: NewPropertyValue[] = formData.values;
  const formValueTranslations: PropertyValueI18n[] = 
    formData.values.map(value => Object.values(value.translations)).flat();
  
  return { baseProperty, formTranslations, formValues, formValueTranslations };
};

export const extractEntitiesToUpdate = (formData: Property) => {
  const baseProperty = PropertyUpdate.parse(formData);
  const formTranslations: Record<TargetLang, PropertyI18n> = formData.translations;
  const formValues: PropertyValue[] = formData.values;
  const formValueTranslations: PropertyValueI18n[] = 
  formData.values.map(value => Object.values(value.translations)).flat();
  
  return { baseProperty, formTranslations, formValues, formValueTranslations };
};

export const rebuildFormData = async (
  property: PropertyDB,
  translations: PropertyI18n[],
  values: PropertyValueDB[],
  valueTranslations: PropertyValueI18n[]
) => {
  return await superValidate(
    {
      ...property,
      values,
      translations: toNestedTranslations<PropertyI18n>(translations)
    },
    zod(PropertyUpdateAPI)
  );
};

// Add these utility functions
const getExistingProperties = async (db: Database, projectId: string) => {
  const result = await db.query.property.findMany({
    where: eq(property.projectId, projectId),
    with: {
      translations: true,
      values: {
        with: {
          translations: true
        }
      }
    }
  });

  return result.map(prop => ({
    ...prop,
    translations: toNestedTranslations<PropertyI18n>(prop.translations),
    values: prop.values.map(val => ({
      ...val,
      translations: toNestedTranslations<PropertyValueI18n>(val.translations)
    }))
  }));
};

const compareAndGroupProperties = (existing: Property[], incoming: Property[]) => {
  const existingIds = new Set(existing.map(p => p.id));
  const incomingIds = new Set(incoming.map(p => p.id));

  return {
    toDelete: existing.filter(p => !incomingIds.has(p.id)),
    toCreate: incoming.filter(p => !p.id || !existingIds.has(p.id)),
    toUpdate: incoming.filter(p => p.id && existingIds.has(p.id))
  };
};

export const upsertRelatedProperties = async (
  db: Database, 
  properties: Property[]|NewProperty[], 
  projectId: string
): Promise<Property[]> => {
  // Get all existing properties with their relations
  const existingProperties = await getExistingProperties(db, projectId);
  // Group properties by operation needed
  const { toDelete, toCreate, toUpdate } = compareAndGroupProperties(existingProperties, properties);

  // Delete removed properties (cascades to related tables)
  if (toDelete.length > 0) {
    await db
      .delete(property)
      .where(and(
        eq(property.projectId, projectId),
        inArray(property.id, toDelete.map(p => p.id))
      ));
  }

  // Create new properties
  const createdProperties = await Promise.all(
    toCreate.map(async (prop) => {
      // Create base property
      const newProp = await createProperty(db, {
        ...PropertyInsert.parse(prop),
        projectId
      });

      // Create translations
      const translations = await createTranslations(db, prop.translations, newProp.id);

      // Create values and their translations
      const values = await Promise.all(prop.values.map(async (val) => {
        const newValue = await db
          .insert(propertyValue)
          .values({ ...val, propertyId: newProp.id })
          .returning()
          .then(([v]) => v);

        const valueTranslations = await createPropertyValueTranslations(
          db,
          { [newValue.id]: val.translations },
          [newValue.id]
        );

        return { ...newValue, translations: toNestedTranslations(valueTranslations) };
      }));

      return {
        ...newProp,
        translations: toNestedTranslations(translations),
        values
      };
    })
  );

  // Update existing properties
  const updatedProperties = await Promise.all(
    toUpdate.map(async (prop) => {
      // Update base property
      const updatedProp = await updateProperty(db, PropertyUpdate.parse(prop), prop.id);

      // Update translations
      const translations = await updateTranslations(db, prop.translations, prop.id);

      // Update values and their translations
      const values = await updatePropertyValues(db, 
        prop.values.reduce((acc, val) => ({ ...acc, [val.id]: val }), {}), 
        prop.id
      );

      // Update value translations
      const valueTranslations = await Promise.all(
        values.map(async (val) => {
          const matchingValue = prop.values.find(v => v.id === val.id);
          if (matchingValue) {
            return await updatePropertyValueTranslations(
              db,
              { [val.id]: matchingValue.translations },
              [val.id]
            );
          }
          return [];
        })
      );

      return {
        ...updatedProp,
        translations: toNestedTranslations(translations),
        values: values.map((val, idx) => ({
          ...val,
          translations: toNestedTranslations(valueTranslations[idx])
        }))
      };
    })
  );

  // Return combined results
  return [...createdProperties, ...updatedProperties];
};

// Replace the existing implementations with calls to upsertRelatedProperties
export const createRelatedProperties = (db: Database, properties: NewProperty[], projectId: string) => {
  return upsertRelatedProperties(db, properties, projectId);
};

export const updateRelatedProperties = (db: Database, properties: Property[], projectId: string) => {
  return upsertRelatedProperties(db, properties, projectId);
};
