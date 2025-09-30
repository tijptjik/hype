// SVELTE
import { nanoid } from 'nanoid';
// TYPES
import type { ImportCtx } from '$lib/context/import.svelte';
import type {
  Feature,
  FeaturePartial,
  Id,
  AddressMeta,
  AddressProperties
} from '$lib/types';

export interface FeatureResolutionData {
  rowIndex: number;
  existing?: Feature; // Existing feature from API
  submitted: Record<string, any>; // CSV data submitted by user
  enriched: Record<string, any>; // Enriched data from import process
  merged: Feature; // Final merged data to be submitted
  saved?: Feature; // Actual saved feature data from API after successful submission
  isNew: boolean; // Whether this is a new feature or update
  status: 'pending' | 'processing' | 'success' | 'error' | 'skipped' | 'unchanged';
  error?: string;
}

export interface FeatureResolutionState {
  isProcessing: boolean;
  currentIndex: number;
  total: number;
  results: FeatureResolutionData[];
  showPreview: boolean;
  previewIndex: number;
}

/**
 * Deep comparison function to check if two feature objects are essentially the same
 * Ignores createdAt, modifiedAt, and other timestamp fields
 */
function deepCompareFeatures(existing: Feature, merged: Feature): boolean {
  // Create clean copies without timestamp fields
  const cleanExisting = { ...existing };
  const cleanMerged = { ...merged };

  // Remove timestamp fields
  delete cleanExisting.createdAt;
  delete cleanExisting.modifiedAt;
  delete cleanMerged.createdAt;
  delete cleanMerged.modifiedAt;

  // Remove read-only fields that might differ
  delete (cleanExisting as any).contributor;
  delete (cleanExisting as any).publisher;
  delete (cleanExisting as any).image;
  delete (cleanExisting as any).images;
  delete (cleanMerged as any).contributor;
  delete (cleanMerged as any).publisher;
  delete (cleanMerged as any).image;
  delete (cleanMerged as any).images;

  // Deep comparison function
  function deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;

    if (obj1 == null || obj2 == null) return obj1 === obj2;

    if (typeof obj1 !== typeof obj2) return false;

    if (typeof obj1 !== 'object') return obj1 === obj2;

    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) return false;
      for (let i = 0; i < obj1.length; i++) {
        if (!deepEqual(obj1[i], obj2[i])) return false;
      }
      return true;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }

  return deepEqual(cleanExisting, cleanMerged);
}

/**
 * Initialize feature resolution process
 */
export async function initializeFeatureResolution(
  importCtx: ImportCtx
): Promise<FeatureResolutionData[]> {
  const data = importCtx.getData();
  const columns = importCtx.getColumns();
  const headers = importCtx.getHeaders();

  const results: FeatureResolutionData[] = [];

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    const submitted = extractSubmittedData(row, columns, headers);
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {};

    // Determine if this is a new feature or update based on ID field
    const featureIdColumn = columns.find(
      (col) => col.modelType === 'Feature' && col.field === 'id'
    );
    const isNew =
      !featureIdColumn || !row[headers.indexOf(featureIdColumn.header)]?.trim();

    // Pre-populate merged data for preview
    try {
      // For existing features, fetch the existing data and do deep comparison
      let existing: Feature | null = null;
      let status: 'pending' | 'unchanged' | 'skipped' = 'pending';

      if (!isNew && submitted.feature?.id) {
        const featureId = submitted.feature.id;
        const isTargetId = [
          'aveKsX1ch7Ud',
          'HpIyPtWUffXJ',
          'D6f5_izBoOHu',
          'pb7SrfBqh6-I'
        ].includes(featureId);

        try {
          existing = await fetchExistingFeature(featureId);

          // If marked for update but feature doesn't exist, mark as skipped
          if (!existing) {
            status = 'skipped';
          }
        } catch (error) {
          console.warn(`Could not fetch existing feature ${featureId}:`, error);

          // If there was an error fetching the feature, mark as skipped
          status = 'skipped';
        }
      }

      const merged = mergeFeatureData(existing, submitted, enriched, importCtx);

      // For existing features, check if the merged data is essentially the same as existing
      if (!isNew && existing && merged) {
        const isUnchanged = deepCompareFeatures(existing, merged);
        if (isUnchanged) {
          status = 'unchanged';
        }
      }

      const result = {
        rowIndex,
        existing,
        submitted,
        enriched,
        merged,
        isNew,
        status,
        error:
          status === 'skipped'
            ? `Feature ${submitted.feature?.id || 'unknown'} marked for update but not found in database`
            : undefined
      };

      // Debug logging for target IDs
      if (!isNew && submitted.feature?.id) {
        const featureId = submitted.feature.id;
        const isTargetId = [
          'aveKsX1ch7Ud',
          'HpIyPtWUffXJ',
          'D6f5_izBoOHu',
          'pb7SrfBqh6-I'
        ].includes(featureId);
      }

      results.push(result);
    } catch (error) {
      console.error(`❌ Error pre-merging data for row ${rowIndex + 1}:`, error);
      // Create a minimal valid Feature object for error cases
      const errorFeature: Feature = {
        id: nanoid(12),
        organisationId: importCtx.getSelectedOrganisation()?.id || '',
        projectId: importCtx.getSelectedProject()?.id || '',
        layerId: '',
        contributorId: '',
        geometry: { type: 'Point', coordinates: [0, 0] },
        addressMeta: {},
        isPublished: false,
        publishedAt: null,
        publisherId: null,
        isPendingReview: false,
        isArchived: false,
        isIntangible: false,
        isVisitable: true,
        visitableAsOf: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        i18n: {},
        properties: []
      };

      results.push({
        rowIndex,
        existing,
        submitted,
        enriched,
        merged: errorFeature,
        isNew,
        status: 'pending',
        error:
          error instanceof Error ? error.message : 'Unknown error during data merge'
      });
    }
  }

  return results;
}

