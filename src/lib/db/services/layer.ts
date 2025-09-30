// DRIZZLE
import { and, eq, SQL, inArray } from 'drizzle-orm';
// FORMS
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { SuperValidated } from 'sveltekit-superforms';
// SCHEMA
import {
  layer,
  layerI18n,
  layerProperty,
  property as propertySchema,
  project
} from '../schema';
// API
import { layerMergeWithRelations } from '$lib/api/services/layer';
// SERVICES
import { getLayerHubFilter } from './hub';
// DB
import { toRelatedRecords, transformI18nSafely } from '..';
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud';
// TYPES
import type { SQLiteInsertValue } from 'drizzle-orm/sqlite-core';
import type {
  Layer,
  LayerNew,
  LayerDBRaw,
  LayerI18nDB,
  Locale,
  Database,
  LayerDBNew,
  LayerDBPartial,
  LayerI18nPartial,
  LayerI18nNew,
  ProjectDBRaw,
  LayerPartial,
  LayerPropertyDBRaw,
  Property,
  LayerPropertyNew,
  Id,
  HubOptsExtended
} from '$lib/types';
// ZOD
import { LayerAPI } from '../zod';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listLayers
//    - getLayer
//    - createLayer
//    - updateLayer
//
// 2.1. CRUD :: RELATIONAL OPERATIONS (LayerI18n)
//    - createI18n
//    - updateI18n
//
// 2.2. CRUD :: RELATIONAL OPERATIONS (LayerProperty)
//    - createLayerProperties
//    - updateLayerProperties
//    - upsertLayerProperties
//    - syncLayerProperties
//
// 3. CRUD :: ORCHESTRATION
//    - createLayerWithRelated
//    - updateLayerWithRelated
//
// 4. UTILS :: SHAPING
//    - toFormShape
//    - toResponseShape
//
// 5. UTILS :: LOOKUPS
//    - getLayerMap
//

// ═══════════════════════
// 1. CRUD :: CORE OPERATIONS
// ═══════════════════════

/**
 * List layers with filtering and access control
 */
export const listLayers = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended
): Promise<LayerDBRaw[]> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getLayerHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.layer.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

export const getLayer = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOptsExtended
): Promise<LayerDBRaw | undefined> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getLayerHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  const result = await db.query.layer.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
  return result;
};

/**
 * Creates a new layer in the database
 * @param db - The database instance
 * @param data - The layer data to insert
 * @returns The newly created layer
 * @throws {Error} If the layer creation fails
 */
export const createLayer = async (db: Database, data: LayerDBNew) =>
  await insert(db, layer, data);

/**
 * Updates an existing layer in the database
 * @param db - The database instance
 * @param data - The updated layer data
 * @param ref - The layer id
 * @returns The updated layer
 * @throws {Error} If the layer update fails or layer is not found
 */
export const updateLayer = async (db: Database, data: LayerDBPartial, ref: string) =>
  await update(db, layer, data, layer.id, ref);

// ═══════════════════════
// 2.1. CRUD :: RELATIONAL OPERATIONS (LayerI18n)
// ═══════════════════════

/**
 * Creates relational i18n records for a layer
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param layerId - The ID of the layer
 * @returns The created translations
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, LayerI18nNew>,
  layerId: string
) => {
  return await insertManyRelated(
    db,
    layerI18n,
    toRelatedRecords(i18n, 'layerId', layerId, 'locale') as any,
    'layerId',
    layerId
  );
};

/**
 * Updates translations for a layer by deleting existing ones and creating new ones
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param layerId - The ID of the layer
 * @returns The updated translations
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, LayerI18nPartial>,
  layerId: string
) => {
  return await replaceManyRelated(
    db,
    layerI18n,
    toRelatedRecords(i18n, 'layerId', layerId, 'locale') as any,
    layerI18n.layerId,
    layerId
  );
};

// ═══════════════════════
// 2.2. CRUD :: RELATIONAL OPERATIONS (LayerProperty)
// ═══════════════════════

/**
 * Create layer property associations
 */
export const createLayerProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[]
) => {
  if (properties && properties.length > 0) {
    await db.insert(layerProperty).values(
      properties.map((prop) => ({
        layerId,
        ...prop
      }))
    );
  }

  return await db.query.layerProperty.findMany({
    where: eq(layerProperty.layerId, layerId),
    with: {
      property: {
        with: {
          i18n: true,
          values: {
            with: {
              i18n: true
            }
          }
        }
      }
    }
  });
};

/**
 * Update layer property associations (replace all)
 */
