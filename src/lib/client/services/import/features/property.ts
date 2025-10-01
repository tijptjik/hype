// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte';
import { getImportCtx } from '$lib/context/import.svelte';
// TYPES
import type { Property, FieldDiscriminator } from '$lib/types';

export function getPropertyType(
  propertyKey: string,
  fetchedProperties: Property[]
): FieldDiscriminator {
  if (!propertyKey || propertyKey === 'NEW') {
    return 'classifier'; // Default for new properties
  }

  const property = fetchedProperties.find((p) => p.key === propertyKey);
  return property?.type || 'classifier';
}

export async function fetchAvailablePropertyKeys(importCtx?: ImportCtx): Promise<void> {
  const ctx = importCtx || getImportCtx();
  const selectedProject = ctx.getSelectedProject();

  if (!selectedProject) {
    console.warn('No project selected for fetching property keys');
    return;
  }

  try {
    ctx.setIsFetchingProperties(true);

    // Fetch properties for the selected project
    const response = await fetch(`/api/properties?project=${selectedProject.id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch properties: ${response.statusText}`);
    }

    const properties: Property[] = await response.json();
    ctx.setFetchedProperties(properties);

    // Extract just the keys for dropdown options
    const propertyKeys = properties.map((p) => p.key);
    ctx.setAvailablePropertyKeys(propertyKeys);
  } catch (error) {
    console.error('Error fetching property keys:', error);
    ctx.setFetchedProperties([]);
    ctx.setAvailablePropertyKeys([]);
  } finally {
    ctx.setIsFetchingProperties(false);
  }
}

/**
 * Enrich feature data with validated property IDs and values
 */