/**
 * Extract submitted data from CSV row
 */
function extractSubmittedData(
  row: string[],
  columns: any[],
  headers: string[]
): Record<string, any> {
  const submitted: Record<string, any> = {
    feature: {},
    i18n: {},
    properties: {},
    user: {},
    layer: {},
    addressMeta: {},
    addressProperties: {}
  };

  columns.forEach((column, index) => {
    const value = row[index]?.trim();
    if (!value || column.modelType === 'SKIP') return;

    const headerIndex = headers.indexOf(column.header);
    if (headerIndex === -1) return;

    switch (column.modelType) {
      case 'Feature':
        if (column.locale && column.locale !== 'None') {
          if (!submitted.i18n[column.locale]) {
            submitted.i18n[column.locale] = {};
          }
          submitted.i18n[column.locale][column.field] = value;
        } else {
          submitted.feature[column.field] = value;
        }
        break;

      case 'User':
        submitted.user[column.field] = value;
        break;

      case 'Layer':
        submitted.layer[column.field] = value;
        break;

      case 'Property':
        if (!submitted.properties[column.extractedPropertyKey || column.propertyKey]) {
          submitted.properties[column.extractedPropertyKey || column.propertyKey] = {};
        }
        submitted.properties[column.extractedPropertyKey || column.propertyKey][
          column.field
        ] = value;
        break;

      case 'AddressMeta':
        submitted.addressMeta[column.field] = value;
        break;

      case 'Address':
        if (column.locale && column.locale !== 'None') {
          if (!submitted.addressProperties[column.locale]) {
            submitted.addressProperties[column.locale] = {};
          }
          submitted.addressProperties[column.locale][column.field] = value;
        }
        break;
    }
  });

  return submitted;
}

/**
 * Fetch existing feature from API
 */
export async function fetchExistingFeature(featureId: string): Promise<Feature | null> {
  const isTargetId = [
    'aveKsX1ch7Ud',
    'HpIyPtWUffXJ',
    'D6f5_izBoOHu',
    'pb7SrfBqh6-I'
  ].includes(featureId);

  try {
    if (isTargetId) {
    }

    const response = await fetch(`/api/features/${featureId}`, {
      headers: {
        'x-admin-request': 'true'
      }
    });

    if (isTargetId) {
    }

    if (!response.ok) {
      if (response.status === 404) {
        if (isTargetId) {
        }
        return null;
      }
      throw new Error(`Failed to fetch feature: ${response.statusText}`);
    }

    const result = await response.json();

    if (isTargetId) {
    }

    // The API returns the feature directly, not wrapped in a data property
    return result.data || result;
  } catch (error) {
    if (isTargetId) {
    } else {
      console.error('Error fetching existing feature:', error);
    }
    throw error;
  }
}

/**
 * Merge data according to the priority rules specified
 */
export function mergeFeatureData(
  existing: Feature | null,
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx
): Feature {
  const merged: Feature = existing
    ? (() => {
        const { contributor, publisher, image, images, ...cleanExisting } = existing;
        return cleanExisting;
      })()
    : {
        id: submitted.feature?.id || nanoid(12), // Use submitted ID if available, otherwise generate new
        organisationId: importCtx.getSelectedOrganisation()?.id || '',
        projectId: importCtx.getSelectedProject()?.id || '',
        layerId: '',
        contributorId: '',
        geometry: {
          type: 'Point',
          coordinates: getCoordinates(submitted, enriched) // Default to HK coordinates
        },
        addressMeta: {},
        isPublished: false,
        publishedAt: null,
        publisherId: null,
        isPendingReview: false,
        isArchived: false,
        isIntangible: false,
        isVisitable: true,
        visitableAsOf: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        i18n: {},
        properties: []
        // Exclude read-only fields: contributor, publisher, image, images
      };

  // Update basic feature fields
  // Priority: enriched (normalized) > submitted

  // Log enriched boolean values if present
  if (enriched.feature) {
    const booleanFields = ['isPublished', 'isArchived', 'isIntangible', 'isVisitable'];
    const enrichedBooleans = booleanFields.filter(
      (field) => enriched.feature[field] !== undefined
    );
    if (enrichedBooleans.length > 0) {
    }
  }

  // isPublished
  if (enriched.feature?.isPublished !== undefined) {
    merged.isPublished = enriched.feature.isPublished;
  } else if (submitted.feature.isPublished !== undefined) {
    merged.isPublished =
      submitted.feature.isPublished === 'true' ||
      submitted.feature.isPublished === true;
  } else if (submitted.feature.published !== undefined) {
    merged.isPublished =
      submitted.feature.published === 'true' || submitted.feature.published === true;
  }

  // isArchived
  if (enriched.feature?.isArchived !== undefined) {
    merged.isArchived = enriched.feature.isArchived;
  } else if (submitted.feature.archived !== undefined) {
    merged.isArchived =
      submitted.feature.archived === 'true' || submitted.feature.archived === true;
  }

  // isIntangible
  if (enriched.feature?.isIntangible !== undefined) {
    merged.isIntangible = enriched.feature.isIntangible;
  } else if (submitted.feature.intangible !== undefined) {
    merged.isIntangible =
      submitted.feature.intangible === 'true' || submitted.feature.intangible === true;
  }

  // isVisitable
  if (enriched.feature?.isVisitable !== undefined) {
    merged.isVisitable = enriched.feature.isVisitable;
  } else if (submitted.feature.visitable !== undefined) {
    merged.isVisitable =
      submitted.feature.visitable === 'true' || submitted.feature.visitable === true;
  }

  if (submitted.feature.lastSeen) {
    merged.visitableAsOf = submitted.feature.lastSeen;
  }

  // Merge addressMeta (priority: submitted > enriched > existing)
  merged.addressMeta = mergeAddressMeta(
    existing?.addressMeta || {},
    enriched.addressMeta || enriched.feature?.addressMeta || {},
    submitted.addressMeta || {}
  );

  // Update layer and contributor IDs
  merged.layerId = getLayerId(submitted, enriched, importCtx);
  merged.contributorId = getContributorId(submitted, enriched, importCtx);

  // Merge i18n data (including translations from translation step)
  merged.i18n = mergeI18nData(
    existing?.i18n || {},
    enriched.feature?.i18n || enriched.i18n || {}, // Fix: geocoded data is in enriched.feature.i18n
    submitted.i18n || {},
    enriched, // Pass full enriched data to access translations
    merged.id // Pass feature ID for i18n records
  );

  // Merge properties
  merged.properties = mergeProperties(
    existing?.properties || [],
    enriched.properties || {},
    submitted.properties || {},
    merged.id, // Pass the feature ID
    importCtx // Pass import context for validation results
  );

  return merged;
}