export const updateLayerProperties = async (
  db: Database,
  layerId: string,
  properties: LayerPropertyNew[]
) => {
  // First delete existing properties
  await db.delete(layerProperty).where(eq(layerProperty.layerId, layerId));
  // Then insert new ones
  return await createLayerProperties(db, layerId, properties);
};

/**
 * Upserts (inserts or updates) property links for a single layer.
 * - Deletes links not in the provided `propertyLinks`.
 * - Inserts new links from `propertyLinks` if they don't exist for the layer.
 * - Updates the `isVisible` flag for existing links if it differs.
 *
 * @param db The Drizzle database instance.
 * @param layerId The ID of the layer whose properties are to be upserted.
 * @param propertyLinks An array of objects, each specifying a `propertyId` and an optional `isVisible` flag.
 *                      If `isVisible` is not provided for a new link, it defaults to `true`.
 *                      If `isVisible` is not provided for an existing link, its visibility remains unchanged unless
 *                      the link itself is being newly created or explicitly updated.
 */
export const upsertLayerProperties = async (
  db: Database,
  layerId: string,
  propertyLinks: Array<{ propertyId: string; isVisible?: boolean }>
): Promise<void> => {
  // 1. Fetch current layerProperty entries for this layer
  const currentLinks = await db.query.layerProperty.findMany({
    where: eq(layerProperty.layerId, layerId),
    columns: {
      propertyId: true,
      isVisible: true
    }
  });

  const currentLinkMap = new Map(
    currentLinks.map((link) => [link.propertyId, link.isVisible])
  );
  const newLinkMap = new Map(
    propertyLinks.map((link) => [link.propertyId, link.isVisible])
  );

  const toDelete: string[] = [];
  const toInsert: SQLiteInsertValue<typeof layerProperty>[] = [];
  const toUpdate: Array<{ propertyId: string; isVisible: boolean }> = [];

  // 2. Identify links to delete
  for (const currentPropertyId of currentLinkMap.keys()) {
    if (!newLinkMap.has(currentPropertyId)) {
      toDelete.push(currentPropertyId);
    }
  }

  // 3. Identify links to insert or update
  for (const [newPropertyId, newIsVisible] of newLinkMap.entries()) {
    if (currentLinkMap.has(newPropertyId)) {
      // We currently have no props that we want to sync down on update
    } else {
      // Insert new link
      toInsert.push({
        layerId,
        propertyId: newPropertyId,
        isVisible: newIsVisible === undefined ? false : newIsVisible
      });
    }
  }

  // 4. Perform database operations
  // DB :: DELETE
  if (toDelete.length > 0) {
    await db
      .delete(layerProperty)
      .where(
        and(
          eq(layerProperty.layerId, layerId),
          inArray(layerProperty.propertyId, toDelete)
        )
      );
  }

  // DB :: INSERT
  if (toInsert.length > 0) {
    await db.insert(layerProperty).values(toInsert);
  }

  // DB :: UPDATE
  for (const updateOp of toUpdate) {
    await db
      .update(layerProperty)
      .set({ isVisible: updateOp.isVisible })
      .where(
        and(
          eq(layerProperty.layerId, layerId),
          eq(layerProperty.propertyId, updateOp.propertyId)
        )
      );
  }
};

/**
 * Synchronizes properties for ALL layers associated with a given projectId.
 * For each layer, it ensures that its linked properties match the newProjectProperties list.
 * - Deletes layer-property links if the property is no longer in newProjectProperties.
 * - Adds layer-property links if a property in newProjectProperties is not yet linked to the layer.
 * - Updates existing links (e.g., isVisible flag) based on newProjectProperties.
 *
 * @param db The Drizzle database instance.
 * @param projectId The ID of the project whose layers' properties are to be synchronized.
 * @param newProjectProperties An array of Property objects representing the desired state of properties
 *                             that ALL layers in this project should be linkable to.
 *                             The `isVisible` flag on these Property objects is NOT directly used here;
 *                             the link to layerProperty will default to true for new links or be updated
 *                             if `upsertLayerProperties` receives specific visibility data for the link.
 */
export const syncLayerProperties = async (
  db: Database,
  projectId: string,
  newProjectProperties: Property[]
): Promise<void> => {
  // 1. Fetch all Layer IDs for the given Project ID
  const projectLayers = await db.query.layer.findMany({
    where: eq(layer.projectId, projectId),
    columns: {
      id: true // We only need the layer IDs
    }
  });

  if (projectLayers.length === 0) return;

  // Prepare the property links structure that upsertLayerProperties expects
  // This will be the same list of target properties for every layer in the project.
  const targetPropertyLinks = newProjectProperties.map((prop) => ({
    propertyId: prop.id,
    isVisible: false // Default to not visible for new properties
  }));

  // 2. For each layer in the project, synchronize its properties using upsertLayerProperties
  for (const l of projectLayers) {
    await upsertLayerProperties(db, l.id, targetPropertyLinks);
  }
};

