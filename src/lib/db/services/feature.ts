// NANOID
import { nanoid } from 'nanoid';
// DRIZZLE
import { and, eq, inArray, SQL, type InferInsertModel } from 'drizzle-orm';
// LIB
import { toRelatedRecords, transformI18nSafely } from '..';
import { insert, update, insertManyRelated, replaceManyRelated } from '../crud';
// API
import { logZodError } from '$lib/api';
// SUPERFORMS
import { superValidate, type SuperValidated } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
// SCHEMAS
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  featureImage,
  image,
  layer
} from '../schema';
// SERVICES
import { getLayer } from './layer';
import { getFeatureHubFilter } from './hub';
// ZOD
import {
  FeatureUpdateAPI,
  FeatureCollectionAPI,
  FeaturePropertyCollectionAPI,
  FeatureAPI,
  FeaturePropertyAPI
} from '../zod';
// ENUMS
import { ImageIntent } from '$lib/enums';
// TYPES
import type {
  Database,
  Feature,
  FeatureDB,
  FeatureDBNew,
  FeatureDBPartial,
  FeatureDBRaw,
  FeatureI18nDB,
  FeatureI18nNew,
  FeatureI18nPartial,
  FeatureNew,
  FeaturePartial,
  FeatureProperty,
  FeaturePropertyDB,
  FeaturePropertyMerge,
  Id,
  LayerDB,
  LayerDBRaw,
  Locale,
  NewFeatureProperty,
  ImageDB,
  ImageDBFlat,
  HubOpts
} from '$lib/types';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CRUD :: CORE OPERATIONS
//    - listFeatures
//    - getFeature
//    - createFeature
//    - updateFeature
//
// 2. CRUD :: RELATIONAL OPERATIONS
//    - createI18n
//    - updateI18n
//    - createProperties
//    - updateProperties
//
// 3. CRUD :: ORCHESTRATION
//    - createFeatureWithRelated
//    - updateFeatureWithRelated
//
// 4. UTILS :: LOOKUPS
//    - getProjectIdForFeature
//    - getProjectIdForFeatureId
//
// 5. UTILS :: RESHAPE
//    - toPropertyShape
//    - toFormShape
//    - toResponseShape
//    - mergeFeatureProperties
//    - buildCollectionResponseShape
//    - buildResponseShape
//
// 6. UTILS :: IMAGE EXTENSION
//    - selectCanonicalOrFirstImage

/********************
 *  1. CRUD :: CORE OPERATIONS
 ************/

export const listFeatures = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<FeatureDB[]> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getFeatureHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  return await db.query.feature.findMany({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

/**
 * Lists features and includes a canonical or first image for each, plus image counts for filtering.
 * - Prioritizes images where featureImage.intent === \'canonical\'.
 * - Falls back to the first associated image if no canonical one is found.
 * - Image will be null if no images are associated.
 * - Includes imageCount and imagePublishedCount for filtering purposes.
 */
export const listFeaturesWithImage = async (
  db: Database,
  // Allows specifying other relations to be included alongside the feature and its image
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<FeatureDBRaw[]> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getFeatureHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }
  // Define the relations needed to fetch featureImages and their nested images
  const relationsForImageFetch: Record<string, boolean | object> = {
    ...withRelations,
    images: {
      // Relation from feature to featureImage table (feature.images)
      with: {
        image: {
          // Relation from featureImage to image table (featureImage.image)
          with: {
            contributor: true
          }
        }
      }
    }
  };

  const featuresRaw = await db.query.feature.findMany({
    with: relationsForImageFetch,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });

  return featuresRaw as FeatureDBRaw[];
};

export const getFeature = async (
  db: Database,
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<FeatureDB | undefined> => {
  const allConditions = [...conditions];
  // Apply hub filtering if opts is provided
  const hubFilter = getFeatureHubFilter(db, opts);
  if (hubFilter) {
    allConditions.push(hubFilter);
  }

  return await db.query.feature.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });
};

/**
 * Gets a single feature and includes its canonical or first image.
 * - Prioritizes images where featureImage.intent === \'canonical\'.
 * - Falls back to the first associated image if no canonical one is found.
 * - Image will be null if no images are associated.
 */
