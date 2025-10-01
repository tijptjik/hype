// DRIZZLE
import { and, eq } from 'drizzle-orm';
// DB
import { transformI18nSafely, toRelatedRecords } from '$lib/db';
import {
  insert,
  update,
  insertMany,
  insertManyRelated,
  replaceManyRelated,
  del,
  delMany
} from '../crud';
// SUPERFORMS
import { superValidate } from 'sveltekit-superforms';
// SCHEMA
import { property, propertyI18n, propertyValue, propertyValueI18n } from '../schema';
// ZOD
import { zod } from 'sveltekit-superforms/adapters';
import { PropertyAPI, PropertyInsert, PropertyUpdate, PropertyUpdateAPI } from '../zod';
// TYPES
import type { InferInsertModel, SQL } from 'drizzle-orm';
import type {
  Property,
  PropertyDB,
  PropertyNew,
  PropertyI18nDB,
  PropertyI18nNew,
  PropertyValue,
  PropertyValueNew,
  PropertyValueDB,
  PropertyValueI18nDB,
  PropertyValueI18nPartial,
  Locale,
  Database,
  PropertyI18nPartial,
  PropertyValueI18nNew,
  PropertyDBRaw
} from '$lib/types';
import { syncLayerProperties } from './layer';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listProperties
//    - getProperty
//    - createBaseProperty
//    - updateBaseProperty
//
// 2.1 CRUD :: RELATIONAL OPERATIONS (PropertyI18n)
//    - createI18n
//    - updateI18n
//
// 2.2 CRUD :: RELATIONAL OPERATIONS (PropertyValue)
//    - createPropertyValues
//    - syncPropertyValues
//
// 2.3 CRUD :: RELATIONAL OPERATIONS (PropertyValueI18n)
//    - createPropertyValueI18n
//    - updatePropertyValueI18n
//
// 3. CRUD :: ORCHESTRATION
//    - upsertProjectProperties
//    - createPropertiesWithRelated
//    - updatePropertiesWithRelated
//
// 4. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

/**
 * List properties with filtering and access control
 */
export const listProperties = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
): Promise<PropertyDBRaw[]> =>
  await db.query.property.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });

export const getProperty = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = []
): Promise<PropertyDBRaw | undefined> => {
  const result = await db.query.property.findFirst({
    with: withRelations,
    where: and(...conditions)
  });
  return result;
};

/**
 * Creates a new base property record.
 * @param db Database instance
 * @param data Data for the new property (parsed by Zod schema, e.g., PropertyInsert)
 * @returns The newly created property record from DB.
 */
export const createBaseProperty = async (
  db: Database,
  data: InferInsertModel<typeof property>
): Promise<PropertyDB> => {
  return await insert<typeof property>(db, property, data);
};

/**
 * Updates an existing base property record.
 * @param db Database instance
 * @param data Partial data for updating the property (parsed by Zod schema, e.g., PropertyUpdate)
 * @param propertyId The ID of the property to update.
 * @returns The updated property record from DB.
 */
export const updateBaseProperty = async (
  db: Database,
  data: InferInsertModel<typeof property>,
  propertyId: string
): Promise<PropertyDB> => {
  return await update<typeof property>(db, property, data, property.id, propertyId);
};

// ═══════════════════════
// 2.1 CRUD :: RELATIONAL OPERATIONS (PropertyI18n)
// ═══════════════════════

/**
 * Creates relational i18n records for a property.
 * @param db Database instance
 * @param i18n A record where keys are locales and values are the i18n data for that locale.
 * @param propertyId The ID of the parent property.
 * @returns Array of created propertyI18n records.
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyI18nNew>,
  propertyId: string
): Promise<PropertyI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'propertyId',
    propertyId,
    'locale'
  ) as InferInsertModel<typeof propertyI18n>[];
  return await insertManyRelated(
    db,
    propertyI18n,
    relatedRecords,
    'propertyId',
    propertyId
  );
};

/**
 * Updates relational i18n records for a property (replaces all existing for the property).
 * @param db Database instance
 * @param i18n A record where keys are locales and values are the i18n data for that locale.
 * @param propertyId The ID of the parent property.
 * @returns Array of updated (re-created) propertyI18n records.
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyI18nPartial>,
  propertyId: string
): Promise<PropertyI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'propertyId',
    propertyId,
    'locale'
  ) as InferInsertModel<typeof propertyI18n>[];
  return await replaceManyRelated(
    db,
    propertyI18n,
    relatedRecords,
    propertyI18n.propertyId,
    propertyId
  );
};

// ═══════════════════════
// 2.2 CRUD :: RELATIONAL OPERATIONS (PropertyValue)
// ═══════════════════════

/**
 * Creates multiple property value records.
 * @param db Database instance
 * @param values Array of new property value data.
 * @param propertyId The ID of the parent property.
 * @returns Array of created propertyValue records.
 */