export function enrichFeaturesWithPropertyData(importCtx: ImportCtx): void {
  console.log('🔧 [PROPERTY_ENRICHMENT] Starting property data enrichment...');

  const data = importCtx.getData();
  const columns = importCtx.getColumns();
  const headers = importCtx.getHeaders();
  const propertyReconciliation = importCtx.getPropertyReconciliation();

  console.log('🔧 [PROPERTY_ENRICHMENT] Property reconciliation state:', {
    enrichedDataSize: propertyReconciliation.enrichedData.size,
    currentAction: propertyReconciliation.currentAction,
    isProcessing: propertyReconciliation.isProcessing,
    allKeys: Array.from(propertyReconciliation.enrichedData.keys())
  });

  // Debug: Check if enriched data contains property value mappings
  // Note: Using `any` type for enriched data as it contains dynamic properties from different reconciliation sources
  console.log(
    '🔧 [PROPERTY_ENRICHMENT] CRITICAL DEBUG - Checking for property value mappings:'
  );
  propertyReconciliation.enrichedData.forEach((data: any, key) => {
    console.log(`🔧 [PROPERTY_ENRICHMENT] Property "${key}" enriched data:`, {
      hasPropertyValueMapping: !!data.propertyValueMapping,
      propertyValueMapping: data.propertyValueMapping,
      propertyId: data.propertyId,
      allDataKeys: Object.keys(data)
    });
  });

  // Log detailed reconciliation data
  propertyReconciliation.enrichedData.forEach((data: any, key) => {
    console.log(`🔧 [PROPERTY_ENRICHMENT] Reconciliation data for "${key}":`, {
      propertyId: data.propertyId,
      propertyValueId: data.propertyValueId,
      hasResolvedValues: !!data.resolvedValues,
      hasPropertyValueMapping: !!data.propertyValueMapping,
      hasResolvedData: !!data.resolvedData,
      resolvedValuesCount: data.resolvedValues
        ? Object.keys(data.resolvedValues).length
        : 0,
      propertyValueMappingCount: data.propertyValueMapping
        ? Object.keys(data.propertyValueMapping).length
        : 0,
      resolvedDataCount: data.resolvedData ? Object.keys(data.resolvedData).length : 0,
      resolvedValues: data.resolvedValues,
      propertyValueMapping: data.propertyValueMapping,
      resolvedData: data.resolvedData,
      translatedValues: data.translatedValues,
      fullDataKeys: Object.keys(data),
      fullData: data
    });
  });

  // Find property columns
  const propertyColumns = columns.filter((col) => col.modelType === 'Property');
  if (propertyColumns.length === 0) {
    console.log('🔧 No property columns found, skipping property enrichment');
    return;
  }

  console.log(`🔧 Found ${propertyColumns.length} property columns to enrich`);
  console.log(
    `🔧 Property reconciliation has ${propertyReconciliation.enrichedData.size} enriched entries`
  );

  // Get column indices for property columns
  const propertyColumnIndices = propertyColumns.map((col) => ({
    index: headers.indexOf(col.header),
    field: col.field,
    propertyKey: col.extractedPropertyKey || col.propertyKey,
    locale: col.locale
  }));

  // Enrich each row with property data
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {};

    if (!enriched.properties) {
      enriched.properties = {};
    }

    // Check each property column for this row
    for (const { index, field, propertyKey, locale } of propertyColumnIndices) {
      const propertyValue = row[index]?.trim();

      if (propertyValue && propertyKey && field === 'value') {
        console.log(
          `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Processing property column:`,
          { propertyKey, propertyValue, field, locale, index }
        );

        // Get enriched data for this property key
        // Note: Cast to any as enriched data contains dynamic properties from various reconciliation sources
        const enrichedData = propertyReconciliation.enrichedData.get(
          propertyKey
        ) as any;

        console.log(
          `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Enriched data lookup for "${propertyKey}":`,
          {
            found: !!enrichedData,
            enrichedData: enrichedData,
            allAvailableKeys: Array.from(propertyReconciliation.enrichedData.keys())
          }
        );

        if (enrichedData) {
          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Enriching property "${propertyKey}" with value "${propertyValue}"`
          );
          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Available enriched data for "${propertyKey}":`,
            {
              propertyId: enrichedData.propertyId,
              propertyValueId: enrichedData.propertyValueId,
              propertyType: enrichedData.propertyType,
              hasResolvedValues: !!enrichedData.resolvedValues,
              resolvedValues: enrichedData.resolvedValues,
              translatedValues: enrichedData.translatedValues
            }
          );

          // Initialize property object if it doesn't exist
          if (!enriched.properties[propertyKey]) {
            enriched.properties[propertyKey] = {};
          }

          // Set the property ID
          if (enrichedData.propertyId) {
            enriched.properties[propertyKey].propertyId = enrichedData.propertyId;
            console.log(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Set propertyId ${enrichedData.propertyId} for property "${propertyKey}"`
            );
          }

          // Determine property type
          const propertyType: FieldDiscriminator =
            enrichedData.propertyType || 'classifier';
          const isClassifier = propertyType === 'classifier';

          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Property type for "${propertyKey}": ${propertyType}, isClassifier: ${isClassifier}`
          );

          // Try to resolve propertyValueId from mapping
          let propertyValueId = enrichedData.propertyValueId || null;
          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Direct propertyValueId for "${propertyKey}": ${propertyValueId}`
          );

          // For classifiers, we MUST find a propertyValueId from the mapping
          if (!propertyValueId) {
            let mappingSource = null;
            let mappingData = null;

            // Check resolvedValues first (expected structure)
            if (enrichedData.resolvedValues) {
              mappingSource = 'resolvedValues';
              mappingData = enrichedData.resolvedValues;
              propertyValueId = mappingData[propertyValue] || null;
            }
            // Check propertyValueMapping (alternate structure)
            if (!propertyValueId && enrichedData.propertyValueMapping) {
              mappingSource = 'propertyValueMapping';
              mappingData = enrichedData.propertyValueMapping;
              propertyValueId = mappingData[propertyValue] || null;
            }
            // Check resolvedData (another alternate structure)
            if (!propertyValueId && enrichedData.resolvedData) {
              mappingSource = 'resolvedData';
              mappingData = enrichedData.resolvedData;
              propertyValueId = mappingData[propertyValue] || null;
            }

            console.log(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Looking up propertyValueId for "${propertyValue}":`,
              {
                searchValue: propertyValue,
                mappingSource: mappingSource,
                mappingData: mappingData,
                foundPropertyValueId: propertyValueId,
                availableKeys: mappingData ? Object.keys(mappingData) : []
              }
            );
          }

          // Handle based on property type and whether we found a propertyValueId
          if (propertyValueId) {
            // Has propertyValueId - store the reference, skip the value
            enriched.properties[propertyKey].propertyValueId = propertyValueId;
            console.log(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: ✅ Set propertyValueId ${propertyValueId} for property "${propertyKey}"`
            );
          } else if (isClassifier) {
            // Classifier MUST have propertyValueId - this is an error state
            console.error(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: ❌ CRITICAL ERROR: Classifier property "${propertyKey}" has no propertyValueId for value "${propertyValue}". ` +
                `This should have been created during reconciliation. Available mappings:`,
              {
                resolvedValues: enrichedData.resolvedValues,
                propertyValueMapping: enrichedData.propertyValueMapping,
                resolvedData: enrichedData.resolvedData
              }
            );
            // Store value as fallback to avoid data loss, but this indicates a bug
            enriched.properties[propertyKey].value = propertyValue;
            enriched.properties[propertyKey]._error =
              'Missing propertyValueId for classifier field';
          } else {
            // Non-classifier - store the direct value (this is correct)
            enriched.properties[propertyKey].value = propertyValue;
            console.log(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: ✅ Set direct value "${propertyValue}" for ${propertyType} property "${propertyKey}"`
            );
          }

          // Store translated values if available
          if (enrichedData.translatedValues) {
            enriched.properties[propertyKey].translatedValues =
              enrichedData.translatedValues;
          }

          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Final enriched property "${propertyKey}":`,
            enriched.properties[propertyKey]
          );
        } else {
          console.log(
            `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: ❌ No enriched data found for property "${propertyKey}"`
          );
        }
      }
    }

    importCtx.setRowEnrichedData(rowIndex, enriched);
  }

  console.log('✅ Property data enrichment completed');
}

export function validatePropertyColumns(importCtx?: ImportCtx): {
  isValid: boolean;
  errors: string[];
} {
  const ctx = importCtx || getImportCtx();
  const errors: string[] = [];

  // Property validation is now minimal - the main validation happens during property reconciliation
  // We only validate for obvious structural issues, not data content
  const propertyColumns = ctx
    .getColumns()
    .filter((col) => col.modelType === 'Property' && col.field === 'value');

  for (const column of propertyColumns) {
    const columnIndex = ctx.getColumnIndex(column);
    const data = ctx.getData();

    // Get all non-empty values for this column
    const values = data
      .map((row) => row[columnIndex])
      .filter((val) => val && val.trim())
      .map((val) => val.trim());

    // Only check if column is completely empty (which might indicate a mapping error)
    if (values.length === 0) {
      errors.push(
        `Column "${column.header}" (Property: ${column.extractedPropertyKey || column.propertyKey || 'NEW'}) appears to be empty. ` +
          `Please ensure this column contains property values or set it to SKIP if not needed.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