export const getFeatureWithImage = async (
  db: Database,
  // Allows specifying other relations to be included alongside the feature and its image
  withRelations: Record<string, boolean | object> = {},
  conditions: SQL<unknown>[] = [],
  opts: HubOpts
): Promise<(FeatureDB & { image: ImageDB | null }) | undefined> => {
  // Apply hub filtering if opts is provided
  const hubFilter = getFeatureHubFilter(db, opts);
  if (hubFilter) {
    conditions.push(hubFilter);
  }

  const featureRaw = await db.query.feature.findFirst({
    with: withRelations,
    where: conditions.length > 0 ? and(...conditions) : undefined
  });

  if (!featureRaw) return undefined;

  // Post-process to select the canonical or first image
  const selectedImage = selectCanonicalOrFirstImage((featureRaw as any).images, false);

  // Return both the selected image AND preserve the images array for entity responses
  return { ...featureRaw, image: selectedImage } as any;
};

/**
 * Updates an existing feature in the database
 * @param db - The database instance
 * @param data - The updated feature data
 * @returns The updated feature
 * @throws {Error} If the feature update fails or feature is not found
 */
export const createFeature = async (db: Database, data: FeatureDBNew) =>
  await insert(db, feature, data);

/**
 * Updates an existing feature in the database
 * @param db - The database instance
 * @param data - The updated feature data
 * @param ref - The feature ID
 * @returns The updated feature
 * @throws {Error} If the feature update fails or feature is not found
 */
export const updateFeature = async (
  db: Database,
  data: FeatureDBPartial,
  ref: Id
): Promise<FeatureDB> => await update(db, feature, data, feature.id, ref);

/********************
 *  2. CRUD :: RELATIONAL OPERATIONS
 ************/

/**
 * Creates relational i18n records for a feature
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param featureId - The ID of the feature
 * @returns The created i18n records
 */
export const createI18n = async (
  db: Database,
  i18n: Record<Locale, FeatureI18nNew>,
  featureId: Id
) => {
  return await insertManyRelated(
    db,
    featureI18n,
    toRelatedRecords(i18n, 'featureId', featureId, 'locale') as any,
    'featureId',
    featureId
  );
};

/**
 * Updates relational i18n records for a feature
 * @param db - The database instance
 * @param i18n - Record of translations for each target locale
 * @param featureId - The ID of the feature
 * @returns The updated i18n records
 */
export const updateI18n = async (
  db: Database,
  i18n: Record<Locale, FeatureI18nPartial>,
  featureId: Id
) => {
  const relatedRecords = toRelatedRecords(
    i18n,
    'featureId',
    featureId,
    'locale'
  ) as InferInsertModel<typeof featureI18n>[];
  return await replaceManyRelated(
    db,
    featureI18n,
    relatedRecords,
    featureI18n.featureId,
    featureId
  );
};

/**
 * Creates feature property i18n records
 * @param db - The database instance
 * @param featurePropertyId - The ID of the feature property
 * @param i18n - The i18n data to create
 * @returns The created i18n records
 */
const createFeaturePropertyI18n = async (
  db: Database,
  featureId: Id,
  propertyId: Id,
  i18n: Record<Locale, any>
) => {
  const i18nRecords = Object.entries(i18n).map(([locale, data]) => ({
    featureId,
    propertyId,
    locale: locale as Locale,
    value: data.value || null,
    valueGen: Boolean(data.valueGen) || false
  }));

  // Use upsert behavior for composite key
  for (const record of i18nRecords) {
    await db
      .insert(featurePropertyI18n)
      .values(record)
      .onConflictDoUpdate({
        target: [
          featurePropertyI18n.featureId,
          featurePropertyI18n.propertyId,
          featurePropertyI18n.locale
        ],
        set: {
          value: record.value,
          valueGen: record.valueGen
        }
      });
  }

  return await db.query.featurePropertyI18n.findMany({
    where: and(
      eq(featurePropertyI18n.featureId, featureId),
      eq(featurePropertyI18n.propertyId, propertyId)
    )
  });
};

/**
 * Creates feature properties using UPSERT with composite key
 * @param db - The database instance
 * @param featureId - The ID of the feature
 * @param properties - The properties to create
 * @returns The created properties
 */