export const createPropertyValues = async (
  db: Database,
  values: PropertyValueNew[],
  propertyId: string
): Promise<PropertyValueDB[]> => {
  const dataToInsert = values.map((val) => ({
    ...val, // Spread PropertyValueNew
    propertyId: propertyId
  })) as InferInsertModel<typeof propertyValue>[];
  return await insertMany(db, propertyValue, dataToInsert);
};

/**
 * Updates property values for a given property.
 * Handles creation of new values, update of existing ones, and deletion of removed ones.
 * @param db Database instance
 * @param incomingValues Array of current property value data from the form/API.
 * @param propertyId The ID of the parent property.
 * @returns Array of all current propertyValue records for the property from DB.
 */
export const syncPropertyValues = async (
  db: Database,
  incomingValues: PropertyValue[], // Form shape with IDs for existing, potentially new ones without
  propertyId: string
): Promise<PropertyValueDB[]> => {
  const existingValues = await db.query.propertyValue.findMany({
    where: eq(propertyValue.propertyId, propertyId)
  });

  const existingIds = new Set(existingValues.map((v) => v.id));
  const incomingMap = new Map(incomingValues.map((v) => [v.id, v]));

  const idsToDelete = existingValues
    .filter((ev) => !incomingMap.has(ev.id))
    .map((ev) => ev.id);
  const valuesToUpdate = incomingValues.filter((iv) => iv.id && existingIds.has(iv.id));
  const valuesToCreate = incomingValues.filter(
    (iv) => !iv.id || !existingIds.has(iv.id)
  );

  // Delete removed values
  if (idsToDelete.length > 0) {
    await delMany(db, propertyValue, propertyValue.id, idsToDelete);
  }

  // Create new values
  if (valuesToCreate.length > 0) {
    const dataToInsert = valuesToCreate.map((val) => ({
      ...val,
      propertyId: propertyId
    })) as InferInsertModel<typeof propertyValue>[];
    await insertMany(db, propertyValue, dataToInsert);
  }

  // Update existing values
  await Promise.all(
    valuesToUpdate.map(async (val) => {
      const { i18n, ...baseValueData } = val; // Exclude i18n for base propertyValue update
      await update<typeof propertyValue>(
        db,
        propertyValue,
        baseValueData,
        propertyValue.id,
        val.id
      );
    })
  );

  return db.query.propertyValue.findMany({
    where: eq(propertyValue.propertyId, propertyId)
  });
};

// ═══════════════════════
// 2.3 CRUD :: RELATIONAL OPERATIONS (PropertyValueI18n)
// ═══════════════════════

/**
 * Creates internationalization records for a single property value.
 * @param db Database instance
 * @param i18n Record of i18n data for the property value.
 * @param propertyValueId The ID of the parent property value.
 * @returns Array of created propertyValueI18n records.
 */
export const createPropertyValueI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyValueI18nNew>,
  propertyValueId: string
): Promise<PropertyValueI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'propertyValueId',
    propertyValueId,
    'locale'
  ) as InferInsertModel<typeof propertyValueI18n>[];
  return await insertManyRelated(
    db,
    propertyValueI18n,
    relatedRecords,
    'propertyValueId',
    propertyValueId
  );
};

/**
 * Updates internationalization records for a single property value (replaces all existing for that value).
 * @param db Database instance
 * @param i18n Record of i18n data for the property value.
 * @param propertyValueId The ID of the parent property value.
 * @returns Array of updated (re-created) propertyValueI18n records.
 */
export const updatePropertyValueI18n = async (
  db: Database,
  i18n: Record<Locale, PropertyValueI18nPartial>,
  propertyValueId: string
): Promise<PropertyValueI18nDB[]> => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'propertyValueId',
    propertyValueId,
    'locale'
  ) as InferInsertModel<typeof propertyValueI18n>[];
  return await replaceManyRelated(
    db,
    propertyValueI18n,
    relatedRecords,
    propertyValueI18n.propertyValueId,
    propertyValueId
  );
};