// ═══════════════════════
// 3. CRUD :: ORCHESTRATION
// ═══════════════════════

/**
 * Creates a new layer with translations and properties
 * @param db - The database instance
 * @param data - The layer data to insert
 * @returns The newly created layer with related data
 */
export const createLayerWithRelated = async (db: Database, data: LayerNew) => {
  const layer = await createLayer(db, data);
  const i18n = await createI18n(db, data.i18n!, layer.id);
  const properties = await createLayerProperties(db, layer.id, data.properties || []);

  // Get project with relations using proper function signature
  const projectNested = await db.query.project.findFirst({
    where: eq(project.id, layer.projectId),
    with: {
      i18n: true,
      organisation: {
        with: {
          i18n: true
        }
      }
    }
  });

  return {
    ...layer,
    i18n,
    properties,
    project: projectNested
  };
};

/**
 * Updates a layer with translations and properties
 * @param db - The database instance
 * @param layerId - The ID of the layer to update
 * @param data - The layer data to update
 * @returns The updated layer with related data
 */
export const updateLayerWithRelated = async (
  db: Database,
  data: LayerPartial,
  layerId?: string
) => {
  const IdToUse = layerId || (data.id as string);
  const layer = await updateLayer(db, data, IdToUse);
  const i18n = await updateI18n(
    db,
    data.i18n as Record<Locale, LayerI18nPartial>,
    IdToUse
  );
  const properties = await updateLayerProperties(
    db,
    IdToUse,
    (data.properties || []) as LayerPropertyNew[]
  );
  // Get project with relations using proper function signature
  const projectData = await db.query.project.findFirst({
    where: eq(project.id, layer.projectId),
    with: {
      i18n: true,
      organisation: {
        with: {
          i18n: true
        }
      }
    }
  });
  return {
    ...layer,
    i18n,
    properties,
    project: projectData
  };
};

// ═══════════════════════
// 4. UTILS :: SHAPING
// ═══════════════════════

/**
 * Convert layer data to form shape for validation
 * @param data - The layer database entity
 * @param i18n - Array of layer translations
 * @param properties - Array of layer properties
 * @returns Validated form data
 */
export const toFormShape = async (
  data: LayerDBRaw, // Use any since this may come with relations loaded
  i18n: LayerI18nDB[],
  properties: LayerPropertyDBRaw[]
) => {
  const formData = {
    ...data,
    i18n: transformI18nSafely(i18n, {}),
    properties: properties.map((prop) => ({
      ...prop,
      property: {
        ...prop.property,
        i18n: transformI18nSafely(prop.property.i18n, {}),
        values: prop.property.values.map((val) => ({
          ...val,
          i18n: transformI18nSafely(val.i18n, {})
        }))
      }
    }))
  };

  // @ts-ignore TODO - Fix Zod type error
  const form = await superValidate(formData, zod(LayerAPI) as any);
  return form as SuperValidated<Layer>;
};

/**
 * Builds response data from database entities
 * @param layer - The layer database entity with relations
 * @param i18n - Array of layer translations
 * @param properties - Array of layer properties
 * @returns A parsed response shape
 */
export const toResponseShape = async (
  layer: any, // Use any since this comes with relations loaded
  i18n: LayerI18nDB[],
  properties: any[] // Use any for the complex nested structure from DB relations
) => {
  const data = {
    ...layer,
    i18n: transformI18nSafely(i18n, {}),
    properties
  };
  return LayerAPI.parse(data);
};

// ═══════════════════════
// 5. UTILS :: LOOKUPS
// ═══════════════════════

/**
 * Gets a map of layer data with properties for multiple layer IDs
 * @param db - The database instance
 * @param layerIds - Array of layer IDs to fetch
 * @returns Map of layer ID to layer data with properties
 */
export const getLayerMap = async (
  db: Database,
  layerIds: Id[],
  opts: HubOptsExtended
): Promise<Map<Id, LayerDBRaw>> => {
  const layersMap = new Map<Id, LayerDBRaw>();

  for (const layerId of layerIds) {
    const conditions = [eq(layer.id, layerId)];
    const layerData = await getLayer(db, layerMergeWithRelations, conditions, opts);
    if (layerData) {
      layersMap.set(layerId, layerData);
    }
  }

  return layersMap;
};
