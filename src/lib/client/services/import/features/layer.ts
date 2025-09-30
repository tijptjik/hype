// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { ImportCtx } from '$lib/context/import.svelte';
// TYPES
import type { Layer, Property, Id, LayerValidationResult } from '$lib/types';
// Layer validation and resolution functions for CSV import

// LAYER FORM CONFIGURATION
export const LAYER_FIELDS = {
  name: {
    label: m.admin__forms_common_name_full(),
    component: 'InputField',
    isArray: false,
    isTranslated: true,
    isNested: false
  },
  nameShort: {
    label: m.admin__forms_common_name_short(),
    component: 'InputField',
    isArray: false,
    isTranslated: true,
    isNested: false
  },
  description: {
    label: m.feature__description(),
    component: 'TextareaField',
    isArray: false,
    isTranslated: true,
    isNested: false
  }
};

// Helper function to safely transform i18n data
function transformI18nSafely(i18n: any): any {
  if (typeof i18n === 'object' && i18n !== null) {
    return i18n;
  }
  try {
    return JSON.parse(i18n);
  } catch {
    return {};
  }
}

// Merge project properties into layer (copied from loadFormData logic)
function mergeProjectProperties(layer: Layer, properties: Property[]): Layer {
  // Get existing property IDs
  // Since it's a new layer, there are no existing property IDs
  const existingPropertyIds: Id[] = (layer.properties || [])
    .map((p) => p.propertyId)
    .filter((id) => id !== undefined) as Id[];

  // Ensure layer.properties is initialized to an array if it's not already
  if (!Array.isArray(layer.properties)) {
    layer.properties = [];
  }

  // Add project properties that aren't already in the layer
  properties.forEach((projectProp: Property) => {
    if (!existingPropertyIds.includes(projectProp.id)) {
      if (typeof projectProp.i18n !== 'object' && projectProp.i18n) {
        projectProp.i18n = transformI18nSafely(projectProp.i18n);
      }
      // Create a conformed property object
      const conformedProjectProp: Property = {
        ...projectProp,
        values: projectProp.values || [] // Ensure values is an array
      };

      const layerProperty = {
        layerId: layer.id!, // Assuming layer.id is defined; handle if new layer might not have id
        propertyId: conformedProjectProp.id,
        isVisible: false,
        property: conformedProjectProp
      };

      layer.properties.push(layerProperty as any); // Type assertion to avoid complex type issues
    }
  });
  return layer;
}

// Get project properties for merging with new layer
async function getProjectProperties(projectId: string): Promise<Property[]> {
  try {
    const response = await fetch(`/api/properties?project=${projectId}`);
    if (!response.ok) {
      return [];
    }
    const properties = await response.json();
    return properties;
  } catch (error) {
    console.error('Error fetching project properties:', error);
    return [];
  }
}