/**
 * Get coordinates with priority: submitted > enriched
 * Returns [longitude, latitude] or null if not found
 */
function getCoordinates(
  submitted: Record<string, any>,
  enriched: Record<string, any>
): [number, number] | null {
  // 1. Check submitted feature fields
  if (
    submitted.feature?.longitude !== undefined &&
    submitted.feature?.latitude !== undefined
  ) {
    const longitude = parseFloat(submitted.feature.longitude);
    const latitude = parseFloat(submitted.feature.latitude);
    if (!isNaN(longitude) && !isNaN(latitude)) {
      // Check if coordinates might be swapped (common data error)
      // Longitude should be -180 to 180, Latitude should be -90 to 90
      // Hong Kong: ~114°E, ~22°N
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(
          `🚨 [getCoordinates] Invalid coordinate ranges detected in submitted.feature: longitude=${longitude}, latitude=${latitude}`
        );
      } else if (
        Math.abs(longitude) <= 90 &&
        Math.abs(latitude) <= 180 &&
        Math.abs(longitude) < Math.abs(latitude)
      ) {
        console.warn(
          `⚠️ [getCoordinates] Coordinates might be swapped in submitted.feature: longitude=${longitude}, latitude=${latitude}. ` +
            `Consider swapping if this is Hong Kong data (expected: ~114°E, ~22°N)`
        );
        console.warn(
          `⚠️ [getCoordinates] If swapped, coordinates would be: longitude=${latitude}, latitude=${longitude}`
        );
      }

      return [longitude, latitude];
    }
  }

  // 2. Check submitted addressMeta
  if (
    submitted.addressMeta?.longitude !== undefined &&
    submitted.addressMeta?.latitude !== undefined
  ) {
    const longitude = parseFloat(submitted.addressMeta.longitude);
    const latitude = parseFloat(submitted.addressMeta.latitude);
    if (!isNaN(longitude) && !isNaN(latitude)) {
      // Check if coordinates might be swapped (common data error)
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(
          `🚨 [getCoordinates] Invalid coordinate ranges detected in submitted.addressMeta: longitude=${longitude}, latitude=${latitude}`
        );
      } else if (
        Math.abs(longitude) <= 90 &&
        Math.abs(latitude) <= 180 &&
        Math.abs(longitude) < Math.abs(latitude)
      ) {
        console.warn(
          `⚠️ [getCoordinates] Coordinates might be swapped in submitted.addressMeta: longitude=${longitude}, latitude=${latitude}. ` +
            `Consider swapping if this is Hong Kong data (expected: ~114°E, ~22°N)`
        );
        console.warn(
          `⚠️ [getCoordinates] If swapped, coordinates would be: longitude=${latitude}, latitude=${longitude}`
        );
      }

      return [longitude, latitude];
    }
  }

  // 3. Check enriched feature geometry
  if (
    enriched.feature?.geometry?.coordinates &&
    Array.isArray(enriched.feature.geometry.coordinates) &&
    enriched.feature.geometry.coordinates.length >= 2
  ) {
    const longitude = parseFloat(enriched.feature.geometry.coordinates[0]);
    const latitude = parseFloat(enriched.feature.geometry.coordinates[1]);
    if (!isNaN(longitude) && !isNaN(latitude)) {
      return [longitude, latitude];
    }
  }

  // 4. Check enriched addressMeta
  if (
    enriched.addressMeta?.longitude !== undefined &&
    enriched.addressMeta?.latitude !== undefined
  ) {
    const longitude = parseFloat(enriched.addressMeta.longitude);
    const latitude = parseFloat(enriched.addressMeta.latitude);
    if (!isNaN(longitude) && !isNaN(latitude)) {
      return [longitude, latitude];
    }
  }

  const defaultCoordinates = [114.1736, 22.2875];

  return defaultCoordinates;
}

/**
 * Merge addressMeta with priority: submitted > enriched > existing
 */
function mergeAddressMeta(
  existing: AddressMeta,
  enriched: AddressMeta,
  submitted: AddressMeta
): AddressMeta {
  return {
    ...existing,
    ...enriched,
    ...submitted
  };
}

/**
 * Get layer ID from submitted data, enriched data, or fallback
 */
