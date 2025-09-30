import { FieldDiscriminator, SupportedLocales } from '$lib/enums';
import type {
  Project,
  Property,
  CSVImportStep,
  CSVColumn,
  LayerConstraint
} from '$lib/types';
import type { ImportCtx } from '$lib/context/import.svelte';

export interface CSVDropEvent {
  acceptedFiles: File[];
  type: 'features' | 'users' | 'events';
}

export function handleCSVDropEvent(importCtx: ImportCtx, event: CustomEvent) {
  const csvEvent: CSVDropEvent = {
    acceptedFiles: event.detail.acceptedFiles,
    type: event.detail.type
  };

  handleCSVDrop(csvEvent, (file: File, data: any) => {
    importCtx.setFile(file);
    importCtx.setHeaders(data.headers);
    importCtx.setData(data.data); // Store the complete dataset
    importCtx.setStats(data.stats);
    importCtx.setColumns(
      data.headers.map((header: string, index: number) => {
        const parsedHeader = parseHeader(header, undefined, data.data, index);
        return {
          header,
          sampleValues: getSampleValues(data.data, index),
          modelType: parsedHeader.modelType || 'SKIP',
          locale: parsedHeader.locale || 'None',
          field: parsedHeader.field || '',
          propertyKey: parsedHeader.propertyKey,
          propertyType: parsedHeader.propertyType,
          layerConstraint: parsedHeader.layerConstraint,
          extractedPropertyKey: parsedHeader.extractedPropertyKey
        } as CSVColumn;
      })
    );

    // Show association modal to select organisation and project
    importCtx.setShowAssociationModal(true);
  });
}

// CSV parsing helper function (handles quoted fields properly)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Full CSV parsing function (matches original logic)
function parseCSV(text: string): {
  headers: string[];
  data: string[][];
  stats: { valid: number; invalid: number; truncated: number };
} {
  // Normalize line endings and remove BOM if present
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '');
  const lines = normalizedText.split('\n').filter((line) => line.trim());

  if (lines.length === 0)
    return { headers: [], data: [], stats: { valid: 0, invalid: 0, truncated: 0 } };

  const headers = parseCSVLine(lines[0]);
  const data = lines.slice(1).map((line) => parseCSVLine(line));

  let stats = { valid: 0, invalid: 0, truncated: 0 };

  // Only accept rows with exact column count - reject sparse rows
  const validData = data.filter((row, index) => {
    if (row.length === headers.length) {
      stats.valid++;
      return true;
    } else if (row.length < headers.length) {
      stats.invalid++;
      console.error(
        `CSV Parsing: Invalid row ${index + 2} (${stats.invalid} total invalid rows so far)`
      );
      console.error(`Expected ${headers.length} columns, got ${row.length} columns`);
      console.error(`Headers:`, headers);
      console.error(`Row data:`, row);
      console.error(`---`);
      return false;
    } else {
      stats.truncated++;
      console.warn(
        `CSV Parsing: Truncated row ${index + 2} (${stats.truncated} total truncated rows so far)`
      );
      console.warn(
        `Expected ${headers.length} columns, got ${row.length} columns - truncating extra columns`
      );
      console.warn(`Original row:`, [...row]);
      // Truncate rows if they have more columns than headers
      row.splice(headers.length);
      console.warn(`Truncated row:`, row);
      return true;
    }
  });

  return { headers, data: validData, stats };
}