// ═══════════════════════
// 3. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Upserts properties and all their related data (i18n, values, value i18n) for a project.
 * @param db Database instance
 * @param properties Array of properties to upsert.
 * @param projectId The ID of the project to upsert properties for.
 * @returns Array of upserted properties.
 */
export const upsertProjectProperties = async (
  db: Database,
  properties: (PropertyNew | Property)[], // Can be a mix of new and existing properties
  projectId: string
): Promise<Property[]> => {
  const existingProperties = await db.query.property.findMany({
    where: eq(property.projectId, projectId),
    with: {
      i18n: true,
      values: {
        with: {
          i18n: true
        }
      }
    }
  });

  // Match by both ID and key to handle imports where properties have new IDs but existing keys
  const existingPropsById = new Map(existingProperties.map((p) => [p.id, p]));
  const existingPropsByKey = new Map(existingProperties.map((p) => [p.key, p]));
  const incomingPropsMap = new Map(
    properties.filter((p) => (p as Property).id).map((p) => [(p as Property).id, p])
  );
  const incomingKeySet = new Set(properties.map((p) => p.key));

  const propsToDelete = existingProperties.filter(
    (ep) => !incomingPropsMap.has(ep.id) && !incomingKeySet.has(ep.key)
  );
  const propsToCreate = properties.filter((p) => {
    const hasId = !!(p as Property).id;
    const existsById = hasId && existingPropsById.has((p as Property).id);
    const existsByKey = existingPropsByKey.has(p.key);
    // Only create if doesn't exist by ID AND doesn't exist by key
    return !existsById && !existsByKey;
  });
  const propsToUpdate = properties
    .filter((p) => {
      const hasId = !!(p as Property).id;
      const existsById = hasId && existingPropsById.has((p as Property).id);
      const existsByKey = existingPropsByKey.has(p.key);
      // Update if exists by ID OR exists by key
      return existsById || existsByKey;
    })
    .map((p) => {
      // If matched by key but has different ID, use the existing property's ID
      const existingByKey = existingPropsByKey.get(p.key);
      if (existingByKey && existingByKey.id !== (p as Property).id) {
        return { ...p, id: existingByKey.id } as Property;
      }
      return p as Property;
    });

  // Delete
  if (propsToDelete.length > 0) {
    // Cascading delete should handle related i18n, values, and value_i18n
    await delMany(
      db,
      property,
      property.id,
      propsToDelete.map((p) => p.id)
    );
  }

  // Create
  const createdResults: Property[] = [];
  for (const propData of propsToCreate) {
    const {
      i18n: i18nData,
      values: valuesData,
      ...basePropData
    } = propData as PropertyNew;
    const parsedBase = PropertyInsert.parse(basePropData); // Validate and get defaults
    const newBaseProp = await createBaseProperty(db, {
      ...parsedBase,
      projectId
    } as InferInsertModel<typeof property>);

    const newTranslations = await createI18n(
      db,
      i18nData as Record<Locale, PropertyI18nNew>,
      newBaseProp.id
    );

    const newPropValuesWithTranslations: PropertyValue[] = [];
    if (valuesData) {
      for (const valData of valuesData as PropertyValueNew[]) {
        const { i18n: valI18nData, ...baseValData } = valData;
        const newPropVal = await insert<typeof propertyValue>(db, propertyValue, {
          ...baseValData,
          propertyId: newBaseProp.id
        } as PropertyValueNew);
        const newValTranslations = await createPropertyValueI18n(
          db,
          valI18nData as Record<Locale, PropertyValueI18nNew>,
          newPropVal.id
        );
        newPropValuesWithTranslations.push({
          ...newPropVal,
          i18n: transformI18nSafely(newValTranslations)
        } as PropertyValue);
      }
    }
    createdResults.push({
      ...newBaseProp,
      i18n: transformI18nSafely(newTranslations),
      values: newPropValuesWithTranslations
    } as Property);
  }

  // Update
  const updatedResults: Property[] = [];
  for (const propData of propsToUpdate) {
    const { i18n: i18nData, values: valuesData, ...basePropData } = propData;
    const parsedBase = PropertyUpdate.parse(basePropData); // Validate
    const updatedBaseProp = await updateBaseProperty(
      db,
      parsedBase as InferInsertModel<typeof property>,
      propData.id!
    );

    const updatedTranslations = await updateI18n(
      db,
      i18nData || ({} as Record<Locale, PropertyI18nPartial>),
      propData.id!
    );

    const syncedValues = valuesData
      ? await syncPropertyValues(db, valuesData, propData.id!)
      : [];

    const updatedPropValuesWithTranslations: PropertyValue[] = [];
    for (const syncedVal of syncedValues) {
      // syncedVal is PropertyValueDB
      const incomingValData = valuesData?.find((v) => v.id === syncedVal.id); // incomingValData is PropertyValue from input

      let valTranslations: PropertyValueI18nDB[] = [];
      if (
        incomingValData &&
        incomingValData.i18n &&
        Object.keys(incomingValData.i18n).length > 0
      ) {
        try {
          valTranslations = await updatePropertyValueI18n(
            db,
            incomingValData.i18n, // This is Record<Locale, PropertyValueI18n>
            syncedVal.id
          );
        } catch (e) {
          // Fallback: try to fetch existing translations if update failed
          valTranslations = await db.query.propertyValueI18n.findMany({
            where: eq(propertyValueI18n.propertyValueId, syncedVal.id)
          });
        }
      } else {
        // If no i18n data for this value in input, fetch existing ones or assume none
        valTranslations = await db.query.propertyValueI18n.findMany({
          where: eq(propertyValueI18n.propertyValueId, syncedVal.id)
        });
      }
      updatedPropValuesWithTranslations.push({
        ...syncedVal,
        i18n: transformI18nSafely(valTranslations)
      } as PropertyValue);
    }

    updatedResults.push({
      ...updatedBaseProp,
      i18n: transformI18nSafely(updatedTranslations),
      values: updatedPropValuesWithTranslations
    } as Property);
  }

  return [...createdResults, ...updatedResults].sort(
    (a, b) => (a.rank ?? 0) - (b.rank ?? 0)
  );
};