function getLayerId(
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx
): string {
  // Check submitted layer ID
  if (submitted.layer?.id) {
    return submitted.layer.id;
  }

  // Check enriched layer ID
  if (enriched.layer?.id) {
    return enriched.layer.id;
  }

  // Check layer validation fallback first (most common case)
  const layerValidation = importCtx.getLayerValidation();

  if (layerValidation.fallbackLayerId) {
    return layerValidation.fallbackLayerId;
  }

  // Check selected layer
  const selectedLayer = importCtx.getSelectedLayer();
  if (selectedLayer?.id) {
    return selectedLayer.id;
  }

  // Check layer resolution (for cases where layers were resolved)
  const layerResolution = importCtx.getLayerResolution();

  if (layerResolution.resolutions.size > 0) {
    const firstResolution = Array.from(layerResolution.resolutions.values())[0];
    if (firstResolution?.layerId) {
      return firstResolution.layerId;
    }
  }

  console.error('❌ No layer ID found in any source');
  console.error('Debug info:', {
    submitted: submitted.layer,
    enriched: enriched.layer,
    selectedLayer,
    layerValidation,
    layerResolution,
    allLayers: importCtx.getAllLayers(),
    layersLoaded: importCtx.getLayersLoaded()
  });

  // Last resort: try to find a suitable layer
  const allLayers = importCtx.getAllLayers();

  if (allLayers.length === 1) {
    // Also save this as the fallback for future use
    const layerValidation = importCtx.getLayerValidation();
    layerValidation.fallbackLayerId = allLayers[0].id;
    importCtx.setLayerValidation(layerValidation);
    return allLayers[0].id;
  }

  if (allLayers.length > 1) {
    // If multiple layers, try to find a reasonable default (first one)
    const layerValidation = importCtx.getLayerValidation();
    layerValidation.fallbackLayerId = allLayers[0].id;
    importCtx.setLayerValidation(layerValidation);
    return allLayers[0].id;
  }

  throw new Error('No layer ID available for feature - no layers found in project');
}

/**
 * Get contributor ID from submitted data, enriched data, or fallback
 */
function getContributorId(
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx
): string {
  // Check submitted user ID
  if (submitted.user?.id) {
    return submitted.user.id;
  }

  // Check enriched user ID
  if (enriched.user?.id) {
    return enriched.user.id;
  }

  // Check user validation fallback first (most common case)
  const userValidation = importCtx.getUserValidation();

  if (userValidation.fallbackUserId) {
    return userValidation.fallbackUserId;
  }

  // Check user resolution (for cases where users were resolved)
  const userResolution = importCtx.getUserResolution();

  if (userResolution.resolutions.size > 0) {
    const firstResolution = Array.from(userResolution.resolutions.values())[0];
    if (firstResolution?.userId) {
      return firstResolution.userId;
    }
  }

  console.error('❌ No contributor ID found in any source');
  console.error('Debug info:', {
    submitted: submitted.user,
    enriched: enriched.user,
    userValidation,
    userResolution
  });

  throw new Error('No contributor ID available for feature');
}

/**
 * Merge i18n data with priority: submitted > enriched > existing
 * Also integrates translation data from the translation step
 */
function mergeI18nData(
  existing: Record<string, any>,
  enriched: Record<string, any>,
  submitted: Record<string, any>,
  enrichedFull: Record<string, any>,
  featureId: string
): Record<string, any> {
  const merged: Record<string, any> = { ...existing };

  // Helper to ensure locale object has required fields
  function ensureLocaleFields(localeObj: any, locale: string): any {
    return {
      ...localeObj,
      featureId: featureId,
      locale: locale
    };
  }

  // Merge enriched data
  Object.keys(enriched).forEach((locale) => {
    if (!merged[locale]) merged[locale] = {};

    Object.keys(enriched[locale]).forEach((field) => {
      if (field === 'addressProperties') {
        // Complete replacement for addressProperties
        if (
          enriched[locale][field] &&
          Object.keys(enriched[locale][field]).length > 0
        ) {
          merged[locale][field] = enriched[locale][field];
        }
      } else {
        merged[locale][field] = enriched[locale][field];
      }
    });

    // Set generation flags for enriched data - preserve existing flags if they exist
    if (
      enriched[locale].displayAddress &&
      merged[locale].displayAddressGen === undefined
    ) {
      merged[locale].displayAddressGen = true;
    } else if (enriched[locale].displayAddress) {
    }
  });

  // Merge submitted data (highest priority)
  Object.keys(submitted).forEach((locale) => {
    if (!merged[locale]) merged[locale] = {};

    Object.keys(submitted[locale]).forEach((field) => {
      if (field === 'addressProperties') {
        // Complete replacement for addressProperties if any non-empty values exist
        const submittedAddressProps = submitted[locale][field];
        if (
          submittedAddressProps &&
          Object.values(submittedAddressProps).some((val) => val && String(val).trim())
        ) {
          merged[locale][field] = submittedAddressProps;
        }
      } else {
        merged[locale][field] = submitted[locale][field];
      }
    });

    // Set generation flags for submitted data (human verified)
    if (submitted[locale].title) {
      merged[locale].titleGen = false; // Human provided
    }
    if (submitted[locale].description) {
      merged[locale].descriptionGen = false; // Human provided
    }
    if (submitted[locale].displayAddress) {
      merged[locale].displayAddressGen = false; // Human provided
    }
  });

  // Integrate translation data from translation step
  // Look for titleTranslations, descriptionTranslations, etc.
  if (enrichedFull.titleTranslations) {
    Object.keys(enrichedFull.titleTranslations).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};
      merged[locale].title = enrichedFull.titleTranslations[locale];
      merged[locale].titleGen = true; // Generated from translation
    });
  }

  if (enrichedFull.descriptionTranslations) {
    Object.keys(enrichedFull.descriptionTranslations).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};
      merged[locale].description = enrichedFull.descriptionTranslations[locale];
      merged[locale].descriptionGen = true; // Generated from translation
    });
  }

  if (enrichedFull.rawAddressTranslations) {
    Object.keys(enrichedFull.rawAddressTranslations).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};
      merged[locale].rawAddress = enrichedFull.rawAddressTranslations[locale];
    });
  }

  if (enrichedFull.addressPropertiesTranslations) {
    Object.keys(enrichedFull.addressPropertiesTranslations).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};
      merged[locale].addressProperties =
        enrichedFull.addressPropertiesTranslations[locale];
    });
  }

  // Handle displayAddress translations with proper generation flags
  if (enrichedFull.displayAddressTranslations) {
    Object.keys(enrichedFull.displayAddressTranslations).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};
      // Only set if not already set by submitted data (which has higher priority)
      if (!merged[locale].displayAddress) {
        merged[locale].displayAddress = enrichedFull.displayAddressTranslations[locale];
        merged[locale].displayAddressGen = true; // Generated from translation
      }
    });
  }

  // Add addressProperties from enriched feature i18n data if missing
  if (enrichedFull.feature?.i18n) {
    Object.keys(enrichedFull.feature.i18n).forEach((locale) => {
      if (!merged[locale]) merged[locale] = {};

      const enrichedLocaleData = enrichedFull.feature.i18n[locale];

      // Add addressProperties if missing
      const enrichedAddressProps = enrichedLocaleData?.addressProperties;
      if (enrichedAddressProps && !merged[locale].addressProperties) {
        merged[locale].addressProperties = enrichedAddressProps;
      }

      // Add displayAddress and displayAddressGen if missing (but only if not set by translations or submitted)
      if (enrichedLocaleData?.displayAddress && !merged[locale].displayAddress) {
        merged[locale].displayAddress = enrichedLocaleData.displayAddress;
        if (merged[locale].displayAddressGen === undefined) {
          merged[locale].displayAddressGen =
            enrichedLocaleData.displayAddressGen ?? true;
        }
      }
    });
  }

  // Ensure all locale objects have required fields
  Object.keys(merged).forEach((locale) => {
    merged[locale] = ensureLocaleFields(merged[locale], locale);
  });

  return merged;
}