// Get sample values from CSV data
export function getSampleValues(
  data: string[][],
  columnIndex: number,
  count: number = 3
): string[] {
  const values = data
    .map((row) => row[columnIndex] || '')
    .filter((val) => val.trim() !== '');

  if (values.length === 0) return ['No data'];

  // Get unique values first
  const uniqueValues = [...new Set(values)];

  // If we have fewer unique values than requested, return all unique values
  if (uniqueValues.length <= count) return uniqueValues;

  // Get random sample of unique values
  const shuffled = [...uniqueValues].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Property type detection function
function detectPropertyType(
  data: string[][],
  columnIndex: number,
  hasLocale: boolean
): FieldDiscriminator {
  // Get all non-empty values from the column
  const values = data
    .map((row) => row[columnIndex] || '')
    .filter((val) => val.trim() !== '')
    .map((val) => val.trim());

  if (values.length === 0) return FieldDiscriminator.specifier; // Default for empty columns

  // Check if all values are unique and no locale -> display type
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === values.length && !hasLocale) {
    return FieldDiscriminator.display;
  }

  // Check for boolean values (TRUE/FALSE pattern)
  const booleanPattern = /^(true|false|yes|no|1|0)$/i;
  if (uniqueValues.every((val) => booleanPattern.test(val))) {
    return FieldDiscriminator.classifier;
  }

  // For categorical detection, analyze the full dataset
  const valueCounts = new Map<string, number>();
  values.forEach((val) => {
    valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
  });

  // Categorical detection logic
  const hasLimitedUniqueValues =
    uniqueValues.length <= 20 && values.length / 3 > uniqueValues.length;

  if (hasLimitedUniqueValues) {
    // Calculate repetition ratio (how often values repeat)
    const totalOccurrences = Array.from(valueCounts.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalUniqueValues = valueCounts.size;
    const avgOccurrencePerValue = totalOccurrences / totalUniqueValues;

    // If each unique value appears on average more than 1.5 times, it's likely categorical
    if (avgOccurrencePerValue > 1.5) {
      return FieldDiscriminator.classifier;
    }

    // For smaller datasets (< 20 items), be more lenient
    if (values.length < 20) {
      const hasAnyRepetition = Array.from(valueCounts.values()).some(
        (count) => count > 1
      );
      if (hasAnyRepetition) {
        return FieldDiscriminator.classifier;
      }
    }
  }

  // Default to freeform
  return FieldDiscriminator.specifier;
}

export function getStepIndex(step: CSVImportStep): number {
  const stepOrder: CSVImportStep[] = [
    'column-mapping',
    'user-matching',
    'layer-matching',
    'property-matching',
    'translation',
    'geo-lookup',
    'geo-code',
    'feature-resolution',
    'finished'
  ];
  return stepOrder.indexOf(step) + 1;
}

// Get header props based on current step
export function getHeaderProps(currentStep: any) {
  const stepIndex = getStepIndex(currentStep);
  const totalSteps = 9; // For now: column-mapping, user-matching, layer-matching, property-matching, translation, geo-lookup, geo-code, feature-resolution, finished

  switch (currentStep) {
    case 'column-mapping':
      return {
        title: 'Map CSV Columns',
        subtitle:
          "Map each CSV column to the appropriate data model field. Columns marked as 'SKIP' will be ignored.",
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'user-matching':
      return {
        title: 'Match Users',
        subtitle: 'Validating user references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'layer-matching':
      return {
        title: 'Match Layers',
        subtitle: 'Validating layer references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'property-matching':
      return {
        title: 'Match Properties',
        subtitle: 'Validating property references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'translation':
      return {
        title: 'Translate Descriptors',
        subtitle: 'Translating property descriptors to the selected locales.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'geo-lookup':
      return {
        title: 'Geo Lookup',
        subtitle: 'Looking up geographic coordinates for addresses.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'feature-resolution':
      return {
        title: 'Feature Resolution',
        subtitle: 'Reconciling data and uploading features to the system.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    case 'finished':
      return {
        title: 'Import Complete',
        subtitle: 'Your CSV data has been successfully imported.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps
      };
    default:
      return {
        title: 'Import CSV Data',
        subtitle: 'Process your CSV file for import.',
        showProgress: false,
        currentStep: 1,
        totalSteps
      };
  }
}

// Parse CSV header and determine field mapping
export function parseHeader(
  header: string,
  project?: Project,
  data?: string[][],
  columnIndex?: number,
  fetchedProperties: Property[] = [],
  selectedLocale: string = 'en'
): Partial<CSVColumn> {
  const parsed: Partial<CSVColumn> = {
    modelType: 'SKIP',
    locale: 'None',
    field: '',
    propertyKey: undefined,
    propertyType: undefined,
    layerConstraint: undefined
  };

  // Handle property syntax with optional locale and layer constraints
  // property[locale=en,layer@wetmarket].ownership or property[layer@wetmarket].ownership
  const propertyMatch = header.match(/^property\[([^\]]+)\]\.(.+)$/);
  if (propertyMatch) {
    const [, constraintSpec, fieldPath] = propertyMatch;
    parsed.modelType = 'Property';
    parsed.field = fieldPath;

    // Extract property key from the field path - handle new .id and .valueId syntax
    const fieldParts = fieldPath.split('.');
    let extractedPropertyKey: string;
    let actualField: string;

    if (
      fieldParts.length > 1 &&
      (fieldParts[fieldParts.length - 1] === 'id' ||
        fieldParts[fieldParts.length - 1] === 'valueId')
    ) {
      // Handle property[layer@ALL].chain.id or property[layer@ALL].chain.valueId
      extractedPropertyKey = fieldParts[fieldParts.length - 2];
      actualField = fieldParts[fieldParts.length - 1]; // 'id' or 'valueId'
    } else {
      // Handle property[layer@ALL].chain (value field)
      extractedPropertyKey = fieldParts[fieldParts.length - 1];
      actualField = 'value';
    }

    // Parse constraints - need to be careful with comma splitting when curly braces are present
    let constraints: string[] = [];
    let current = '';
    let braceDepth = 0;

    for (let i = 0; i < constraintSpec.length; i++) {
      const char = constraintSpec[i];
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
      } else if (char === ',' && braceDepth === 0) {
        constraints.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    constraints.push(current.trim());

    for (const constraint of constraints) {
      // Handle both 'locale=' and 'local=' for backward compatibility
      const localeMatch = constraint.match(/^local(?:e)?=(.+)$/);
      if (localeMatch) {
        // Normalize locale variations
        let normalizedLocale = localeMatch[1].toLowerCase().replace('-', '');
        if (normalizedLocale === 'zhhant') {
          normalizedLocale = 'zh-hant';
        } else if (normalizedLocale === 'zhhans') {
          normalizedLocale = 'zh-hans';
        } else {
          normalizedLocale = localeMatch[1].toLowerCase();
        }
        parsed.locale = normalizedLocale as SupportedLocales;
      }

      const layerMatch = constraint.match(/^layer@(.+)$/);
      if (layerMatch) {
        let layerSpec = layerMatch[1];

        // Remove curly braces if present
        if (layerSpec.startsWith('{') && layerSpec.endsWith('}')) {
          layerSpec = layerSpec.slice(1, -1);
        }

        if (layerSpec === 'ALL') {
          parsed.layerConstraint = { type: 'all', layers: ['ALL'] };
        } else {
          // Split by comma and trim each layer code
          const layers = layerSpec.split(',').map((l) => l.trim());
          parsed.layerConstraint = { type: 'multiple', layers };
        }
      }
    }

    // Store the extracted property key separately
    parsed.extractedPropertyKey = extractedPropertyKey;

    // Check if property key exists in the fetched property keys
    const existingProperty = fetchedProperties.find(
      (p) => p.key === extractedPropertyKey
    );
    if (existingProperty) {
      // If it exists, default to selecting that existing property
      parsed.propertyKey = extractedPropertyKey;
      parsed.field = actualField; // Use the actual field (value, id, or valueId)
      parsed.propertyType = existingProperty.type as FieldDiscriminator;
    } else {
      // If it doesn't exist, default to NEW (which will use the extracted key)
      parsed.propertyKey = 'NEW';
      parsed.field = actualField; // Use the actual field (value, id, or valueId)

      // Detect property type for new properties (only for value fields)
      if (actualField === 'value' && data && columnIndex !== undefined) {
        const hasLocale = Boolean(parsed.locale && parsed.locale !== 'None');
        parsed.propertyType = detectPropertyType(data, columnIndex, hasLocale);
      } else {
        parsed.propertyType = FieldDiscriminator.specifier; // Default
      }
    }

    return parsed;
  }

  // Handle i18n syntax: model.i18n[locale=locale].field or modelI18n[locale=locale].field
  const i18nMatch =
    header.match(/^(feature|layer)\.i18n\[local(?:e)?=([^}]+)\]\.(.+)$/) ||
    header.match(/^(feature|layer)I18n\[local(?:e)?=([^}]+)\]\.(.+)$/);
  if (i18nMatch) {
    const [, model, rawLocale, field] = i18nMatch;

    // Check if this is an addressProperties field
    if (field.startsWith('addressProperties.')) {
      parsed.modelType = 'Address';
      parsed.field = field.replace('addressProperties.', ''); // Remove the prefix
    } else {
      parsed.modelType = (model.charAt(0).toUpperCase() + model.slice(1)) as
        | 'Feature'
        | 'Layer';
      parsed.field = field;

      // Skip auto-generated fields by default
      const autoGeneratedFields = [
        'featureId',
        'locale',
        'titleGen',
        'descriptionGen',
        'displayAddressGen',
        'addressReverseGen',
        'addressForwardGen'
      ];
      if (autoGeneratedFields.includes(field)) {
        parsed.modelType = 'SKIP';
        parsed.field = '';
      }
    }

    // Normalize locale variations
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '');
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant';
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans';
    } else {
      // Keep original format for en and properly formatted locales
      normalizedLocale = rawLocale.toLowerCase();
    }

    parsed.locale = normalizedLocale as SupportedLocales;
    return parsed;
  }

  // Handle shortform locale syntax: model[locale=locale].field
  const shortFormMatch = header.match(
    /^(feature|layer)\[local(?:e)?=([^\]]+)\]\.(.+)$/
  );
  if (shortFormMatch) {
    const [, model, rawLocale, field] = shortFormMatch;
    parsed.modelType = (model.charAt(0).toUpperCase() + model.slice(1)) as
      | 'Feature'
      | 'Layer';

    // Normalize locale variations (same logic as i18n)
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '');
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant';
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans';
    } else {
      normalizedLocale = rawLocale.toLowerCase();
    }

    parsed.locale = normalizedLocale as SupportedLocales;
    parsed.field = field;
    return parsed;
  }

  // Handle coordinate syntax
  const coordinateMatches = [
    { pattern: /^feature\.geometry\.coordinates\[0\]$/, field: 'longitude' },
    { pattern: /^feature\.geometry\.coordinates\[1\]$/, field: 'latitude' },
    { pattern: /^feature\.(latitude|lat)$/, field: 'latitude' },
    { pattern: /^feature\.(longitude|lng|long|lon)$/, field: 'longitude' },
    { pattern: /^feature\.geometry\.(lat|latitude)$/, field: 'latitude' },
    { pattern: /^feature\.geometry\.(lng|lon|long|longitude)$/, field: 'longitude' }
  ];

  for (const { pattern, field } of coordinateMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Feature';
      parsed.locale = 'None';
      parsed.field = field;
      return parsed;
    }
  }

  // Handle direct feature fields
  const featureFieldMatches = [
    { pattern: /^feature\.id$/, field: 'id' },
    { pattern: /^feature\.archived$/, field: 'archived' },
    { pattern: /^feature\.intangible$/, field: 'intangible' },
    { pattern: /^feature\.visitable$/, field: 'visitable' },
    { pattern: /^feature\.lastSeen$/, field: 'lastSeen' },
    { pattern: /^feature\.published$/, field: 'published' },
    // Boolean field patterns with is prefix
    { pattern: /^feature\.isPublished$/, field: 'published' },
    { pattern: /^feature\.isArchived$/, field: 'archived' },
    { pattern: /^feature\.isVisitable$/, field: 'visitable' },
    { pattern: /^feature\.isIntangible$/, field: 'intangible' }
  ];

  for (const { pattern, field } of featureFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Feature';
      parsed.locale = 'None';
      parsed.field = field;
      return parsed;
    }
  }

  // Handle user fields
  const userFieldMatches = [
    { pattern: /^user\.id$/, field: 'id' },
    { pattern: /^user\.email$/, field: 'email' },
    { pattern: /^user\.username$/, field: 'username' }
  ];

  for (const { pattern, field } of userFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'User';
      parsed.field = field;
      return parsed;
    }
  }

  // Auto-detect user field type based on column data
  if (data && columnIndex !== undefined && header.toLowerCase().includes('user')) {
    const nonEmptyValues = data
      .map((row) => row[columnIndex] || '')
      .filter((val) => val.trim() !== '');

    if (nonEmptyValues.length > 0) {
      // Check if all non-empty values have @ symbol (email)
      const allHaveAtSymbol = nonEmptyValues.every((val) => val.includes('@'));

      // Check if all non-empty values are 12, 16, 24, or 32 characters (ID)
      const validIdLengths = [12, 16, 24, 32];
      const allAreValidIds = nonEmptyValues.every((val) =>
        validIdLengths.includes(val.trim().length)
      );

      if (allHaveAtSymbol) {
        parsed.modelType = 'User';
        parsed.field = 'email';
        return parsed;
      } else if (allAreValidIds) {
        parsed.modelType = 'User';
        parsed.field = 'id';
        return parsed;
      } else {
        parsed.modelType = 'User';
        parsed.field = 'username';
        return parsed;
      }
    }
  }

  // Handle layer fields
  const layerFieldMatches = [
    { pattern: /^layer\.id$/, field: 'id' },
    { pattern: /^layer\.name$/, field: 'name' }
  ];

  for (const { pattern, field } of layerFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Layer';
      parsed.locale = field === 'name' ? (selectedLocale as any) : 'None';
      parsed.field = field;
      return parsed;
    }
  }

  // Auto-detect layer field type based on column data
  if (data && columnIndex !== undefined && header.toLowerCase().includes('layer')) {
    const nonEmptyValues = data
      .map((row) => row[columnIndex] || '')
      .filter((val) => val.trim() !== '');

    if (nonEmptyValues.length > 0) {
      // Check if all non-empty values are 12, 16, 24, or 32 characters (ID)
      const validIdLengths = [12, 16, 24, 32];
      const allAreValidIds = nonEmptyValues.every((val) =>
        validIdLengths.includes(val.trim().length)
      );

      if (allAreValidIds) {
        parsed.modelType = 'Layer';
        parsed.locale = 'None';
        parsed.field = 'id';
        return parsed;
      } else {
        parsed.modelType = 'Layer';
        parsed.locale = selectedLocale as any;
        parsed.field = 'name';
        return parsed;
      }
    }
  }

  // Handle Address model syntax: address[locale=locale].field
  const addressMatch = header.match(/^address\[local(?:e)?=([^\]]+)\]\.(.+)$/);
  if (addressMatch) {
    const [, rawLocale, field] = addressMatch;
    parsed.modelType = 'Address';

    // Normalize locale variations
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '');
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant';
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans';
    } else {
      normalizedLocale = rawLocale.toLowerCase();
    }

    parsed.locale = normalizedLocale as SupportedLocales;
    parsed.field = field;
    return parsed;
  }

  // Handle AddressMeta model syntax: addressMeta.field
  const addressMetaMatch = header.match(/^addressMeta\.(.+)$/);
  if (addressMetaMatch) {
    const [, field] = addressMetaMatch;
    parsed.modelType = 'AddressMeta';
    parsed.locale = 'None';
    parsed.field = field;

    // Skip auto-generated addressMeta fields by default
    const autoGeneratedAddressMetaFields = [
      'addressReverseGen',
      'addressForwardGen',
      'confidenceForwardGeocoder',
      'addressForwardGeocoder'
      // Note: addressReverseGeocoder is removed - it can be user-provided
    ];
    if (autoGeneratedAddressMetaFields.includes(field)) {
      parsed.modelType = 'SKIP';
      parsed.field = '';
    }

    return parsed;
  }

  return parsed;
}