export const createProperties = async (
  db: Database,
  featureId: Id,
  properties: NewFeatureProperty[]
) => {
  if (properties && properties.length > 0) {
    for (const prop of properties) {
      const { i18n, ...propData } = prop;

      // Upsert the base property using composite key
      const propertyToInsert = {
        featureId,
        propertyId: prop.propertyId,
        value: prop.value ?? null,
        propertyValueId:
          prop.propertyValueId && prop.propertyValueId !== ''
            ? prop.propertyValueId
            : null
      };

      await db
        .insert(featureProperty)
        .values(propertyToInsert)
        .onConflictDoUpdate({
          target: [featureProperty.featureId, featureProperty.propertyId],
          set: {
            value: propertyToInsert.value,
            propertyValueId: propertyToInsert.propertyValueId
          }
        });

      // Create i18n records if they exist
      if (prop.i18n) {
        await createFeaturePropertyI18n(db, featureId, prop.propertyId, prop.i18n);
      }
    }
  }

  return await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      i18n: true,
      property: {
        with: {
          i18n: true,
          values: { with: { i18n: true } }
        }
      },
      propertyValue: {
        with: { i18n: true }
      }
    }
  });
};

/**
 * Updates feature properties using UPSERT with composite key
 * @param db - The database instance
 * @param properties - The properties to update
 * @param featureId - The ID of the feature
 * @returns The updated properties
 */
export const updateProperties = async (
  db: Database,
  properties: NewFeatureProperty[] | FeatureProperty[],
  featureId: Id
) => {
  // Get existing properties by composite key
  const existingProps = await db
    .select({ propertyId: featureProperty.propertyId })
    .from(featureProperty)
    .where(eq(featureProperty.featureId, featureId));

  const existingPropertyIds = new Set(existingProps.map((p) => p.propertyId));
  const incomingPropertyIds = new Set(properties.map((p) => p.propertyId));

  // Find properties to delete (in DB but not in incoming properties)
  const propertyIdsToDelete = [...existingPropertyIds].filter(
    (propertyId) => !incomingPropertyIds.has(propertyId)
  );

  // Delete removed properties
  if (propertyIdsToDelete.length > 0) {
    await db
      .delete(featureProperty)
      .where(
        and(
          eq(featureProperty.featureId, featureId),
          inArray(featureProperty.propertyId, propertyIdsToDelete)
        )
      );
  }

  // Upsert all incoming properties
  for (const prop of properties) {
    const { i18n, ...propData } = prop;

    const propertyToUpsert = {
      featureId,
      propertyId: prop.propertyId,
      value: prop.value ?? null,
      propertyValueId:
        prop.propertyValueId && prop.propertyValueId !== ''
          ? prop.propertyValueId
          : null
    };

    await db
      .insert(featureProperty)
      .values(propertyToUpsert)
      .onConflictDoUpdate({
        target: [featureProperty.featureId, featureProperty.propertyId],
        set: {
          value: propertyToUpsert.value,
          propertyValueId: propertyToUpsert.propertyValueId
        }
      });

    // Handle i18n records if they exist
    if (prop.i18n) {
      await createFeaturePropertyI18n(db, featureId, prop.propertyId, prop.i18n);
    }
  }

  // Get all updated properties with their related property data
  return await db.query.featureProperty.findMany({
    where: eq(featureProperty.featureId, featureId),
    with: {
      i18n: true,
      property: {
        with: {
          i18n: true,
          values: { with: { i18n: true } }
        }
      },
      propertyValue: {
        with: { i18n: true }
      }
    }
  });
};

/********************
 *  3. CRUD :: ORCHESTRATION
 ************/

/**
 * Creates a new feature with related translations and properties
 * @param db - The database instance
 * @param data - The feature data to insert
 * @returns The newly created feature with related data
 */
export const createFeatureWithRelated = async (db: Database, data: FeatureNew) => {
  const feature = await createFeature(db, data as FeatureDBNew);
  const i18n = await createI18n(db, data.i18n!, feature.id);
  const properties = await createProperties(db, feature.id, data.properties || []);

  return {
    ...feature,
    i18n,
    properties
  };
};

/**
 * Updates a feature with i18n, properties, and image following FeatureAPI schema.
 * @param db - The database instance
 * @param data - The feature data to update
 * @param featureId - Optional feature ID (defaults to data.id)
 * @returns The updated feature with related data following FeatureAPI
 */
export const updateFeatureWithRelated = async (
  db: Database,
  data: FeaturePartial,
  featureId: Id
): Promise<
  | (FeatureDB & {
      i18n: FeatureI18nDB[];
      properties: FeaturePropertyDB[];
      image: ImageDBFlat | null;
    })
  | undefined