/**
 * Merge properties with special rules
 * Uses validation results from property-matching step to get correct IDs
 */
function mergeProperties(
  existingProperties: any[],
  enrichedProperties: Record<string, any>,
  submittedProperties: Record<string, any>,
  featureId: string,
  importCtx: ImportCtx
): any[] {
  const merged: any[] = [];
  const processedKeys = new Set<string>();

  // Get property enriched data from property reconciliation step
  const propertyReconciliation = importCtx.getPropertyReconciliation();

  // Log all enriched data entries
  propertyReconciliation.enrichedData.forEach((data, key) => {});

  // If enrichedData is empty, let's check the full reconciliation state
  if (propertyReconciliation.enrichedData.size === 0) {
    // Let's also check if the property reconciliation was ever run
  }

  // Also check if we can get property type information
  const fetchedProperties = importCtx.getFetchedProperties();

  // Create a map of property keys to their resolved IDs
  const propertyKeyToId = new Map<string, string>();

  // Add enriched properties from property reconciliation
  propertyReconciliation.enrichedData.forEach((data, key) => {
    if (data.propertyId) {
      propertyKeyToId.set(key, data.propertyId);
    }
  });

  // Keep existing properties that aren't referenced by submitted or enriched
  existingProperties.forEach((prop) => {
    const propertyKey = prop.property?.key;
    if (
      propertyKey &&
      !submittedProperties[propertyKey] &&
      !enrichedProperties[propertyKey]
    ) {
      merged.push(prop);
    }
  });

  // Add submitted properties
  Object.keys(submittedProperties).forEach((key) => {
    const submittedProp = submittedProperties[key];
    processedKeys.add(key);

    // Try to get propertyId from enriched properties first, then from reconciliation data
    const enrichedPropData = enrichedProperties[key];
    const propertyId =
      enrichedPropData?.propertyId ||
      propertyKeyToId.get(key) ||
      submittedProp.id ||
      '';
    const enrichedData = propertyReconciliation.enrichedData.get(key);

    // Resolve property value ID from mapping or direct value
    // Priority: submitted > enriched properties > reconciliation data
    let propertyValueId =
      submittedProp.valueId ||
      enrichedPropData?.propertyValueId ||
      enrichedData?.propertyValueId ||
      null;

    // Check if we have a property value mapping for this value
    if (!propertyValueId && enrichedData?.resolvedValues && submittedProp.value) {
      const mappedValueId = enrichedData.resolvedValues[submittedProp.value];
      propertyValueId = mappedValueId || null;
    }

    merged.push({
      featureId: featureId,
      propertyId: propertyId,
      propertyValueId: propertyValueId,
      value: propertyValueId ? null : submittedProp.value || null, // If propertyValueId exists, value should be null
      i18n: null // TODO: Implement featurePropertyI18n
    });

    const finalValue = propertyValueId ? null : submittedProp.value || null;

    // Special logging for boolean values
    if (submittedProp.value === 'TRUE' || submittedProp.value === 'FALSE') {
    }
  });

  // Add enriched properties (only if not already processed)
  Object.keys(enrichedProperties).forEach((key) => {
    if (!processedKeys.has(key)) {
      const enrichedProp = enrichedProperties[key];
      const propertyId =
        enrichedProp.propertyId || propertyKeyToId.get(key) || enrichedProp.id || '';
      const enrichedData = propertyReconciliation.enrichedData.get(key);

      // Resolve property value ID from mapping or direct value
      let propertyValueId =
        enrichedProp.propertyValueId || enrichedData?.propertyValueId || null;

      // Check if we have a property value mapping for this value
      if (!propertyValueId && enrichedData?.resolvedValues && enrichedProp.value) {
        propertyValueId = enrichedData.resolvedValues[enrichedProp.value] || null;
      }

      merged.push({
        featureId: featureId,
        propertyId: propertyId,
        propertyValueId: propertyValueId,
        value: propertyValueId ? null : enrichedProp.value || null, // If propertyValueId exists, value should be null
        i18n: null // TODO: Implement featurePropertyI18n
      });
    }
  });

  return merged;
}