// Handle project selection
export async function handleProjectSelection(
  selectedProject: Project,
  importCtx: ImportCtx,
  appCtx: any,
  fetchAvailablePropertyKeys: (ctx?: ImportCtx) => Promise<void>,
  setTypeSelected: (selected: boolean) => void
) {
  // Cast to Project type and store
  importCtx.setSelectedProject(selectedProject);

  // Get the organisation for this project
  const organisation = appCtx.getResourceByIdSync(
    'organisation', // FirstClassResource.organisation
    selectedProject.organisationId
  );

  importCtx.setSelectedOrganisation(organisation);

  // Fetch available property keys for the selected project
  await fetchAvailablePropertyKeys(importCtx);

  // Re-parse headers now that we know the project context
  importCtx.setColumns(
    importCtx.getHeaders().map((header: string, index: number) => {
      const parsedHeader = parseHeader(
        header,
        selectedProject,
        importCtx.getData(),
        index,
        importCtx.getFetchedProperties() || [],
        importCtx.getSelectedLocale() || 'en'
      );
      return {
        header,
        sampleValues: getSampleValues(importCtx.getData(), index),
        modelType: parsedHeader.modelType || 'SKIP',
        locale: parsedHeader.locale || 'None',
        field: parsedHeader.field || '',
        propertyKey: parsedHeader.propertyKey,
        propertyType: parsedHeader.propertyType,
        layerConstraint: parsedHeader.layerConstraint,
        extractedPropertyKey: parsedHeader.extractedPropertyKey
      };
    })
  );

  importCtx.setShowAssociationModal(false);
  importCtx.setCurrentStep('column-mapping');
  setTypeSelected(true);
}