// Preload all layers for the project
export async function preloadLayers(projectId: string): Promise<any[]> {
  try {
    const response = await fetch(`/api/layers?project=${projectId}`);
    if (!response.ok) {
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('Error preloading layers:', error);
    return [];
  }
}

// Search layers function (filters preloaded layers)
export function searchLayers(query: string, allLayers: any[]): any[] {
  if (!query.trim()) {
    return allLayers;
  }

  const searchTerm = query.toLowerCase();
  return allLayers.filter((layer) => {
    const name = layer.i18n?.en?.name?.toLowerCase() || '';
    const description = layer.i18n?.en?.description?.toLowerCase() || '';
    return name.includes(searchTerm) || description.includes(searchTerm);
  });
}

// Layer validation functions
export async function validateLayerById(
  layerId: string,
  projectId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/layers?project=${projectId}&id=${encodeURIComponent(layerId)}`
    );
    if (!response.ok) return false;
    const layers = await response.json();
    return layers.length > 0;
  } catch (error) {
    console.error('Error validating layer by ID:', error);
    return false;
  }
}

export async function validateLayerByName(
  layerName: string,
  projectId: string,
  locale: string = 'en'
): Promise<{ isValid: boolean; layerId?: string }> {
  try {
    // Fetch all layers for the project
    const response = await fetch(`/api/layers?project=${projectId}`);
    if (!response.ok) return { isValid: false };
    const layers = await response.json();

    // Search through the layers to find one with matching name in the specified locale
    for (const layer of layers) {
      const layerName_i18n = layer.i18n?.[locale]?.name;
      if (layerName_i18n && layerName_i18n.toLowerCase() === layerName.toLowerCase()) {
        return { isValid: true, layerId: layer.id };
      }
    }

    return { isValid: false };
  } catch (error) {
    console.error('Error validating layer by name:', error);
    return { isValid: false };
  }
}

// Layer selection functions
export function handleLayerSearch(query: string, allLayers: any[]): any[] {
  return searchLayers(query, allLayers);
}

export function handleLayerSearchFocus(allLayers: any[]): any[] {
  return allLayers;
}

export function selectLayer(layer: any): { layer: any; layerId: string } {
  return { layer, layerId: layer.id };
}

// Layer resolution search function
export function handleLayerResolutionSearch(query: string, allLayers: any[]): any[] {
  return searchLayers(query, allLayers);
}

// Layer resolution functions
export function setLayerResolution(
  invalidValue: string,
  layerId: string,
  layerData: any,
  resolutions: Map<string, { layerId: string; layerData?: any }>
): Map<string, { layerId: string; layerData?: any }> {
  resolutions.set(invalidValue, { layerId, layerData });
  return new Map(resolutions);
}

export function removeLayerResolution(
  invalidValue: string,
  resolutions: Map<string, { layerId: string; layerData?: any }>
): Map<string, { layerId: string; layerData?: any }> {
  resolutions.delete(invalidValue);
  return new Map(resolutions);
}

export function selectLayerForResolution(
  invalidValue: string,
  layer: any,
  resolutions: Map<string, { layerId: string; layerData?: any }>
): Map<string, { layerId: string; layerData?: any }> {
  return setLayerResolution(invalidValue, layer.id, layer, resolutions);
}

export function resetLayerResolution(
  invalidValue: string,
  resolutions: Map<string, { layerId: string; layerData?: any }>
): Map<string, { layerId: string; layerData?: any }> {
  return removeLayerResolution(invalidValue, resolutions);
}

export function canCompleteLayerResolution(
  invalidValues: string[],
  resolutions: Map<string, { layerId: string; layerData?: any }>
): boolean {
  return invalidValues.every((value) => resolutions.has(value));
}

// Layer validation orchestration
export async function validateLayers(
  layerColumns: any[],
  sampleData: string[][],
  headers: string[],
  projectId: string,
  locale: string,
  onProgress: (progress: number, total: number) => void,
  onResults: (results: LayerValidationResult[]) => void
): Promise<{ invalidCount: number; results: LayerValidationResult[] }> {
  // Get unique layer values from all layer columns
  const layerValues = new Set<string>();
  const layerColumnIndices = layerColumns.map((col) => headers.indexOf(col.header));

  // Collect all layer values from the data
  sampleData.forEach((row) => {
    layerColumnIndices.forEach((colIndex) => {
      const value = row[colIndex]?.trim();
      if (value) {
        layerValues.add(value);
      }
    });
  });

  const uniqueValues = Array.from(layerValues);
  const results: LayerValidationResult[] = [];

  // Validate each unique layer value
  for (let i = 0; i < uniqueValues.length; i++) {
    const value = uniqueValues[i];
    const layerField = layerColumns[0].field; // Use first layer column's field type

    let result: LayerValidationResult;

    try {
      if (layerField === 'id') {
        const isValid = await validateLayerById(value, projectId);
        result = { value, isValid, layerId: isValid ? value : undefined };
      } else if (layerField === 'name') {
        const validation = await validateLayerByName(value, projectId, locale);
        result = { value, isValid: validation.isValid, layerId: validation.layerId };
      } else {
        result = { value, isValid: false, error: 'Unknown field type' };
      }
    } catch (error) {
      result = {
        value,
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }

    results.push(result);
    onProgress(i + 1, uniqueValues.length);

    // Small delay to show progress
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  onResults(results);

  // Check if all validations passed
  const invalidResults = results.filter((r) => !r.isValid);
  return { invalidCount: invalidResults.length, results };
}

/**
 * Enrich feature data with validated layer IDs
 */
export function enrichFeaturesWithLayerData(
  importCtx: ImportCtx,
  validationResults: LayerValidationResult[]
): void {
  console.log('🔧 Enriching features with validated layer data...');

  const data = importCtx.getData();
  const columns = importCtx.getColumns();
  const headers = importCtx.getHeaders();

  // Find layer columns
  const layerColumns = columns.filter((col) => col.modelType === 'Layer');
  if (layerColumns.length === 0) {
    console.log('🔧 No layer columns found, using fallback layer for all features');
    // If no layer columns, all features should use the fallback layer
    const layerValidation = importCtx.getLayerValidation();
    if (layerValidation.fallbackLayerId) {
      // Get all layers to find the fallback layer name
      const allLayers = importCtx.getAllLayers();
      const fallbackLayer = allLayers.find(
        (layer) => layer.id === layerValidation.fallbackLayerId
      );

      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const enriched = importCtx.getRowEnrichedData(rowIndex) || {};
        enriched.layer = {
          id: layerValidation.fallbackLayerId,
          name: fallbackLayer?.i18n?.en?.name || 'Unknown Layer'
        };
        importCtx.setRowEnrichedData(rowIndex, enriched);
      }
    }
    return;
  }

  // Create a map of layer values to layer IDs and layer data
  const layerValueToId = new Map<string, string>();
  const layerIdToData = new Map<string, any>();

  // Get all layers to build a mapping of ID to layer data
  const allLayers = importCtx.getAllLayers();
  allLayers.forEach((layer) => {
    if (layer.id) {
      layerIdToData.set(layer.id, layer);
    }
  });

  validationResults.forEach((result) => {
    if (result.isValid && result.layerId) {
      layerValueToId.set(result.value, result.layerId);
    }
  });

  // Also check layer resolution for any resolved values
  const layerResolution = importCtx.getLayerResolution();
  layerResolution.resolutions.forEach((resolution, invalidValue) => {
    if (resolution.layerId) {
      layerValueToId.set(invalidValue, resolution.layerId);
      // Also store the layer data if available
      if (resolution.layerData) {
        layerIdToData.set(resolution.layerId, resolution.layerData);
      }
    }
  });

  console.log('🔧 Layer value to ID mapping:', Object.fromEntries(layerValueToId));
  console.log('🔧 Layer ID to data mapping:', Object.fromEntries(layerIdToData));

  // Get column indices for layer columns
  const layerColumnIndices = layerColumns.map((col) => ({
    index: headers.indexOf(col.header),
    field: col.field
  }));

  // Enrich each row with layer data
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {};

    // Check each layer column for this row
    for (const { index, field } of layerColumnIndices) {
      const layerValue = row[index]?.trim();
      if (layerValue && layerValueToId.has(layerValue)) {
        const layerId = layerValueToId.get(layerValue)!;
        const layerData = layerIdToData.get(layerId);

        enriched.layer = {
          id: layerId,
          name: layerData?.i18n?.en?.name || layerValue // Use layer name from data or fallback to input value
        };

        console.log(
          `🔧 Row ${rowIndex + 1}: Set layer ID ${layerId} and name "${enriched.layer.name}" for value "${layerValue}"`
        );
        break; // Use first matching layer column
      }
    }

    // If no layer found but we have a fallback, use it
    if (!enriched.layer) {
      const layerValidation = importCtx.getLayerValidation();
      if (layerValidation.fallbackLayerId) {
        const fallbackLayerData = layerIdToData.get(layerValidation.fallbackLayerId);

        enriched.layer = {
          id: layerValidation.fallbackLayerId,
          name: fallbackLayerData?.i18n?.en?.name || 'Unknown Layer'
        };

        console.log(
          `🔧 Row ${rowIndex + 1}: Using fallback layer ID ${layerValidation.fallbackLayerId} and name "${enriched.layer.name}"`
        );
      }
    }

    importCtx.setRowEnrichedData(rowIndex, enriched);
  }

  console.log('✅ Layer data enrichment completed');
}

// Layer creation functions
export function showLayerCreationForm(importCtx: ImportCtx, prefillValue?: string) {
  importCtx.setIsCreatingLayer(true);

  // Get the selected locale from step 1
  const selectedLocale = importCtx.getSelectedLocale() || 'en';

  // Initialize the layer form with pre-filled data if provided
  const emptyLayer = {
    i18n: {
      en: {
        name: selectedLocale === 'en' ? prefillValue || '' : '',
        nameGen: selectedLocale === 'en' && prefillValue ? false : true,
        nameShort: selectedLocale === 'en' ? prefillValue || '' : '',
        nameShortGen: selectedLocale === 'en' && prefillValue ? false : true,
        description: ''
      },
      'zh-hant': {
        name: selectedLocale === 'zh-hant' ? prefillValue || '' : '',
        nameGen: selectedLocale === 'zh-hant' && prefillValue ? false : true,
        nameShort: selectedLocale === 'zh-hant' ? prefillValue || '' : '',
        nameShortGen: selectedLocale === 'zh-hant' && prefillValue ? false : true,
        description: ''
      },
      'zh-hans': {
        name: selectedLocale === 'zh-hans' ? prefillValue || '' : '',
        nameGen: selectedLocale === 'zh-hans' && prefillValue ? false : true,
        nameShort: selectedLocale === 'zh-hans' ? prefillValue || '' : '',
        nameShortGen: selectedLocale === 'zh-hans' && prefillValue ? false : true,
        description: ''
      }
    }
  };

  // Create a proper reactive form store that I18nSection can work with
  let formData = { ...emptyLayer };
  const subscribers: ((value: any) => void)[] = [];

  const formStore = {
    subscribe: (callback: (value: any) => void) => {
      subscribers.push(callback);
      callback(formData); // Call immediately with current value
      return () => {
        const index = subscribers.indexOf(callback);
        if (index !== -1) subscribers.splice(index, 1);
      };
    },
    set: (newData: any) => {
      console.log('Form store set called with:', newData);
      formData = { ...formData, ...newData }; // Merge instead of replace
      console.log('Form data after set:', formData);
      subscribers.forEach((callback) => callback(formData));
    },
    update: (updater: (value: any) => any) => {
      console.log('Form store update called');
      const oldData = { ...formData };
      formData = updater(formData);
      console.log('Form data updated from:', oldData, 'to:', formData);
      subscribers.forEach((callback) => callback(formData));
    }
  };

  // Set the form in import context
  importCtx.setLayerForm({
    form: formStore,
    data: formData
  });
}

export function hideLayerCreationForm(importCtx: ImportCtx) {
  importCtx.setIsCreatingLayer(false);
  importCtx.setLayerForm(null);
  importCtx.setActiveLayerCreation(null);
}

export async function submitLayerForm(importCtx: ImportCtx, event: Event) {
  event.preventDefault();
  const layerForm = importCtx.getLayerForm();
  if (!layerForm || !importCtx.getSelectedProject()) return;

  importCtx.setIsSubmittingLayer(true);

  try {
    // Get current form data from the store
    let currentFormData: any;
    const unsubscribe = layerForm.form.subscribe((data: any) => {
      currentFormData = data;
    });
    unsubscribe(); // Immediately unsubscribe since we just want current value

    console.log('Current form data when submitting:', currentFormData);

    const selectedProject = importCtx.getSelectedProject()!;

    // Transform i18n data to include locale field for each entry
    const transformedI18n: Record<string, any> = {};
    if (currentFormData.i18n) {
      Object.entries(currentFormData.i18n).forEach(
        ([
          locale,
          data
        ]: [
          string,
          any
        ]) => {
          transformedI18n[locale] = {
            ...data,
            locale // Add the locale field explicitly
          };
        }
      );
    }

    // Fetch project properties and create layer properties for the new layer
    console.log('Fetching project properties to include in layer creation...');
    const projectProperties = await getProjectProperties(selectedProject.id);
    console.log(
      'Found',
      projectProperties.length,
      'project properties to add to layer'
    );

    // Create layer properties array for the new layer
    const layerProperties = projectProperties.map((projectProp: Property) => {
      if (typeof projectProp.i18n !== 'object' && projectProp.i18n) {
        projectProp.i18n = transformI18nSafely(projectProp.i18n);
      }

      // Transform property i18n from array to object format (keyed by locale)
      const transformedPropertyI18n: Record<string, any> = {};
      if (Array.isArray(projectProp.i18n)) {
        projectProp.i18n.forEach((i18nItem: any) => {
          if (i18nItem.locale) {
            transformedPropertyI18n[i18nItem.locale] = i18nItem;
          }
        });
      } else if (projectProp.i18n && typeof projectProp.i18n === 'object') {
        // Already in object format, just ensure locale field is present
        Object.entries(projectProp.i18n).forEach(
          ([
            locale,
            data
          ]: [
            string,
            any
          ]) => {
            transformedPropertyI18n[locale] = {
              ...data,
              locale
            };
          }
        );
      }

      // Transform property values i18n from array to object format as well
      const transformedValues = (projectProp.values || []).map((value: any) => {
        const transformedValueI18n: Record<string, any> = {};
        if (Array.isArray(value.i18n)) {
          value.i18n.forEach((i18nItem: any) => {
            if (i18nItem.locale) {
              transformedValueI18n[i18nItem.locale] = i18nItem;
            }
          });
        } else if (value.i18n && typeof value.i18n === 'object') {
          Object.entries(value.i18n).forEach(
            ([
              locale,
              data
            ]: [
              string,
              any
            ]) => {
              transformedValueI18n[locale] = {
                ...data,
                locale
              };
            }
          );
        }

        return {
          ...value,
          i18n: transformedValueI18n
        };
      });

      // Create a conformed property object
      const conformedProjectProp: Property = {
        ...projectProp,
        i18n: transformedPropertyI18n,
        values: transformedValues
      };

      return {
        propertyId: conformedProjectProp.id,
        isVisible: false,
        property: conformedProjectProp
      };
    });

    console.log('Created', layerProperties.length, 'layer properties');

    const layerData = {
      ...currentFormData,
      projectId: selectedProject.id,
      organisationId: selectedProject.organisationId, // Required by layer schema
      properties: layerProperties, // Include all project properties
      i18n: transformedI18n // Use transformed i18n with locale fields
    };

    const response = await fetch('/api/layers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(layerData)
    });

    // Let's also check what the response body contains
    const responseText = await response.text();

    let newLayer: any;

    if (response.status === 303) {
      console.log('Got 303 redirect response');

      // Try to parse the response body to see if it contains layer data or location
      let redirectData;
      try {
        redirectData = JSON.parse(responseText);
        console.log('Parsed redirect response:', redirectData);
      } catch (e) {
        console.log('Could not parse response body as JSON');
      }

      let layerId: string | null = null;

      if (response.headers.get('location')) {
        // Extract layer ID from location header
        const location = response.headers.get('location')!;
        const layerIdMatch = location.match(/\/layers\/([^\/]+)$/);
        if (layerIdMatch) {
          layerId = layerIdMatch[1];
        }
      } else if (redirectData && redirectData.location) {
        // Try to extract layer ID from response body location
        const layerIdMatch = redirectData.location.match(/\/layers\/([^\/]+)$/);
        if (layerIdMatch) {
          layerId = layerIdMatch[1];
        }
      }

      if (layerId) {
        console.log('Extracted layer ID:', layerId);
        // Fetch the created layer data
        const layerResponse = await fetch(`/api/layers/${layerId}`);
        if (!layerResponse.ok) {
          throw new Error('Failed to fetch created layer');
        }
        newLayer = await layerResponse.json();
        console.log('Fetched created layer:', newLayer);
      } else {
        throw new Error('Could not extract layer ID from redirect response');
      }
    } else if (!response.ok) {
      const errorText = await response.text();
      console.error('Layer creation failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        sentData: layerData
      });
      throw new Error(
        `Failed to create layer: ${response.status} ${response.statusText}`
      );
    } else {
      // Handle direct JSON response (if any)
      newLayer = await response.json();
      console.log('Got direct JSON response:', newLayer);
    }

    // Add the new layer to the allLayers list so it can be found in searches
    const currentLayers = importCtx.getAllLayers();
    importCtx.setAllLayers([...currentLayers, newLayer]);

    // Select the newly created layer
    importCtx.setSelectedLayer(newLayer);
    const layerValidation = importCtx.getLayerValidation();
    layerValidation.fallbackLayerId = newLayer.id;
    importCtx.setLayerValidation(layerValidation);

    // If we're in layer resolution mode, auto-assign this new layer to the specific value being resolved
    if (layerValidation.showLayerResolution) {
      const activeLayerCreation = importCtx.getActiveLayerCreation();
      if (activeLayerCreation) {
        const layerResolution = importCtx.getLayerResolution();
        const newResolutions = new Map(layerResolution.resolutions);

        // Only assign the new layer to the specific invalid value that triggered this creation
        newResolutions.set(activeLayerCreation, {
          layerId: newLayer.id,
          layerData: newLayer
        });

        importCtx.setLayerResolution({
          invalidValues: layerResolution.invalidValues,
          resolutions: newResolutions
        });
      }
    }

    // Hide the form
    hideLayerCreationForm(importCtx);

    console.log('Layer created successfully:', newLayer);
  } catch (error) {
    console.error('Error creating layer:', error);
  } finally {
    importCtx.setIsSubmittingLayer(false);
  }
}