/**
 * Parse superform validation error response using the same approach as form.svelte.ts
 */
function parseSuperformError(errorData: any): string {
  try {
    if (errorData.type === 'failure' && errorData.data?.errors) {
      // Handle superform validation errors similar to form.svelte.ts
      const errors = errorData.data.errors;
      const errorMessages: string[] = [];

      // Recursively extract error messages from the errors object
      function extractErrors(obj: any, path: string = ''): void {
        if (typeof obj === 'object' && obj !== null) {
          if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
              if (typeof item === 'string') {
                errorMessages.push(`${path}[${index}]: ${item}`);
              } else {
                extractErrors(item, `${path}[${index}]`);
              }
            });
          } else {
            Object.keys(obj).forEach((key) => {
              const value = obj[key];
              const currentPath = path ? `${path}.${key}` : key;

              if (typeof value === 'string') {
                errorMessages.push(`${currentPath}: ${value}`);
              } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                  if (typeof item === 'string') {
                    errorMessages.push(`${currentPath}[${index}]: ${item}`);
                  }
                });
              } else if (typeof value === 'object') {
                extractErrors(value, currentPath);
              }
            });
          }
        }
      }

      extractErrors(errors);

      if (errorMessages.length > 0) {
        return `Validation errors:\n${errorMessages.map((err) => `• ${err}`).join('\n')}`;
      }
    }

    // Fallback to original error message
    return errorData.message || 'Validation failed';
  } catch (parseError) {
    console.error('Error parsing superform validation:', parseError);
    return errorData.message || 'Validation failed - unable to parse error details';
  }
}

/**
 * Submit feature to API (POST for new, PUT for existing)
 */
export async function submitFeature(
  feature: Feature,
  isNew: boolean
): Promise<{ success: boolean; data?: Feature; error?: string }> {
  try {
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/features' : `/api/features/${feature.id}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-request': 'true'
      },
      body: JSON.stringify(feature)
    });

    // Handle 303 redirect as success (SvelteKit form action redirect)
    if (response.status === 303) {
      // For redirects, we need to fetch the created/updated feature
      // The redirect location should contain the feature ID
      const location = response.headers.get('location');
      if (location && feature.id) {
        try {
          const fetchedFeature = await fetchExistingFeature(feature.id);
          return {
            success: true,
            data: fetchedFeature || feature
          };
        } catch (fetchError) {
          console.warn(
            'Could not fetch updated feature, using submitted data:',
            fetchError
          );
          return {
            success: true,
            data: feature
          };
        }
      }

      return {
        success: true,
        data: feature
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ Feature submission failed (${response.status}):`, errorData);

      const parsedError = parseSuperformError(errorData);

      return {
        success: false,
        error: parsedError
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('❌ Feature submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Process a single feature resolution
 */
export async function processFeatureResolution(
  resolutionData: FeatureResolutionData,
  importCtx: ImportCtx
): Promise<FeatureResolutionData> {
  // If already marked as skipped, don't process further
  if (resolutionData.status === 'skipped') {
    return resolutionData;
  }

  const updated: FeatureResolutionData = { ...resolutionData, status: 'processing' };

  // Debug logging for target IDs
  const featureId = updated.submitted.feature?.id;
  const isTargetId =
    featureId &&
    ['aveKsX1ch7Ud', 'HpIyPtWUffXJ', 'D6f5_izBoOHu', 'pb7SrfBqh6-I'].includes(
      featureId
    );

  if (isTargetId) {
  }

  try {
    // Fetch existing feature if not new and not already available
    if (!updated.isNew && updated.submitted.feature?.id && !updated.existing) {
      if (isTargetId) {
      }

      const existingFeature = await fetchExistingFeature(updated.submitted.feature.id);
      updated.existing = existingFeature || undefined;

      if (isTargetId) {
      }
    }

    // Merge data
    updated.merged = mergeFeatureData(
      updated.existing || null,
      updated.submitted,
      updated.enriched,
      importCtx
    );

    // For existing features, check if the merged data is essentially the same as existing
    if (!updated.isNew && updated.existing && updated.merged) {
      const isUnchanged = deepCompareFeatures(updated.existing, updated.merged);
      if (isUnchanged) {
        updated.status = 'unchanged';
        return updated;
      }
    }

    // For updates, double-check that the feature still exists before submitting
    if (!updated.isNew && updated.merged.id) {
      try {
        const stillExists = await fetchExistingFeature(updated.merged.id);
        if (!stillExists) {
          updated.status = 'error';
          updated.error = `Feature ${updated.merged.id} no longer exists and cannot be updated`;
          return updated;
        }
      } catch (error) {
        updated.status = 'error';
        updated.error = `Could not verify feature ${updated.merged.id} exists: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return updated;
      }
    }

    // Submit to API
    const result = await submitFeature(updated.merged, updated.isNew);

    if (result.success) {
      updated.status = 'success';

      // After successful submission, fetch the actual saved feature data
      try {
        const savedFeature = await fetchExistingFeature(updated.merged.id);
        if (savedFeature) {
          // Store the actual saved feature data for export
          updated.saved = savedFeature;
        } else {
          // Fallback to merged data if fetch fails
          updated.saved = updated.merged;
        }
      } catch (fetchError) {
        console.warn(
          `Could not fetch saved feature ${updated.merged.id} after submission:`,
          fetchError
        );
        // Fallback to merged data if fetch fails
        updated.saved = updated.merged;
      }
    } else {
      updated.status = 'error';
      updated.error = result.error;
    }
  } catch (error) {
    updated.status = 'error';
    updated.error = error instanceof Error ? error.message : 'Unknown error occurred';
  }

  return updated;
}

/**
 * Flatten feature data into CSV import structure format
 * Includes all data from API including PropertyValueI18n values
 */