/**
 * Creates properties and all their related data (i18n, values, value i18n) for a project.
 */
export const createPropertiesWithRelated = async (
  db: Database,
  propertiesData: PropertyNew[],
  projectId: string
): Promise<Property[]> => {
  const properties = await upsertProjectProperties(db, propertiesData, projectId);
  // Also ensure that the properties are available on all the existing layers of the project
  syncLayerProperties(db, projectId, properties);
  return properties;
};

/**
 * Updates a single property without affecting other properties in the project.
 * Use this for updating individual properties (e.g., adding new values).
 */
export const updateSingleProperty = async (
  db: Database,
  propertyData: Property
): Promise<Property> => {
  const { i18n: i18nData, values: valuesData, ...basePropData } = propertyData;
  const parsedBase = PropertyUpdate.parse(basePropData);

  // Update base property
  const updatedBaseProp = await updateBaseProperty(
    db,
    parsedBase as InferInsertModel<typeof property>,
    propertyData.id!
  );

  // Update i18n
  const updatedTranslations = await updateI18n(
    db,
    i18nData || ({} as Record<Locale, PropertyI18nPartial>),
    propertyData.id!
  );

  // Sync property values
  const syncedValues = valuesData
    ? await syncPropertyValues(db, valuesData, propertyData.id!)
    : [];

  const updatedPropValuesWithTranslations: PropertyValue[] = [];
  for (const syncedVal of syncedValues) {
    const incomingValData = valuesData?.find((v) => v.id === syncedVal.id);

    let valTranslations: PropertyValueI18nDB[] = [];
    if (
      incomingValData &&
      incomingValData.i18n &&
      Object.keys(incomingValData.i18n).length > 0
    ) {
      try {
        valTranslations = await updatePropertyValueI18n(
          db,
          incomingValData.i18n,
          syncedVal.id
        );
      } catch (e) {
        valTranslations = await db.query.propertyValueI18n.findMany({
          where: eq(propertyValueI18n.propertyValueId, syncedVal.id)
        });
      }
    } else {
      valTranslations = await db.query.propertyValueI18n.findMany({
        where: eq(propertyValueI18n.propertyValueId, syncedVal.id)
      });
    }
    updatedPropValuesWithTranslations.push({
      ...syncedVal,
      i18n: transformI18nSafely(valTranslations)
    } as PropertyValue);
  }

  return {
    ...updatedBaseProp,
    i18n: transformI18nSafely(updatedTranslations),
    values: updatedPropValuesWithTranslations
  } as Property;
};

/**
 * Creates a single new property without affecting existing properties.
 * Use this for adding individual properties during import.
 */