> => {
  const idToUse = (data.id as string) || featureId;

  // Remove the id from the data to prevent UNIQUE constraint violation
  const { id, ...updateData } = data;

  const feature = await updateFeature(db, updateData, idToUse);
  const i18n = await updateI18n(
    db,
    (data.i18n || {}) as Record<Locale, FeatureI18nPartial>,
    feature.id
  );
  const properties = await updateProperties(
    db,
    data.properties as FeatureProperty[],
    featureId
  );

  // Use direct SQL query to get correct featureImage records (Drizzle relations are broken due to missing FK)
  const featureImageRecords = await db
    .select()
    .from(featureImage)
    .where(eq(featureImage.featureId, idToUse));

  // Get the actual image data for each featureImage record
  let selectedImage: ImageDB | null = null;
  if (featureImageRecords.length > 0) {
    // Build the correct structure for selectCanonicalOrFirstImage
    const imagesWithData = await Promise.all(
      featureImageRecords.map(async (featureImg) => {
        const imageData: ImageDB | undefined = await db.query.image.findFirst({
          where: eq(image.id, featureImg.imageId),
          with: {
            contributor: true
          }
        });
        return {
          ...featureImg,
          image: imageData as
            | (ImageDB & { contributor: { attribution: string | null } | null })
            | undefined
        };
      })
    );
    // Select canonical or first image using the correct data (admin context, no filtering)
    selectedImage = selectCanonicalOrFirstImage(imagesWithData, false);
  }

  return {
    ...feature,
    i18n,
    properties,
    image: selectedImage
  };
};

/********************
 *  4. UTILS :: LOOKUPS
 ************/

/**
 * Get the project ID for a feature.
 * @param db - The Drizzle instance
 * @param formData - The form data
 * @returns The project ID
 */
export const getProjectIdForFeature = async (
  db: Database,
  featureData: FeatureDBNew | FeatureNew,
  hubOpts: HubOpts
) => {
  const layerId = featureData.layerId;
  const conditions = [eq(layer.id, layerId)];
  if (!layerId) return undefined;
  return await getLayer(db, {}, conditions, hubOpts).then((layer) => layer!.projectId);
};

export const getProjectIdForFeatureId = async (
  db: Database,
  featureId: Id,
  hubOpts: HubOpts
) => {
  const featureData = (await getFeature(
    db,
    { layer: true },
    [eq(feature.id, featureId)],
    hubOpts
  )) as any;
  return (featureData?.layer as LayerDB).projectId;
};

/********************
 *  5. UTILS :: RESHAPE
 ************/

const toPropertyShape = (data: FeatureProperty[], isCollection: boolean = false) => {
  return data.map((fp) => {
    const propertyDef = fp.property;
    const propertyVal = fp.propertyValue;

    // Check if this property actually has i18n data and ensure it's in array format
    const hasI18nData = fp.i18n && Array.isArray(fp.i18n) && fp.i18n.length > 0;

    // Transform the data first, then validate
    const transformedProperty = {
      ...fp,
      // Handle the feature property's own i18n data (for translatable property values)
      // Set to null if no i18n data exists (this should make validation pass since i18n is nullable)
      i18n: hasI18nData ? transformI18nSafely(fp.i18n) : null,
      property: propertyDef
        ? {
            ...propertyDef,
            // Check if property i18n is already transformed or needs transformation
            i18n: transformI18nSafely(propertyDef.i18n),
            values: (propertyDef.values || []).map((val: any) => ({
              ...val,
              // Check if value i18n is already transformed or needs transformation
              i18n: transformI18nSafely(val.i18n)
            }))
          }
        : undefined,
      propertyValue: propertyVal
        ? {
            ...propertyVal,
            // Check if propertyValue i18n is already transformed or needs transformation
            i18n: transformI18nSafely(propertyVal.i18n)
          }
        : undefined
    };

    // Use the correct schema based on context
    const schema = isCollection ? FeaturePropertyCollectionAPI : FeaturePropertyAPI;
    return schema.parse(transformedProperty);
  });
};

/**
 * Rebuilds form data from database entities
 * @param data - The feature database entity
 * @param i18n - Array of feature translations
 * @param properties - Array of feature properties
 * @returns Validated form data
 */