function flattenFeatureData(
  feature: Feature,
  columns: any[],
  enriched?: Record<string, any>,
  submitted?: Record<string, any>
): Record<string, any> {
  const flattened: Record<string, any> = {};

  // Helper function to get property value by key
  function getPropertyValue(propertyKey: string): string | null {
    const property = feature.properties?.find((p) => p.property?.key === propertyKey);
    return property?.value || null;
  }

  // Helper function to get property ID by key
  function getPropertyId(propertyKey: string): string | null {
    const property = feature.properties?.find((p) => p.property?.key === propertyKey);
    return property?.propertyId || null;
  }

  // Helper function to get property value ID by key
  function getPropertyValueId(propertyKey: string): string | null {
    const property = feature.properties?.find((p) => p.property?.key === propertyKey);
    return property?.propertyValueId || null;
  }

  // Helper function to get property value i18n by key and locale
  function getPropertyValueI18n(propertyKey: string, locale: string): string | null {
    const property = feature.properties?.find((p) => p.property?.key === propertyKey);
    if (property?.propertyValue?.i18n?.[locale]) {
      return property.propertyValue.i18n[locale].value || null;
    }
    return null;
  }

  // Helper function to get i18n value by locale and field
  function getI18nValue(locale: string, field: string): string | null {
    return feature.i18n?.[locale]?.[field] || null;
  }

  // Helper function to get address property by locale and field
  function getAddressProperty(locale: string, field: string): string | null {
    return feature.i18n?.[locale]?.addressProperties?.[field] || null;
  }

  // Map of field names to canonical "is" prefixed version for boolean fields
  const booleanFieldMap: Record<string, string> = {
    published: 'isPublished',
    isPublished: 'isPublished',
    archived: 'isArchived',
    isArchived: 'isArchived',
    visitable: 'isVisitable',
    isVisitable: 'isVisitable',
    intangible: 'isIntangible',
    isIntangible: 'isIntangible'
  };

  // Process each column to create flattened keys
  columns.forEach((column) => {
    let value: any = null;
    let key: string = '';

    switch (column.modelType) {
      case 'Feature':
        if (column.locale && column.locale !== 'None') {
          // Feature i18n fields
          key = `feature.i18n[locale=${column.locale}].${column.field}`;
          value = getI18nValue(column.locale, column.field);
        } else {
          // Feature direct fields - handle coordinate mapping
          if (column.field === 'latitude') {
            key = `feature.latitude`;
            value = feature.geometry?.coordinates?.[1] || null;
          } else if (column.field === 'longitude') {
            key = `feature.longitude`;
            value = feature.geometry?.coordinates?.[0] || null;
          } else {
            // Map boolean field names to canonical "is" prefixed version
            const actualFieldName = booleanFieldMap[column.field] || column.field;
            key = `feature.${column.field}`;
            value = feature[actualFieldName as keyof Feature] || null;
          }
        }
        break;

      case 'User':
        key = `user.${column.field}`;
        if (column.field === 'id') {
          // Use enriched user ID if available, otherwise contributorId
          value = enriched?.user?.id || feature.contributorId;
        } else if (column.field === 'email') {
          value = submitted?.user?.email || null;
        } else if (column.field === 'username') {
          value = submitted?.user?.username || null;
        }
        break;

      case 'Layer':
        key = `layer.${column.field}`;
        if (column.field === 'id') {
          value = feature.layerId;
        } else if (column.field === 'name') {
          // Get layer name from enriched data or try to fetch from layer i18n
          value = enriched?.layer?.name || null;
        }
        break;

      case 'Property':
        // Use new format: property[layer@ALL].propertyKey instead of property[layer@propertyKey].value
        const propertyKey = column.extractedPropertyKey || column.propertyKey;
        if (column.field === 'value') {
          key = `property[layer@ALL].${propertyKey}`;
          // First try to get from submitted data, then from feature data
          value =
            submitted?.properties?.[propertyKey]?.value ||
            getPropertyValue(propertyKey);
        } else if (column.field === 'valueId') {
          key = `property[layer@ALL].${propertyKey}.valueId`;
          value = getPropertyValueId(propertyKey);
        }
        break;

      case 'AddressMeta':
        key = `addressMeta.${column.field}`;
        value = feature.addressMeta?.[column.field] || null;
        break;

      case 'Address':
        if (column.locale && column.locale !== 'None') {
          key = `feature.i18n[locale=${column.locale}].${column.field}`;
          value = getAddressProperty(column.locale, column.field);
        }
        break;
    }

    if (key) {
      flattened[key] = value;
    }
  });

  // Add coordinates as feature.latitude and feature.longitude (not nested)
  if (feature.geometry?.coordinates) {
    flattened['feature.latitude'] = feature.geometry.coordinates[1];
    flattened['feature.longitude'] = feature.geometry.coordinates[0];
  }

  // Always export boolean feature fields (regardless of column mapping)
  flattened['feature.isPublished'] = feature.isPublished ?? false;
  flattened['feature.isArchived'] = feature.isArchived ?? false;
  flattened['feature.isIntangible'] = feature.isIntangible ?? false;
  flattened['feature.isVisitable'] = feature.isVisitable ?? true;

  // Add layer information
  flattened['layer.id'] = feature.layerId;
  if (enriched?.layer?.name) {
    flattened['layer.name'] = enriched.layer.name;
  }

  // Add user information from enriched and submitted data
  if (enriched?.user?.id) {
    flattened['user.id'] = enriched.user.id;
  }
  if (submitted?.user?.email) {
    flattened['user.email'] = submitted.user.email;
  }
  if (submitted?.user?.username) {
    flattened['user.username'] = submitted.user.username;
  }

  // Create a map of propertyId to propertyKey from submitted/enriched data
  const propertyIdToKey = new Map<string, string>();

  // First, collect property keys from submitted data
  if (submitted?.properties) {
    Object.keys(submitted.properties).forEach((key) => {
      const propData = submitted.properties[key];
      if (propData?.id) {
        propertyIdToKey.set(propData.id, key);
      }
    });
  }

  // Then from enriched data (may override submitted if more complete)
  if (enriched?.properties) {
    Object.entries(enriched.properties).forEach(
      ([
        key,
        propData
      ]: [
        string,
        any
      ]) => {
        if (propData?.propertyId) {
          propertyIdToKey.set(propData.propertyId, key);
        }
      }
    );
  }

  // Add all feature properties with the new structure
  feature.properties?.forEach((prop) => {
    // Get property key from the populated property object, or lookup from map
    const propertyKey = prop.property?.key || propertyIdToKey.get(prop.propertyId);

    if (propertyKey) {
      // Add the property value
      flattened[`property[layer@ALL].${propertyKey}`] = prop.value;

      // Add the propertyId
      flattened[`property[layer@ALL].${propertyKey}.id`] = prop.propertyId;

      // Add the property value ID if it exists
      if (prop.propertyValueId) {
        flattened[`property[layer@ALL].${propertyKey}.valueId`] = prop.propertyValueId;
      }

      // Add PropertyValueI18n values for each locale
      if (prop.propertyValue?.i18n) {
        Object.entries(prop.propertyValue.i18n).forEach(([locale, i18nValue]) => {
          if (i18nValue?.value) {
            flattened[`property[locale=${locale},layer@ALL].${propertyKey}.value`] =
              i18nValue.value;
          }
        });
      }
    } else {
      console.warn(
        `❌ [flattenFeatureData] Could not determine property key for propertyId: ${prop.propertyId}`,
        {
          propertyHasKey: !!prop.property?.key,
          propertyIdInMap: propertyIdToKey.has(prop.propertyId),
          availableKeys: Array.from(propertyIdToKey.keys())
        }
      );
    }
  });

  // Also add property metadata from enriched data for properties that may not be in feature.properties
  if (enriched?.properties) {
    Object.entries(enriched.properties).forEach(
      ([
        propertyKey,
        propertyData
      ]: [
        string,
        any
      ]) => {
        // Only add if not already processed above
        const existingProperty = feature.properties?.find(
          (p) => p.property?.key === propertyKey
        );
        if (!existingProperty) {
          // Add metadata for properties that have enriched data but aren't in the feature
          if (propertyData.propertyId) {
            flattened[`property[layer@ALL].${propertyKey}.id`] =
              propertyData.propertyId;
          }
          if (propertyData.propertyValueId) {
            flattened[`property[layer@ALL].${propertyKey}.valueId`] =
              propertyData.propertyValueId;
          }
          // Value might come from submitted data
          const submittedValue = submitted?.properties?.[propertyKey]?.value;
          if (submittedValue !== undefined) {
            flattened[`property[layer@ALL].${propertyKey}`] = submittedValue;
          }
        } else {
          // Even if property exists, make sure we have the metadata from enriched data
          if (
            propertyData.propertyId &&
            !flattened[`property[layer@ALL].${propertyKey}.id`]
          ) {
            flattened[`property[layer@ALL].${propertyKey}.id`] =
              propertyData.propertyId;
          }
          if (
            propertyData.propertyValueId &&
            !flattened[`property[layer@ALL].${propertyKey}.valueId`]
          ) {
            flattened[`property[layer@ALL].${propertyKey}.valueId`] =
              propertyData.propertyValueId;
          }
        }
      }
    );
  }

  // Add all i18n data with proper locale formatting
  if (feature.i18n) {
    Object.entries(feature.i18n).forEach(([locale, localeData]) => {
      Object.entries(localeData).forEach(([field, value]) => {
        if (field !== 'addressProperties') {
          flattened[`feature.i18n[locale=${locale}].${field}`] = value;
        } else if (typeof value === 'object' && value !== null) {
          // Handle addressProperties as nested object
          Object.entries(value).forEach(([addressField, addressValue]) => {
            flattened[
              `feature.i18n[locale=${locale}].addressProperties.${addressField}`
            ] = addressValue;
          });
        }
      });
    });
  }

  // Add all addressMeta fields
  if (feature.addressMeta) {
    Object.entries(feature.addressMeta).forEach(([field, value]) => {
      flattened[`addressMeta.${field}`] = value;
    });
  }

  return flattened;
}