export async function handleCSVDrop(
  event: CSVDropEvent,
  onFileProcessed: (file: File, data: any) => void
) {
  const { acceptedFiles, type } = event;

  if (type !== 'features') {
    console.warn(`${type} import is not yet implemented`);
    return;
  }

  if (acceptedFiles.length === 0) return;

  const file = acceptedFiles[0];

  try {
    const text = await file.text();
    const { headers, data, stats } = parseCSV(text);

    if (headers.length === 0) {
      console.error('Invalid CSV file: No headers found');
      return;
    }

    const processedData = {
      file,
      headers,
      data, // Include the complete dataset
      stats
    };

    onFileProcessed(file, processedData);
  } catch (error) {
    console.error('Error processing CSV file:', error);
  }
}

export function getAvailableFields(
  modelType: string,
  locale: string | undefined,
  propertyKey?: string
): string[] {
  if (modelType === 'Feature') {
    if (!locale || locale === 'None') {
      return [
        'id',
        'latitude',
        'longitude',
        'archived',
        'published',
        'intangible',
        'visitable',
        'lastSeen'
      ];
    } else {
      return ['title', 'description', 'displayAddress', 'rawAddress'];
    }
  } else if (modelType === 'User') {
    return ['id', 'email', 'username'];
  } else if (modelType === 'Property') {
    // If property key is NEW, only allow 'value' field
    if (propertyKey === 'NEW') {
      return ['value'];
    }
    if (!locale || locale === 'None') {
      return ['id', 'value', 'valueId'];
    } else {
      return ['id', 'value'];
    }
  } else if (modelType === 'Layer') {
    if (!locale || locale === 'None') {
      return ['id'];
    } else {
      return ['name'];
    }
  } else if (modelType === 'Address') {
    // Address properties from AddressProperties type - always require locale
    if (!locale || locale === 'None') {
      return [];
    } else {
      return [
        'formattedAddress',
        'rawAddress',
        'unitPortion',
        'unitNumber',
        'unitType',
        'floorNumber',
        'floorType',
        'premisesName',
        'buildingName',
        'buildingNumberFrom',
        'buildingNumberTo',
        'blockType',
        'blockNumber',
        'blockTypeBeforeNumber',
        'phaseName',
        'phaseNumber',
        'estateName',
        'lotNumber',
        'lotType',
        'streetName',
        'intersection',
        'neighbourhood',
        'subDistrict',
        'district',
        'region',
        'country'
      ];
    }
  } else if (modelType === 'AddressMeta') {
    // AddressMeta properties - non-translatable
    return [
      'geoAddressCode',
      'nearestLampPostNumber',
      'googlePlaceId',
      'plusCode',
      'longitude',
      'latitude',
      'rawLongitude',
      'rawLatitude',
      'distanceFromPoint',
      'confidenceForwardGeocoder',
      'addressForwardGeocoder',
      'addressReverseGeocoder',
      'addressReverseGen',
      'addressForwardGen'
    ];
  }
  return [];
}