export const toFormShape = async (
  data: FeatureDBRaw,
  i18n: FeatureI18nDB[],
  properties: FeaturePropertyDB[]
): Promise<SuperValidated<Feature>> => {
  // Transform properties for form context (not collection)
  const transformedProperties = properties.map((fp: FeaturePropertyMerge) => {
    const propertyDef = fp.property;
    const propertyVal = fp.propertyValue;

    return {
      ...fp,
      i18n: transformI18nSafely(fp.i18n),
      property: propertyDef
        ? {
            ...propertyDef,
            i18n: transformI18nSafely(propertyDef.i18n),
            values: propertyDef.values
              ? propertyDef.values.map((val: any) => ({
                  ...val,
                  i18n: transformI18nSafely(val.i18n)
                }))
              : null
          }
        : [],
      propertyValue: propertyVal
        ? {
            ...propertyVal,
            i18n: transformI18nSafely(propertyVal.i18n)
          }
        : undefined
    };
  });

  return (await superValidate(
    {
      ...data,
      i18n: transformI18nSafely(i18n),
      properties: transformedProperties
    },
    // @ts-ignore TODO - Fix Zod type error
    zod(FeatureUpdateAPI)
  )) as SuperValidated<Feature>;
};

/**
 * Rebuilds form data from database entities
 * @param featureData - The feature database entity
 * @param i18n - Array of feature translations
 * @param featurePropertyRecords - Array of feature properties
 * @returns Validated form data
 */
export const toResponseShape = async (
  data: FeatureDBRaw,
  i18n: FeatureI18nDB[],
  properties: FeatureProperty[],
  isCollection: boolean = false,
  shouldFilterUnpublishedImages: boolean = false
) => {
  const propertiesData = toPropertyShape(properties, isCollection);

  // Extract selected image and images array from raw data
  const rawImages = (data as any).images || [];
  const filteredImages = shouldFilterUnpublishedImages
    ? rawImages.filter((img: any) => img.isPublished)
    : rawImages;
  const selectedImage = selectCanonicalOrFirstImage(
    rawImages,
    shouldFilterUnpublishedImages
  );
  const imageCount = rawImages.length;
  const imagePublishedCount = rawImages.filter((img: any) => img.isPublished).length;

  if (isCollection) {
    // Collection response - only includes selected image, imageCount, imagePublishedCount
    return FeatureCollectionAPI.parse({
      ...data,
      i18n: transformI18nSafely(i18n),
      properties: propertiesData,
      image: selectedImage,
      imageCount,
      imagePublishedCount
    });
  } else {
    // Entity response - includes both selected image and images array
    const imagesArray =
      filteredImages?.map((img: any) => ({
        ...img.image,
        intent: img.intent,
        isPublished: img.isPublished,
        publishedAt: img.publishedAt,
        attribution: img.image?.contributor?.attribution || img.image?.credit || null
      })) || null;

    return FeatureAPI.parse({
      ...data,
      i18n: transformI18nSafely(i18n),
      properties: propertiesData,
      image: selectedImage,
      images: imagesArray
    });
  }
};

/**
 * Merges feature properties with layer properties, respecting visibility settings
 * @param featureData - The feature database entity
 * @param layerData - The layer database entity with properties
 * @returns The merged feature with only visible properties
 */
export function mergeFeatureProperties(
  featureData: Feature,
  layerData: LayerDBRaw
): Feature {
  if (!featureData.properties) {
    featureData.properties = [];
  }
  // FILTER :: Remove invisible properties
  const visibleLayerProperties = new Map();
  layerData.properties?.forEach((layerProp) => {
    if (layerProp.isVisible) {
      visibleLayerProperties.set(layerProp.propertyId, layerProp);
    }
  });
  featureData.properties = featureData.properties.filter((featureProp) => {
    return visibleLayerProperties.has(featureProp.propertyId);
  });

  // ID :: Get existing property IDs after filtering
  const existingPropertyIds = new Set(
    featureData.properties.map((prop) => prop.propertyId)
  );

  // EXTEND :: Add new visible properties that don't exist yet
  visibleLayerProperties.forEach((layerProp, propertyId) => {
    if (!existingPropertyIds.has(propertyId)) {
      const propDefinition = layerProp.property;
      if (propDefinition && typeof propDefinition.i18n !== 'object') {
        propDefinition.i18n = transformI18nSafely(propDefinition.i18n);
      }

      featureData.properties.push({
        id: nanoid(12),
        featureId: featureData.id,
        propertyId: propertyId,
        value: null,
        propertyValueId: null,
        property: propDefinition,
        propertyValue: undefined
      } as FeatureProperty);
    }
  });

  return featureData;
}

/**
 * Builds response shape for a collection of features with layer property merging
 * @param db - The database instance
 * @param features - Array of feature database entities
 * @param hubOpts - Hub options
 * @param shouldFilterUnpublishedImages - Whether to filter unpublished images
 * @returns Array of validated response data
 */