/**
 * Generate download data for processed results
 */
export function generateDownloadData(
  results: FeatureResolutionData[],
  columns: any[]
): any[] {
  return results.map((result) => {
    const baseData = {
      status: result.status,
      error: result.error,
      existing: result.existing || null,
      submitted: result.submitted,
      enriched: result.enriched,
      saved: result.saved || null
    };

    // For successful submissions, use the actual saved data for flattening
    if (result.status === 'success' && result.saved) {
      const flattened = flattenFeatureData(
        result.saved,
        columns,
        result.enriched,
        result.submitted
      );
      return {
        ...baseData,
        flattened
      };
    }

    // For unchanged records, use the existing data for flattening
    if (result.status === 'unchanged' && result.existing) {
      const flattened = flattenFeatureData(
        result.existing,
        columns,
        result.enriched,
        result.submitted
      );
      return {
        ...baseData,
        flattened
      };
    }

    // For other cases with merged data, use merged data for flattening
    if (result.merged && (result.status === 'error' || result.status === 'pending')) {
      try {
        const flattened = flattenFeatureData(
          result.merged,
          columns,
          result.enriched,
          result.submitted
        );
        return {
          ...baseData,
          flattened
        };
      } catch (flattenError) {
        console.warn('Could not flatten data:', flattenError);
        return {
          ...baseData,
          flattened: null
        };
      }
    }

    return {
      ...baseData,
      flattened: null
    };
  });
}