export const createSingleProperty = async (
  db: Database,
  propertyData: PropertyNew
): Promise<Property> => {
  const {
    i18n: i18nData,
    values: valuesData,
    ...basePropData
  } = propertyData as PropertyNew;
  const parsedBase = PropertyInsert.parse(basePropData);

  // Create base property
  const newBaseProp = await createBaseProperty(db, {
    ...parsedBase,
    projectId: propertyData.projectId
  } as InferInsertModel<typeof property>);

  // Create i18n
  const newTranslations = await createI18n(
    db,
    i18nData as Record<Locale, PropertyI18nNew>,
    newBaseProp.id
  );

  // Create property values if provided
  const newPropValuesWithTranslations: PropertyValue[] = [];
  if (valuesData) {
    for (const valData of valuesData as PropertyValueNew[]) {
      const { i18n: valI18nData, ...baseValData } = valData;
      const newPropVal = await insert<typeof propertyValue>(db, propertyValue, {
        ...baseValData,
        propertyId: newBaseProp.id
      } as PropertyValueNew);
      const newValTranslations = await createPropertyValueI18n(
        db,
        valI18nData as Record<Locale, PropertyValueI18nNew>,
        newPropVal.id
      );
      newPropValuesWithTranslations.push({
        ...newPropVal,
        i18n: transformI18nSafely(newValTranslations)
      } as PropertyValue);
    }
  }

  // Add property to all layers in the project
  const { addPropertyToLayers } = await import('./layer');
  await addPropertyToLayers(db, propertyData.projectId, newBaseProp.id);

  return {
    ...newBaseProp,
    i18n: transformI18nSafely(newTranslations),
    values: newPropValuesWithTranslations
  } as Property;
};

/**
 * Updates properties and all their related data for a project.
 * This is effectively an upsert operation for the collection of properties.
 */
export const updatePropertiesWithRelated = async (
  db: Database,
  propertiesData: Property[],
  projectId: string
): Promise<Property[]> => {
  const properties = await upsertProjectProperties(db, propertiesData, projectId);
  // Also ensure that the properties are availabler on all the existing layers of the project
  syncLayerProperties(db, projectId, properties);
  return properties;
};

// ═══════════════════════
// 4. UTILS :: SHAPING
// ═══════════════════════

/**
 * Prepares a property and its related data for form display.
 * @param property The base property data from DB.
 * @param translations Array of i18n records for the property.
 * @param values Array of value records for the property.
 * @param valueTranslations Array of i18n records for all property values (needs filtering per value).
 * @returns A SuperValidated form object.
 */
export const toFormShape = async (
  data: PropertyDB,
  i18n: PropertyI18nDB[],
  valuesData: PropertyValueDB[], // These are base values
  valuesI18nData: PropertyValueI18nDB[] // All translations for all values of this property
) => {
  const valuesWithI18n = valuesData.map((val) => {
    const i18nForThisValue = valuesI18nData.filter(
      (vt) => vt.propertyValueId === val.id
    );
    return {
      ...val,
      i18n: transformI18nSafely(i18nForThisValue)
    };
  });

  const formCompatibleData = {
    ...data,
    i18n: transformI18nSafely(i18n),
    values: valuesWithI18n
  };

  // Assuming PropertyUpdateAPI is the Zod schema for the full Property shape including relations
  // @ts-ignore TODO - Fix Zod type error
  return await superValidate(formCompatibleData, zod(PropertyUpdateAPI));
};

/**
 * Builds response data from database entities for a single property.
 * @param data The base property data from DB.
 * @param i18n Array of i18n records for the property.
 * @param valuesData Array of value records for the property.
 * @param valuesI18nData Array of i18n records for all property values.
 * @returns A Property object.
 */
export const toResponseShape = (
  data: PropertyDBRaw,
  i18n: PropertyI18nDB[],
  valuesData: PropertyValueDB[],
  valuesI18nData: PropertyValueI18nDB[]
): Property => {
  const valuesWithI18n = valuesData.map((val) => {
    const i18nForThisValue = valuesI18nData?.filter(
      (vt) => vt.propertyValueId === val.id
    );
    return {
      ...val,
      i18n: transformI18nSafely(i18nForThisValue)
    };
  });

  const responseData: Property = {
    ...(data as any),
    i18n: transformI18nSafely(i18n),
    values: valuesWithI18n
  };

  return PropertyAPI.parse(responseData);
};