export const buildCollectionResponseShape = async (
  db: Database,
  features: FeatureDBRaw[],
  hubOpts: HubOpts,
  shouldFilterUnpublishedImages: boolean = false
) => {
  // Get unique layer IDs from the features
  const uniqueLayerIds = [...new Set(features.map((feature) => feature.layerId))];

  // Fetch layer data with properties for all unique layers
  const { getLayerMap } = await import('./layer');
  const layersMap = await getLayerMap(db, uniqueLayerIds, hubOpts);

  // Build the response shape with merged properties
  const data = await Promise.all(
    features.map(async (feature) => {
      const layerData = layersMap.get(feature.layerId);
      let processedFeature = feature as any;

      // Merge properties if layer data is available
      if (layerData) {
        processedFeature = mergeFeatureProperties(processedFeature, layerData);
      }

      return await toResponseShape(
        processedFeature,
        processedFeature.i18n || [],
        processedFeature.properties || [],
        true,
        shouldFilterUnpublishedImages
      );
    })
  );

  return data;
};

/**
 * Builds response shape for a single feature with layer property merging
 * @param db - The database instance
 * @param feature - Feature database entity
 * @param hubOpts - Hub options
 * @param shouldFilterUnpublishedImages - Whether to filter unpublished images
 * @returns Validated response data
 */
export const buildResponseShape = async (
  db: Database,
  feature: FeatureDBRaw,
  hubOpts: HubOpts,
  shouldFilterUnpublishedImages: boolean = false
) => {
  // Fetch layer data with properties to merge visible properties
  const { getLayer } = await import('./layer');
  const { layerEntityWithRelations } = await import('$lib/api/services/layer');
  const conditions = [eq(layer.id, feature.layerId)];
  const layerData = (await getLayer(
    db,
    layerEntityWithRelations,
    conditions,
    hubOpts
  )) as LayerDBRaw;

  let processedFeature = feature as any;

  // Merge properties if layer data is available
  if (layerData) {
    processedFeature = mergeFeatureProperties(processedFeature, layerData);
  }

  try {
    const data = await toResponseShape(
      processedFeature,
      processedFeature.i18n || [],
      processedFeature.properties || [],
      false,
      shouldFilterUnpublishedImages
    );

    return data;
  } catch (error) {
    logZodError(error, '[buildResponseShape] Validation error:');
    throw error;
  }
};

// ═════════════════════════════
// 6. UTILS :: IMAGE EXTENSION
// ═════════════════════════════

/**
 * Selects the canonical image, or the first available image, from a list of feature images.
 * @param featureImages - Array of feature image records (relation from feature to featureImage, with nested image).
 * @param shouldFilterUnpublished - Whether to filter out unpublished images (for public requests)
 * @returns The selected ImageDB record or null if no suitable image is found.
 */
const selectCanonicalOrFirstImage = (
  featureImages?: (NonNullable<unknown> & {
    intent: string | null;
    isPublished: boolean;
    publishedAt: string | null;
    image:
      | (ImageDB & { contributor: { attribution: string | null } | null })
      | undefined;
  })[],
  shouldFilterUnpublished: boolean = false
): ImageDBFlat | null => {
  let selectedFeatureImage: any = null;

  if (featureImages && featureImages.length > 0) {
    // Filter out unpublished images if requested
    const availableImages = shouldFilterUnpublished
      ? featureImages.filter((fi) => fi.isPublished)
      : featureImages;

    const canonicalFeatureImage = availableImages.find(
      (fi) => fi.intent === ImageIntent.canonical
    );

    if (canonicalFeatureImage && canonicalFeatureImage.image) {
      selectedFeatureImage = canonicalFeatureImage;
    } else if (availableImages[0] && availableImages[0].image) {
      // Fallback to the first image if no canonical one is found
      selectedFeatureImage = availableImages[0];
    }
  }

  if (!selectedFeatureImage || !selectedFeatureImage.image) {
    return null;
  }

  // Extract attribution from contributor
  const attribution =
    selectedFeatureImage.image.contributor?.attribution ||
    selectedFeatureImage.image.credit ||
    null;

  return {
    ...selectedFeatureImage.image,
    intent: selectedFeatureImage.intent,
    isPublished: selectedFeatureImage.isPublished,
    publishedAt: selectedFeatureImage.publishedAt,
    attribution
  };
};
