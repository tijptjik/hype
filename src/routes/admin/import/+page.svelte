<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
import { getImportCtx, setImportCtx } from '$lib/context/import.svelte';
import { setForm } from '$lib/context/form.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { CheckCircle, XCircle, MagnifyingGlass, Plus } from '@steeze-ui/heroicons';
import Dropzones from '$lib/components/import/Dropzones.svelte';
import Association from '$lib/components/forms/modals/Association.svelte';
import ImportHeader from '$lib/components/import/layout/Header.svelte';
import ImportFooter from '$lib/components/import/layout/Footer.svelte';
import CSVStats from '$lib/components/import/CSVStats.svelte';
import UploadSummary from '$lib/components/import/images/UploadSummary.svelte';
import UploadResult from '$lib/components/import/images/UploadResult.svelte';
import PropertyReconciliation from '$lib/components/import/features/property/PropertyReconciliation.svelte';
import TranslationStep from '$lib/components/import/features/translation/TranslationStep.svelte';
import GeoLookupStep from '$lib/components/import/features/geo/GeoLookupStep.svelte';
import FeatureResolutionStep from '$lib/components/import/features/resolution/FeatureResolutionStep.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
// SERVICES
import {
  handleProjectSelection,
  getAvailableFields,
  getHeaderProps,
  handleCSVDropEvent
} from '$lib/client/services/import/features';
import {
  handleUserSearch,
  selectUser,
  handleResolutionUserSearch,
  canCompleteUserResolution,
  selectUserForResolution,
  resetUserResolution,
  validateUsers,
  startUserResolution,
  enrichFeaturesWithUserData
} from '$lib/client/services/import/features/user';
import {
  fetchAvailablePropertyKeys,
  getPropertyType,
  validatePropertyColumns
} from '$lib/client/services/import/features/property';
import {
  preloadLayers,
  handleLayerSearch,
  handleLayerSearchFocus,
  selectLayer,
  handleLayerResolutionSearch,
  selectLayerForResolution,
  resetLayerResolution,
  canCompleteLayerResolution,
  validateLayers,
  submitLayerForm,
  showLayerCreationForm,
  hideLayerCreationForm,
  LAYER_FIELDS,
  enrichFeaturesWithLayerData
} from '$lib/client/services/import/features/layer';
import { handleImageDropEvent } from '$lib/client/services/import/images';
// ENUMS
import { FirstClassResource, FieldDiscriminator, SupportedLocales } from '$lib/enums';

// TYPES
import type { Project, BatchUploadResult, Resource } from '$lib/types';

setImportCtx(); // Initialize the import context

// CONTEXT
const adminCtx = getAdminCtx();
const appCtx = getAppCtx();
const importCtx = getImportCtx();

// Debug: Track current step changes
$effect(() => {});

// Set the active resource to something appropriate for admin context
adminCtx.setFacet(false, false, FirstClassResource.feature);

// IMAGE UPLOAD STATE
let uploadResults: BatchUploadResult[] = $state([]);
let isUploading = $state(false);
let currentBatch = $state(0);
let totalBatches = $state(0);

// FEATURE RESOLUTION STATE (from bindings)
let featureResolutionStartProcessing: (() => void) | undefined = $state();
let featureResolutionStatusCounts:
  | {
      pending: number;
      processing: number;
      success: number;
      error: number;
      skipped: number;
      unchanged: number;
    }
  | undefined = $state();

// VALIDATION MODAL STATE
let showEmptyColumnsModal = $state(false);
let emptyColumnsErrors = $state<string[]>([]);

// Handle image drop wrapper
function handleImageDropEventWrapper(e: CustomEvent) {
  handleImageDropEvent(
    e,
    appCtx,
    (results) => {
      uploadResults = results;
    },
    (uploading) => {
      isUploading = uploading;
    },
    (current, total) => {
      currentBatch = current;
      totalBatches = total;
    }
  );
}

let successCount = $derived(uploadResults.filter((r) => r.status === 'success').length);
let errorCount = $derived(uploadResults.filter((r) => r.status === 'error').length);
let uploadingCount = $derived(
  uploadResults.filter((r) => r.status === 'uploading').length
);
let pendingCount = $derived(uploadResults.filter((r) => r.status === 'pending').length);

// IMAGE UPLOAD STATE END

// Empty columns modal handlers
function handleEditMapping() {
  showEmptyColumnsModal = false;
  emptyColumnsErrors = [];
  // Stay on column-mapping step to allow editing
}

function handleSkipEmptyColumns() {
  showEmptyColumnsModal = false;
  emptyColumnsErrors = [];
  // Mark empty property columns as SKIP and continue
  markEmptyColumnsAsSkip();
  validateUsersWrapper();
}

function markEmptyColumnsAsSkip() {
  const columns = importCtx.getColumns();
  const data = importCtx.getData();

  columns.forEach((column) => {
    if (column.modelType === 'Property' && column.field === 'value') {
      const columnIndex = importCtx.getColumnIndex(column);
      const values = data
        .map((row) => row[columnIndex])
        .filter((val) => val && val.trim())
        .map((val) => val.trim());

      // If column is empty, mark as SKIP
      if (values.length === 0) {
        column.modelType = 'SKIP';
        column.field = '';
        column.propertyKey = undefined;
        column.propertyType = undefined;
        column.layerConstraint = undefined;
        column.extractedPropertyKey = undefined;
      }
    }
  });

  // Update the columns in the context
  importCtx.setColumns([...columns]);
}

async function handleProjectSelectionWrapper(selectedProject: Resource) {
  await handleProjectSelection(
    selectedProject as Project,
    importCtx,
    appCtx,
    () => fetchAvailablePropertyKeys(importCtx),
    (selected: boolean) => {
      importCtx.setIsTypeSelected(selected);
    }
  );
}

// Wrapper functions for service integration
async function validateUsersWrapper() {
  importCtx.setCurrentStep('user-matching');

  const userColumns = importCtx.getColumns().filter((col) => col.modelType === 'User');

  if (userColumns.length === 0) {
    const userValidation = importCtx.getUserValidation();
    userValidation.showUserSelection = true;
    importCtx.setUserValidation(userValidation);
    return;
  }

  const userValidation = importCtx.getUserValidation();
  userValidation.isValidating = true;
  userValidation.progress = 0;
  userValidation.results = [];
  importCtx.setUserValidation(userValidation);

  try {
    const { invalidCount, results } = await validateUsers(
      userColumns,
      importCtx.getData(), // Use full data instead of sample data
      importCtx.getHeaders(),
      (progress, total) => {
        const userValidation = importCtx.getUserValidation();
        userValidation.progress = progress;
        userValidation.total = total;
        importCtx.setUserValidation(userValidation);
      },
      (results) => {
        const userValidation = importCtx.getUserValidation();
        userValidation.results = results;
        importCtx.setUserValidation(userValidation);
      }
    );

    const finalUserValidation = importCtx.getUserValidation();
    finalUserValidation.isValidating = false;
    importCtx.setUserValidation(finalUserValidation);

    if (invalidCount === 0) {
      // Enrich feature data with validated user IDs
      enrichFeaturesWithUserData(importCtx, results);
      validateLayersWrapper();
    } else {
      const resolution = startUserResolution(results);
      importCtx.setUserResolution({
        invalidValues: resolution.invalidValues,
        resolutions: resolution.resolutions
      });
    }
  } catch (error) {
    console.error('Error during user validation:', error);
    const finalUserValidation = importCtx.getUserValidation();
    finalUserValidation.isValidating = false;
    importCtx.setUserValidation(finalUserValidation);
  }
}

function startUserResolutionWrapper() {
  const resolution = startUserResolution(importCtx.getUserValidation().results);
  importCtx.setUserResolution({
    invalidValues: resolution.invalidValues,
    resolutions: resolution.resolutions
  });
  const userValidation = importCtx.getUserValidation();
  userValidation.showUserResolution = true;
  importCtx.setUserValidation(userValidation);
}

function canCompleteUserResolutionWrapper(): boolean {
  const userResolution = importCtx.getUserResolution();
  return canCompleteUserResolution(
    userResolution.invalidValues,
    userResolution.resolutions
  );
}

// User search wrapper
async function handleUserSearchWrapper() {
  if (importCtx.getUserSearchQuery().length < 2) {
    importCtx.setUserSearchResults([]);
    return;
  }
  const results = await handleUserSearch(importCtx.getUserSearchQuery());
  importCtx.setUserSearchResults(results);
}

function selectUserWrapper(user: any) {
  selectUser(user, (id: string) => {
    const userValidation = importCtx.getUserValidation();
    userValidation.fallbackUserId = id;
    importCtx.setUserValidation(userValidation);
  });
  importCtx.setUserSearchQuery('');
  importCtx.setUserSearchResults([]);
}

// User resolution search function
async function handleResolutionUserSearchWrapper(event: Event, invalidValue: string) {
  const target = event.target as HTMLInputElement;
  const query = target.value;

  // Store the query for this invalid value
  const queries = importCtx.getResolutionSearchQueries();
  queries.set(invalidValue, query);
  importCtx.setResolutionSearchQueries(new Map(queries));

  if (query.length < 2) {
    const results = importCtx.getResolutionSearchResults();
    results.delete(invalidValue);
    importCtx.setResolutionSearchResults(new Map(results));
    return;
  }

  const searchResults = await handleResolutionUserSearch(query);
  const results = importCtx.getResolutionSearchResults();
  results.set(invalidValue, searchResults);
  importCtx.setResolutionSearchResults(new Map(results));
}

// Handle keyboard navigation in search input
function handleSearchKeydown(event: KeyboardEvent, invalidValue: string) {
  const results = importCtx.getResolutionSearchResults().get(invalidValue) || [];

  if ((event.key === 'ArrowDown' || event.key === 'Tab') && results.length > 0) {
    event.preventDefault();
    // Focus the first result
    const firstResult = document.querySelector(
      `[data-invalid-value="${invalidValue}"][data-result-index="0"]`
    ) as HTMLElement;
    firstResult?.focus();
  } else if (event.key === 'Escape') {
    // Clear search results
    const searchResults = importCtx.getResolutionSearchResults();
    searchResults.delete(invalidValue);
    importCtx.setResolutionSearchResults(new Map(searchResults));
    const queries = importCtx.getResolutionSearchQueries();
    queries.delete(invalidValue);
    importCtx.setResolutionSearchQueries(new Map(queries));
  }
}

// Handle keyboard navigation in search results
function handleResultKeydown(event: KeyboardEvent, invalidValue: string, user: any) {
  const target = event.target as HTMLElement;
  const currentIndex = parseInt(target.getAttribute('data-result-index') || '0');
  const results = importCtx.getResolutionSearchResults().get(invalidValue) || [];

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectUserForResolutionWrapper(invalidValue, user);
  } else if (event.key === 'ArrowDown' || event.key === 'Tab') {
    event.preventDefault();
    const nextIndex = Math.min(currentIndex + 1, results.length - 1);
    const nextResult = document.querySelector(
      `[data-invalid-value="${invalidValue}"][data-result-index="${nextIndex}"]`
    ) as HTMLElement;
    nextResult?.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (currentIndex === 0) {
      // Go back to search input
      const searchInput = target
        .closest('.relative')
        ?.querySelector('input') as HTMLElement;
      searchInput?.focus();
    } else {
      const prevIndex = currentIndex - 1;
      const prevResult = document.querySelector(
        `[data-invalid-value="${invalidValue}"][data-result-index="${prevIndex}"]`
      ) as HTMLElement;
      prevResult?.focus();
    }
  } else if (event.key === 'Escape') {
    // Go back to search input and clear results
    const searchInput = target
      .closest('.relative')
      ?.querySelector('input') as HTMLElement;
    searchInput?.focus();
    const searchResults = importCtx.getResolutionSearchResults();
    searchResults.delete(invalidValue);
    importCtx.setResolutionSearchResults(new Map(searchResults));
    const queries = importCtx.getResolutionSearchQueries();
    queries.delete(invalidValue);
    importCtx.setResolutionSearchQueries(new Map(queries));
  }
}

// Select user for resolution wrapper
function selectUserForResolutionWrapper(invalidValue: string, user: any) {
  const userResolution = importCtx.getUserResolution();
  const newResolutions = selectUserForResolution(
    invalidValue,
    user,
    userResolution.resolutions
  );
  importCtx.setUserResolution({
    invalidValues: userResolution.invalidValues,
    resolutions: newResolutions
  });

  const searchResults = importCtx.getResolutionSearchResults();
  searchResults.delete(invalidValue);
  importCtx.setResolutionSearchResults(new Map(searchResults));

  const queries = importCtx.getResolutionSearchQueries();
  queries.delete(invalidValue);
  importCtx.setResolutionSearchQueries(new Map(queries));
}

// Reset user resolution wrapper
function resetUserResolutionWrapper(invalidValue: string) {
  const userResolution = importCtx.getUserResolution();
  const newResolutions = resetUserResolution(invalidValue, userResolution.resolutions);
  importCtx.setUserResolution({
    invalidValues: userResolution.invalidValues,
    resolutions: newResolutions
  });

  const queries = importCtx.getResolutionSearchQueries();
  queries.set(invalidValue, '');
  importCtx.setResolutionSearchQueries(new Map(queries));

  // Focus the search input after a brief delay
  setTimeout(() => {
    const searchInput = document.querySelector(
      `input[data-search-for="${invalidValue}"]`
    ) as HTMLInputElement;
    searchInput?.focus();
  }, 100);
}

// Wrapper functions for service integration
async function preloadLayersWrapper(): Promise<void> {
  if (!importCtx.getSelectedProject()) {
    importCtx.setAllLayers([]);
    importCtx.setLayersLoaded(false);
    return;
  }

  try {
    const layers = await preloadLayers(importCtx.getSelectedProject()!.id);
    importCtx.setAllLayers(layers);
    importCtx.setLayersLoaded(true);
    importCtx.setLayerSearchResults(layers);
  } catch (error) {
    console.error('Error preloading layers:', error);
    importCtx.setAllLayers([]);
    importCtx.setLayersLoaded(false);
  }
}

function handleLayerSearchWrapper() {
  const results = handleLayerSearch(
    importCtx.getLayerSearchQuery(),
    importCtx.getAllLayers()
  );
  importCtx.setLayerSearchResults(results);
}

function handleLayerSearchFocusWrapper() {
  const results = handleLayerSearchFocus(importCtx.getAllLayers());
  if (!importCtx.getLayersLoaded()) {
    preloadLayersWrapper();
  } else {
    importCtx.setLayerSearchResults(results);
  }
}

function selectLayerWrapper(layer: any) {
  const result = selectLayer(layer);
  importCtx.setSelectedLayer(result.layer);
  const layerValidation = importCtx.getLayerValidation();
  layerValidation.fallbackLayerId = result.layerId;
  importCtx.setLayerValidation(layerValidation);
  importCtx.setLayerSearchQuery('');
  importCtx.setLayerSearchResults([]);
}

function handleLayerResolutionSearchWrapper(event: Event, invalidValue: string) {
  const target = event.target as HTMLInputElement;
  const query = target.value;

  // Store the query for this invalid value
  const queries = importCtx.getLayerResolutionSearchQueries();
  queries.set(invalidValue, query);
  importCtx.setLayerResolutionSearchQueries(new Map(queries));

  const results = handleLayerResolutionSearch(query, importCtx.getAllLayers());
  const searchResults = importCtx.getLayerResolutionSearchResults();
  searchResults.set(invalidValue, results);
  importCtx.setLayerResolutionSearchResults(new Map(searchResults));
}

function selectLayerForResolutionWrapper(invalidValue: string, layer: any) {
  const layerResolution = importCtx.getLayerResolution();
  const newResolutions = selectLayerForResolution(
    invalidValue,
    layer,
    layerResolution.resolutions
  );
  importCtx.setLayerResolution({
    invalidValues: layerResolution.invalidValues,
    resolutions: newResolutions
  });

  const searchResults = importCtx.getLayerResolutionSearchResults();
  searchResults.delete(invalidValue);
  importCtx.setLayerResolutionSearchResults(new Map(searchResults));

  const queries = importCtx.getLayerResolutionSearchQueries();
  queries.delete(invalidValue);
  importCtx.setLayerResolutionSearchQueries(new Map(queries));
}

function resetLayerResolutionWrapper(invalidValue: string) {
  const layerResolution = importCtx.getLayerResolution();
  const newResolutions = resetLayerResolution(
    invalidValue,
    layerResolution.resolutions
  );
  importCtx.setLayerResolution({
    invalidValues: layerResolution.invalidValues,
    resolutions: newResolutions
  });

  const queries = importCtx.getLayerResolutionSearchQueries();
  queries.set(invalidValue, '');
  importCtx.setLayerResolutionSearchQueries(new Map(queries));

  // Focus the search input after a brief delay
  setTimeout(() => {
    const searchInput = document.querySelector(
      `input[data-layer-search-for="${invalidValue}"]`
    ) as HTMLInputElement;
    searchInput?.focus();
  }, 100);
}

function canCompleteLayerResolutionWrapper(): boolean {
  const layerResolution = importCtx.getLayerResolution();
  return canCompleteLayerResolution(
    layerResolution.invalidValues,
    layerResolution.resolutions
  );
}

async function validateLayersWrapper() {
  importCtx.setCurrentStep('layer-matching');

  // Preload layers for the project
  if (!importCtx.getLayersLoaded()) {
    await preloadLayersWrapper();
  }

  const layerColumns = importCtx
    .getColumns()
    .filter((col) => col.modelType === 'Layer');

  // If no layer columns, show layer selection modal
  if (layerColumns.length === 0) {
    const layerValidation = importCtx.getLayerValidation();
    layerValidation.showLayerSelection = true;
    importCtx.setLayerValidation(layerValidation);
    return;
  }

  const layerValidation = importCtx.getLayerValidation();
  layerValidation.isValidating = true;
  layerValidation.progress = 0;
  layerValidation.results = [];
  importCtx.setLayerValidation(layerValidation);

  if (!importCtx.getSelectedProject()) return;

  const { invalidCount, results } = await validateLayers(
    layerColumns,
    importCtx.getData(),
    importCtx.getHeaders(),
    importCtx.getSelectedProject()!.id,
    importCtx.getSelectedLocale() || 'en',
    (progress, total) => {
      const layerValidation = importCtx.getLayerValidation();
      layerValidation.progress = progress;
      layerValidation.total = total;
      importCtx.setLayerValidation(layerValidation);
    },
    (results) => {
      const layerValidation = importCtx.getLayerValidation();
      layerValidation.results = results;
      importCtx.setLayerValidation(layerValidation);
    }
  );

  const finalLayerValidation = importCtx.getLayerValidation();
  finalLayerValidation.isValidating = false;
  importCtx.setLayerValidation(finalLayerValidation);

  if (invalidCount === 0) {
    // Enrich feature data with validated layer IDs
    enrichFeaturesWithLayerData(importCtx, results);
    importCtx.setCurrentStep('property-matching');
  } else {
    // Prepare layer resolution data but don't automatically show the resolution interface
    // User needs to click "Resolve Invalid Layers" button to enter resolution mode
    importCtx.setLayerResolution({
      invalidValues: results.filter((r) => !r.isValid).map((r) => r.value),
      resolutions: new Map()
    });
  }
}

// Title and description validation function
function validateTitleColumns(): { isValid: boolean; errors: string[] } {
  const columns = importCtx.getColumns();
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();
  const errors: string[] = [];

  // Find title and description columns
  const titleColumns = columns.filter(
    (col) => col.modelType === 'Feature' && col.field === 'title'
  );
  const descriptionColumns = columns.filter(
    (col) => col.modelType === 'Feature' && col.field === 'description'
  );

  if (titleColumns.length === 0) {
    // No title columns selected - this is okay, skip validation
    return { isValid: true, errors: [] };
  }

  // Create map of locale to column index for titles
  const titleLocaleToColumnIndex = new Map<string, number>();
  titleColumns.forEach((col) => {
    const columnIndex = headers.findIndex((h) => h === col.header);
    if (columnIndex !== -1 && col.locale) {
      titleLocaleToColumnIndex.set(col.locale, columnIndex);
    }
  });

  // Create map for descriptions (for logging only)
  const descLocaleToColumnIndex = new Map<string, number>();
  descriptionColumns.forEach((col) => {
    const columnIndex = headers.findIndex((h) => h === col.header);
    if (columnIndex !== -1 && col.locale) {
      descLocaleToColumnIndex.set(col.locale, columnIndex);
    }
  });

  // Check each row for title and description values
  const rowsWithoutTitles: number[] = [];
  const rowsWithoutDescriptions: number[] = [];

  data.forEach((row, index) => {
    let hasAnyTitle = false;
    let hasAnyDescription = false;

    // Check title columns (required)
    titleLocaleToColumnIndex.forEach((columnIndex, locale) => {
      const value = row[columnIndex]?.trim();
      if (value && value.length > 0) {
        hasAnyTitle = true;
      }
    });

    // Check description columns (optional, just for logging)
    descLocaleToColumnIndex.forEach((columnIndex, locale) => {
      const value = row[columnIndex]?.trim();
      if (value && value.length > 0) {
        hasAnyDescription = true;
      }
    });

    if (!hasAnyTitle) {
      rowsWithoutTitles.push(index + 2); // +2 because index is 0-based and we want to account for header row
      console.warn(`🔍 Row ${index + 2} has no title in any locale:`, row);
    }

    // Log missing descriptions but don't block
    if (descriptionColumns.length > 0 && !hasAnyDescription) {
      rowsWithoutDescriptions.push(index + 2);
      console.info(
        `🔍 Row ${index + 2} has no description in any locale (optional):`,
        row
      );
    }
  });

  if (rowsWithoutTitles.length > 0) {
    errors.push(
      `Found ${rowsWithoutTitles.length} rows without titles in any locale.\n` +
        `Rows: ${rowsWithoutTitles.slice(0, 10).join(', ')}${rowsWithoutTitles.length > 10 ? '...' : ''}\n\n` +
        `Please ensure every row has a title value in at least one locale column.`
    );
  }

  // Log description info but don't add to errors
  if (rowsWithoutDescriptions.length > 0) {
    console.info(
      `🔍 Info: ${rowsWithoutDescriptions.length} rows have no descriptions (optional field)`
    );
  }

  if (errors.length > 0) {
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Location data validation function
function validateLocationData(): { isValid: boolean; errors: string[] } {
  const columns = importCtx.getColumns();
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();
  const errors: string[] = [];

  // Find address columns (both displayAddress and rawAddress)
  const addressColumns = columns.filter(
    (col) =>
      col.modelType === 'Feature' &&
      (col.field === 'displayAddress' || col.field === 'rawAddress')
  );

  // Find coordinate columns
  const latColumns = columns.filter(
    (col) => col.modelType === 'Feature' && col.field === 'latitude'
  );
  const lngColumns = columns.filter(
    (col) => col.modelType === 'Feature' && col.field === 'longitude'
  );

  // If no location columns at all, that's an error
  if (
    addressColumns.length === 0 &&
    latColumns.length === 0 &&
    lngColumns.length === 0
  ) {
    errors.push(
      'No location data columns found.\n\n' +
        'Please map at least one of the following:\n' +
        '- Address columns (displayAddress field)\n' +
        '- Coordinate columns (latitude/longitude fields)'
    );
    return { isValid: false, errors };
  }

  // Create maps for quick lookup
  const addressLocaleToColumnIndex = new Map<string, number>();
  addressColumns.forEach((col) => {
    const columnIndex = headers.findIndex((h) => h === col.header);
    if (columnIndex !== -1 && col.locale) {
      addressLocaleToColumnIndex.set(col.locale, columnIndex);
    }
  });

  const latColumnIndex =
    latColumns.length > 0 ? headers.findIndex((h) => h === latColumns[0].header) : -1;
  const lngColumnIndex =
    lngColumns.length > 0 ? headers.findIndex((h) => h === lngColumns[0].header) : -1;

  // Check each row for location data
  const rowsWithoutLocation: number[] = [];

  data.forEach((row, index) => {
    let hasAddress = false;
    let hasCoordinates = false;

    // Check for any address in any locale
    addressLocaleToColumnIndex.forEach((columnIndex, locale) => {
      const value = row[columnIndex]?.trim();
      if (value && value.length > 0) {
        hasAddress = true;
      }
    });

    // Check for coordinates
    if (latColumnIndex !== -1 && lngColumnIndex !== -1) {
      const lat = row[latColumnIndex]?.trim();
      const lng = row[lngColumnIndex]?.trim();
      if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
        hasCoordinates = true;
      }
    }

    if (!hasAddress && !hasCoordinates) {
      rowsWithoutLocation.push(index + 2); // +2 for header row and 1-based indexing
      console.warn(
        `🗺️ Row ${index + 2} has no location data (no address or coordinates):`,
        row
      );
    }
  });

  if (rowsWithoutLocation.length > 0) {
    errors.push(
      `Found ${rowsWithoutLocation.length} rows without location data.\n` +
        `Rows: ${rowsWithoutLocation.slice(0, 10).join(', ')}${rowsWithoutLocation.length > 10 ? '...' : ''}\n\n` +
        `Each row must have EITHER:\n` +
        `- An address in at least one locale, OR\n` +
        `- Valid latitude and longitude coordinates\n\n` +
        `Please provide location data for all rows or remove rows without location information.`
    );
  }

  if (errors.length > 0) {
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Normalize boolean values from CSV
function normalizeBooleanValue(value: string | null | undefined): boolean | null {
  if (!value) return null;

  const normalizedValue = value.toString().trim().toUpperCase();

  // TRUE values
  if (['TRUE', '1', 'YES', 'Y'].includes(normalizedValue)) {
    return true;
  }

  // FALSE values
  if (['FALSE', '0', 'NO', 'N'].includes(normalizedValue)) {
    return false;
  }

  return null;
}

// Enrich rows with normalized boolean feature fields
function enrichBooleanFields() {
  const columns = importCtx.getColumns();
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Map of field names to canonical "is" prefixed version
  const booleanFieldMap = new Map<string, string>([
    ['isPublished', 'isPublished'],
    ['published', 'isPublished'],
    ['isArchived', 'isArchived'],
    ['archived', 'isArchived'],
    ['isVisitable', 'isVisitable'],
    ['visitable', 'isVisitable'],
    ['isIntangible', 'isIntangible'],
    ['intangible', 'isIntangible']
  ]);

  const booleanColumns = columns.filter(
    (col) => col.modelType === 'Feature' && col.field && booleanFieldMap.has(col.field)
  );

  if (booleanColumns.length === 0) {
    return;
  }

  // Process each row
  data.forEach((row, rowIndex) => {
    const enrichedData = importCtx.getRowEnrichedData(rowIndex) || {};

    if (!enrichedData.feature) {
      enrichedData.feature = {};
    }

    booleanColumns.forEach((col) => {
      const columnIndex = headers.indexOf(col.header);
      if (columnIndex !== -1 && col.field) {
        const rawValue = row[columnIndex];
        const normalizedValue = normalizeBooleanValue(rawValue);

        if (normalizedValue !== null) {
          // Use the canonical field name (with "is" prefix)
          const canonicalFieldName = booleanFieldMap.get(col.field)!;
          enrichedData.feature[canonicalFieldName] = normalizedValue;
        }
      }
    });

    importCtx.setRowEnrichedData(rowIndex, enrichedData);
  });
}

// Footer button handlers
function handleCancel() {
  importCtx.reset();
}

function handleBack() {
  const currentStep = importCtx.getCurrentStep();

  if (currentStep === 'user-matching') {
    importCtx.setCurrentStep('column-mapping');
    importCtx.updateUserValidation({
      showUserSelection: false,
      showUserResolution: false
    });
  } else if (currentStep === 'layer-matching') {
    importCtx.setCurrentStep('user-matching');
    importCtx.updateLayerValidation({
      showLayerSelection: false,
      showLayerResolution: false,
      showLayerCreation: false
    });
  } else if (currentStep === 'property-matching') {
    importCtx.setCurrentStep('layer-matching');
  } else if (currentStep === 'feature-resolution') {
    importCtx.setCurrentStep('geo-lookup');
  }
}

function handleContinue() {
  const currentStep = importCtx.getCurrentStep();

  if (currentStep === 'column-mapping') {
    // Validate property columns
    const propertyValidation = validatePropertyColumns(importCtx);
    if (!propertyValidation.isValid) {
      emptyColumnsErrors = propertyValidation.errors;
      showEmptyColumnsModal = true;
      return;
    }

    // Validate title columns
    const titleValidation = validateTitleColumns();
    if (!titleValidation.isValid) {
      alert(
        'Title validation failed:\n\n' +
          titleValidation.errors.join('\n\n') +
          '\n\nPlease ensure at least one title column has non-empty values for all rows.'
      );
      return;
    }

    // Validate location data
    const locationValidation = validateLocationData();
    if (!locationValidation.isValid) {
      alert(
        'Location validation failed:\n\n' +
          locationValidation.errors.join('\n\n') +
          '\n\nPlease ensure each row has either address data OR coordinate data.'
      );
      return;
    }

    // Enrich boolean fields before proceeding
    enrichBooleanFields();

    validateUsersWrapper();
  } else if (currentStep === 'user-matching') {
    if (importCtx.getUserValidation().showUserSelection) {
      enrichFeaturesWithUserData(importCtx, []);
      validateLayersWrapper();
    } else if (importCtx.getUserValidation().showUserResolution) {
      enrichFeaturesWithUserData(importCtx, importCtx.getUserValidation().results);
      validateLayersWrapper();
    } else {
      // All users validated
      validateLayersWrapper();
    }
  } else if (currentStep === 'layer-matching') {
    if (importCtx.getLayerValidation().showLayerSelection) {
      enrichFeaturesWithLayerData(importCtx, []);
      importCtx.setCurrentStep('property-matching');
    } else if (importCtx.getLayerValidation().showLayerResolution) {
      enrichFeaturesWithLayerData(importCtx, importCtx.getLayerValidation().results);
      importCtx.setCurrentStep('property-matching');
    } else {
      // All layers validated
      importCtx.setCurrentStep('property-matching');
    }
  } else if (currentStep === 'feature-resolution') {
    importCtx.setCurrentStep('finished');
  }
}

function handleResolve() {
  const currentStep = importCtx.getCurrentStep();

  if (currentStep === 'user-matching') {
    startUserResolutionWrapper();
  } else if (currentStep === 'layer-matching') {
    importCtx.updateLayerValidation({ showLayerResolution: true });
  }
}

// Computed footer props based on current step and state
const footerProps = $derived.by(() => {
  const currentStep = importCtx.getCurrentStep();

  if (currentStep === 'column-mapping') {
    return {
      onCancel: handleCancel,
      onContinue: handleContinue
    };
  }

  if (currentStep === 'user-matching') {
    const userValidation = importCtx.getUserValidation();
    const invalidCount = userValidation.results.filter((r) => !r.isValid).length;

    if (userValidation.showUserSelection) {
      return {
        onBack: handleBack,
        onContinue: handleContinue,
        continueDisabled: !userValidation.fallbackUserId
      };
    } else if (userValidation.showUserResolution) {
      return {
        onBack: handleBack,
        onContinue: handleContinue,
        continueDisabled: !canCompleteUserResolutionWrapper()
      };
    } else if (userValidation.results.length > 0 && !userValidation.isValidating) {
      if (invalidCount === 0) {
        return {
          onBack: handleBack,
          onContinue: handleContinue
        };
      } else {
        return {
          onBack: handleBack,
          onResolve: handleResolve,
          showResolveButton: true,
          resolveLabel: `Resolve ${invalidCount} Invalid User${invalidCount > 1 ? 's' : ''}`
        };
      }
    }
  }

  if (currentStep === 'layer-matching') {
    const layerValidation = importCtx.getLayerValidation();
    const invalidCount = layerValidation.results.filter((r: any) => !r.isValid).length;

    if (layerValidation.showLayerSelection) {
      return {
        onBack: handleBack,
        onContinue: handleContinue,
        continueDisabled: !layerValidation.fallbackLayerId
      };
    } else if (layerValidation.showLayerResolution) {
      return {
        onBack: handleBack,
        onContinue: handleContinue,
        continueDisabled: !canCompleteLayerResolutionWrapper()
      };
    } else if (layerValidation.results.length > 0 && !layerValidation.isValidating) {
      if (invalidCount === 0) {
        return {
          onBack: handleBack,
          onContinue: handleContinue
        };
      } else {
        return {
          onBack: handleBack,
          onResolve: handleResolve,
          showResolveButton: true,
          resolveLabel: `Resolve ${invalidCount} Invalid Layer${invalidCount > 1 ? 's' : ''}`
        };
      }
    }
  }

  if (currentStep === 'property-matching') {
    return {
      onBack: handleBack
      // Property reconciliation handles its own navigation
    };
  }

  if (currentStep === 'feature-resolution') {
    const pendingCount = featureResolutionStatusCounts?.pending ?? 0;
    return {
      onBack: handleBack,
      onContinue: featureResolutionStartProcessing,
      continueLabel: `Start Processing (${pendingCount} pending)`,
      continueDisabled: !featureResolutionStartProcessing || pendingCount === 0
    };
  }

  return {};
});
</script>

<div class="flex h-full flex-col gap-6 overflow-y-auto p-6">
  {#if !importCtx.getIsTypeSelected()}
    <Dropzones
      onFeaturesDrop={(e) => handleCSVDropEvent(importCtx, e)}
      onImagesDrop={handleImageDropEventWrapper}
      {isUploading}
      uploadProgress={isUploading
        ? `${m.flat_close_slug_bubble()} ${currentBatch} / ${totalBatches}...`
        : ''} />
  {/if}

  <!-- CSV :: Import Process -->
  {#if importCtx.getIsTypeSelected()}
    <div class="h-full flex-none" in:fade={{ duration: 300 }}>
      <div class="card h-full bg-glass-result">
        <div class="card-body h-full">
          <!-- Header -->
          <div class="flex items-center justify-between">
            <ImportHeader
              {...getHeaderProps(importCtx.getCurrentStep())}
              showProgress={false} />
            <!-- CSV Stats (always shown) -->
            <CSVStats
              stats={importCtx.getStats()}
              totalColumns={importCtx.getHeaders().length} />
          </div>
          <!-- Body Content -->
          <div class="h-full flex-1 overflow-y-auto">
            {#if importCtx.getCurrentStep() === 'column-mapping'}
              <!-- Column Mapping Interface -->
              <div class="space-y-4">
                {#each importCtx.getColumns() as column, index}
                  <div
                    class="grid grid-cols-1 gap-4 rounded-lg border border-base-content/20 bg-base-100/50 p-4 lg:grid-cols-7">
                    <!-- CSV Column Info -->
                    <div class="lg:col-span-2">
                      <h4 class="text-sm font-medium">{column.header}</h4>
                      <div class="mt-1 text-xs text-base-content/70">
                        {#each column.sampleValues.slice(0, 3) as sample, i}
                          <span class="mr-2 inline-block" title={sample}>
                            {sample.length > 25
                              ? sample.substring(0, 25) + '...'
                              : sample}
                          </span>
                        {/each}
                      </div>
                      {#if column.layerConstraint}
                        <div class="mt-1 text-xs text-info">
                          <span class="font-medium">Layer:</span>
                          {#if column.layerConstraint.type === 'all'}
                            ALL
                          {:else if column.layerConstraint.type === 'multiple'}
                            {column.layerConstraint.layers.join(', ')}
                          {:else}
                            {column.layerConstraint.layers[0]}
                          {/if}
                        </div>
                      {/if}
                      {#if column.extractedPropertyKey && column.modelType === 'Property'}
                        <div class="mt-1 text-xs text-secondary">
                          <span class="font-medium">Property:</span>
                          {column.extractedPropertyKey}
                        </div>
                      {/if}
                    </div>

                    <!-- Model Type -->
                    <div>
                      <label class="label label-text text-xs">Model</label>
                      <select
                        class="select select-bordered select-sm w-full"
                        bind:value={column.modelType}>
                        <option value="SKIP">SKIP</option>
                        <option value="Feature">Feature</option>
                        <option value="User">User</option>
                        <option value="Property">Property</option>
                        <option value="Layer">Layer</option>
                        <option value="Address">Address</option>
                        <option value="AddressMeta">AddressMeta</option>
                      </select>
                    </div>

                    <!-- Locale (if applicable) -->
                    <div>
                      <label class="label label-text text-xs">Locale</label>
                      <select
                        class="select select-bordered select-sm w-full"
                        bind:value={column.locale}
                        disabled={column.modelType === 'SKIP' ||
                          column.modelType === 'User' ||
                          column.modelType === 'AddressMeta'}
                        onchange={() => {
                          // Validate if locale=None is selected for Property with categorical type
                          if (
                            column.locale === 'None' &&
                            column.modelType === 'Property' &&
                            column.propertyKey === 'NEW' &&
                            column.propertyType === 'classifier'
                          ) {
                            const columnIndex = importCtx.getColumnIndex(column);
                            const data = importCtx.getData();

                            // Get sample values to check
                            const values = data
                              .map((row) => row[columnIndex])
                              .filter((val) => val && val.trim())
                              .map((val) => val.trim())
                              .slice(0, 20); // Check first 20 values for performance

                            const hasInvalidValues = values.some((value) => {
                              const lowerValue = value.toLowerCase();
                              if (lowerValue === 'true' || lowerValue === 'false')
                                return false;
                              const numericValue = parseFloat(value);
                              return isNaN(numericValue) || !isFinite(numericValue);
                            });

                            if (hasInvalidValues) {
                              alert(
                                `Cannot set locale to "None" for categorical property. All values must be numbers or booleans (true/false) when locale is None. Please clean your data or select a specific locale.`
                              );
                              column.locale = SupportedLocales.en; // Reset to English
                            }
                          }
                        }}>
                        <option value="None">None</option>
                        <option value="en">English</option>
                        <option value="zh-hant">Trad. Chinese</option>
                        <option value="zh-hans">Simp. Chinese</option>
                      </select>
                    </div>

                    <!-- Property Key (for Property model) -->
                    {#if column.modelType === 'Property'}
                      <div>
                        <label class="label label-text text-xs">Property Key</label>
                        <select
                          class="select select-bordered select-sm w-full"
                          bind:value={column.propertyKey}
                          onchange={() => {
                            // Update field options when property key changes
                            if (column.propertyKey === 'NEW') {
                              column.field = 'value';
                              // Keep the detected property type for new properties
                              // The extractedPropertyKey will be used for the actual property key
                            } else {
                              // For existing properties, auto-detect if this is an ID field
                              const columnIndex = importCtx.getColumnIndex(column);
                              const nonEmptyValues = importCtx
                                .getData()
                                .map((row) => row[columnIndex] || '')
                                .filter((val) => val.trim() !== '');

                              // Check if all non-empty values have consistent length of 12 or 16 characters
                              const allAreIds =
                                nonEmptyValues.length > 0 &&
                                (nonEmptyValues.every((val) => val.length === 12) ||
                                  nonEmptyValues.every((val) => val.length === 16));

                              column.field = allAreIds ? 'id' : 'value';
                              column.propertyType = getPropertyType(
                                column.propertyKey || '',
                                importCtx.getFetchedProperties()
                              );
                            }
                          }}>
                          <option value="NEW">
                            NEW{column.extractedPropertyKey
                              ? ` (${column.extractedPropertyKey})`
                              : ''}
                          </option>
                          {#if importCtx.getIsFetchingProperties()}
                            <option disabled>Loading properties...</option>
                          {:else}
                            {#each importCtx.getAvailablePropertyKeys() as key}
                              <option value={key}>{key}</option>
                            {/each}
                          {/if}
                        </select>
                      </div>
                    {:else}
                      <div></div>
                    {/if}

                    <!-- Property Type (for new properties) -->
                    {#if column.modelType === 'Property' && column.propertyKey === 'NEW'}
                      <div>
                        <label class="label label-text text-xs">
                          Property Type
                          <span class="text-xs text-base-content/50">auto</span>
                        </label>
                        <select
                          class="select select-bordered select-sm w-full"
                          bind:value={column.propertyType}>
                          <option value="classifier">Categorical</option>
                          <option value="specifier">Freeform</option>
                        </select>
                      </div>
                    {:else}
                      <div></div>
                    {/if}

                    <!-- Field -->
                    <div>
                      <label class="label label-text text-xs">Field</label>
                      <select
                        class="select select-bordered select-sm w-full"
                        bind:value={column.field}
                        disabled={column.modelType === 'SKIP'}>
                        <option value="">Select...</option>
                        {#each getAvailableFields(column.modelType, column.locale, column.propertyKey) as field}
                          <option value={field}>{field}</option>
                        {/each}
                      </select>
                    </div>
                  </div>
                {/each}
              </div>
            {:else if importCtx.getCurrentStep() === 'user-matching'}
              <!-- User Matching Interface -->

              <!-- Progress Bar (when validating) -->
              {#if importCtx.getUserValidation().isValidating}
                <div class="mb-6">
                  <div class="mb-2 flex items-center justify-between text-sm">
                    <span>Validating users...</span>
                    <span>
                      {importCtx.getUserValidation().progress} / {importCtx.getUserValidation()
                        .total}
                    </span>
                  </div>
                  <progress
                    class="progress progress-primary w-full"
                    value={importCtx.getUserValidation().progress}
                    max={importCtx.getUserValidation().total}>
                  </progress>
                </div>
              {/if}

              <!-- User Selection (when no user columns found) -->
              {#if importCtx.getUserValidation().showUserSelection}
                <div class="space-y-4">
                  <div class="rounded-lg border border-warning bg-warning/10 p-4">
                    <h4 class="font-medium text-warning">No User Column Found</h4>
                    <p class="text-sm text-base-content/70">
                      Please select a user to assign as the contributor for all imported
                      features.
                    </p>
                  </div>

                  <!-- User Search Interface -->
                  {#if importCtx.getUserValidation().fallbackUserId}
                    <!-- Show selected user -->
                    <div class="rounded-lg border border-success bg-success/10 p-4">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <Icon src={CheckCircle} class="h-5 w-5 text-success" />
                          <div>
                            <div class="font-medium">User Selected</div>
                            <div class="text-sm text-base-content/70">
                              ID: {importCtx.getUserValidation().fallbackUserId}
                            </div>
                          </div>
                        </div>
                        <button
                          class="btn btn-ghost btn-sm"
                          onclick={() => {
                            importCtx.getUserValidation().fallbackUserId = undefined;
                          }}>
                          Change User
                        </button>
                      </div>
                    </div>
                  {:else}
                    <!-- User search -->
                    <div class="space-y-2">
                      <label class="label">
                        <span class="label-text">Search for a user</span>
                      </label>
                      <div class="relative">
                        <input
                          type="text"
                          placeholder="Search by name, email, or username..."
                          class="input input-bordered w-full pr-10"
                          bind:value={importCtx.state.userSearchQuery}
                          oninput={handleUserSearchWrapper} />
                        <div class="absolute inset-y-0 right-2 flex items-center pr-3">
                          <Icon
                            src={MagnifyingGlass}
                            class="h-5 w-5 text-base-content/50" />
                        </div>
                      </div>

                      {#if importCtx.getUserSearchResults().length > 0}
                        <div
                          class="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-base-content/20 bg-base-100">
                          {#each importCtx.getUserSearchResults() as user}
                            <button
                              class="flex w-full items-center gap-3 p-3 text-left hover:bg-base-200"
                              onclick={() => selectUserWrapper(user)}>
                              <div
                                class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-content">
                                {user.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div class="min-w-0 flex-1">
                                <div class="font-medium">{user.name || 'Unknown'}</div>
                                {#if user.email}
                                  <div class="text-sm text-base-content/70">
                                    {user.email}
                                  </div>
                                {/if}
                              </div>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Validation Results -->
              {#if importCtx.getUserValidation().results.length > 0 && !importCtx.getUserValidation().showUserSelection}
                <div class="space-y-4">
                  <h4 class="font-medium">Validation Results</h4>

                  {#if !importCtx.getUserValidation().showUserResolution}
                    <!-- Show validation summary -->
                    <div class="space-y-2">
                      {#each importCtx.getUserValidation().results as result}
                        <div
                          class="flex items-center justify-between rounded-lg border border-base-content/20 bg-base-100/50 p-3">
                          <div class="flex items-center gap-3">
                            {#if result.isValid}
                              <Icon src={CheckCircle} class="h-5 w-5 text-success" />
                            {:else}
                              <Icon src={XCircle} class="h-5 w-5 text-error" />
                            {/if}
                            <div>
                              <div class="font-medium">{result.value}</div>
                              {#if result.error}
                                <div class="text-sm text-error">{result.error}</div>
                              {/if}
                            </div>
                          </div>
                          <div
                            class="badge {result.isValid
                              ? 'badge-success'
                              : 'badge-error'}">
                            {result.isValid ? 'Valid' : 'Invalid'}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <!-- User Resolution Interface -->
                    <div class="space-y-4">
                      {#if importCtx.getUserResolution().invalidValues.length === importCtx.getUserResolution().resolutions.size}
                        <div class="rounded-lg border border-success bg-success/10 p-4">
                          <h4 class="font-medium text-success">All Users Resolved ✓</h4>
                          <p class="text-sm text-success/70">
                            All invalid user values have been successfully resolved. You
                            can now continue to the next step.
                          </p>
                        </div>
                      {:else}
                        <div class="rounded-lg border border-warning bg-warning/10 p-4">
                          <h4 class="font-medium text-warning">
                            Resolve Invalid Users ({importCtx.getUserResolution()
                              .invalidValues.length -
                              importCtx.getUserResolution().resolutions.size} remaining)
                          </h4>
                          <p class="text-sm text-base-content/70">
                            Please select a replacement user for each invalid value.
                          </p>
                        </div>
                      {/if}

                      {#each importCtx.getUserResolution().invalidValues as invalidValue}
                        {@const resolution = importCtx
                          .getUserResolution()
                          .resolutions.get(invalidValue)}
                        {@const resolvedUser = resolution?.userData}
                        <div
                          class="grid grid-cols-1 gap-4 rounded-lg border border-base-content/20 bg-base-100/50 p-4 lg:grid-cols-2">
                          <!-- Invalid Value -->
                          <div class="space-y-2">
                            <h4 class="text-sm font-medium text-error">
                              Invalid Value
                            </h4>
                            <div class="flex items-center gap-2">
                              <Icon src={XCircle} class="h-5 w-5 text-error" />
                              <span class="font-mono text-sm">{invalidValue}</span>
                            </div>
                          </div>

                          <!-- Resolution Selection -->
                          <div class="space-y-2">
                            <h4 class="text-sm font-medium">
                              Assign all their features to
                            </h4>
                            {#if resolution}
                              <!-- Show selected user -->
                              <button
                                class="flex w-full items-center justify-between rounded border border-success bg-success/10 p-3 text-left transition-colors hover:bg-success/20 focus:bg-success/20 focus:outline-none"
                                onclick={() => resetUserResolutionWrapper(invalidValue)}
                                title="Click to change user selection">
                                <div class="flex items-center gap-3">
                                  {#if resolvedUser?.image}
                                    <img
                                      src={resolvedUser.image}
                                      alt={resolvedUser?.name || 'User'}
                                      class="h-8 w-8 rounded-full object-cover" />
                                  {:else}
                                    <div
                                      class="flex h-8 w-8 items-center justify-center rounded-full bg-success text-xs font-medium text-success-content">
                                      {resolvedUser?.name?.charAt(0)?.toUpperCase() ||
                                        '?'}
                                    </div>
                                  {/if}
                                  <div class="min-w-0">
                                    <div class="text-sm font-medium">
                                      {resolvedUser?.name || 'Selected User'}
                                    </div>
                                    {#if resolvedUser?.email}
                                      <div class="text-xs text-success/70">
                                        {resolvedUser.email}
                                      </div>
                                    {/if}
                                  </div>
                                </div>
                                <div
                                  class="flex items-center gap-2 text-xs text-success/70">
                                  <Icon src={CheckCircle} class="h-4 w-4" />
                                  <span>Click to change</span>
                                </div>
                              </button>
                            {:else}
                              <!-- User search for this invalid value -->
                              <div class="relative">
                                <input
                                  type="text"
                                  placeholder="Search for replacement user..."
                                  class="input input-sm input-bordered w-full pr-10"
                                  value={importCtx
                                    .getResolutionSearchQueries()
                                    .get(invalidValue) || ''}
                                  data-search-for={invalidValue}
                                  tabindex="0"
                                  oninput={(e) =>
                                    handleResolutionUserSearchWrapper(e, invalidValue)}
                                  onkeydown={(e) =>
                                    handleSearchKeydown(e, invalidValue)} />
                                <div
                                  class="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-3">
                                  <Icon
                                    src={MagnifyingGlass}
                                    class="h-4 w-4 text-base-content/50" />
                                </div>

                                <!-- Search results overlay for this specific invalid value -->
                                {#if (importCtx
                                    .getResolutionSearchResults()
                                    .get(invalidValue) || []).length > 0}
                                  <div
                                    class="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 shadow-lg">
                                    {#each importCtx
                                      .getResolutionSearchResults()
                                      .get(invalidValue) || [] as user, index}
                                      <button
                                        class="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-base-200 focus:bg-base-200 focus:outline-none"
                                        data-invalid-value={invalidValue}
                                        data-result-index={index}
                                        tabindex="0"
                                        onclick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          selectUserForResolutionWrapper(
                                            invalidValue,
                                            user
                                          );
                                        }}
                                        onkeydown={(e) =>
                                          handleResultKeydown(e, invalidValue, user)}>
                                        {#if user.image}
                                          <img
                                            src={user.image}
                                            alt={user.name || 'User'}
                                            class="h-8 w-8 rounded-full object-cover" />
                                        {:else}
                                          <div
                                            class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-content">
                                            {user.name?.charAt(0)?.toUpperCase() || '?'}
                                          </div>
                                        {/if}
                                        <div class="min-w-0 flex-1">
                                          <div class="text-sm font-medium">
                                            {user.name || 'Unknown'}
                                          </div>
                                          {#if user.email}
                                            <div class="text-xs text-base-content/70">
                                              {user.email}
                                            </div>
                                          {/if}
                                        </div>
                                      </button>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {:else if importCtx.getCurrentStep() === 'layer-matching'}
              <!-- Layer Matching Interface -->

              <!-- Progress Bar (when validating) -->
              {#if importCtx.getLayerValidation().isValidating}
                <div class="mb-6">
                  <div class="mb-2 flex items-center justify-between text-sm">
                    <span>Validating layers...</span>
                    <span>
                      {importCtx.getLayerValidation().progress} / {importCtx.getLayerValidation()
                        .total}
                    </span>
                  </div>
                  <progress
                    class="progress progress-primary w-full"
                    value={importCtx.getLayerValidation().progress}
                    max={importCtx.getLayerValidation().total}></progress>
                </div>
              {/if}

              <!-- Layer Selection Modal -->
              {#if importCtx.getLayerValidation().showLayerSelection}
                <div class="space-y-4">
                  <div class="rounded-lg border border-info bg-info/10 p-4">
                    <h4 class="font-medium text-info">Select Layer</h4>
                    <p class="text-sm text-base-content/70">
                      No layer column was detected.
                      {#if importCtx.getLayersLoaded() && importCtx.getAllLayers().length === 0}
                        Create a new layer for all features to be assigned to.
                      {:else}
                        Please select which layer all features should be assigned to.
                      {/if}
                    </p>
                  </div>

                  <!-- Layer Search and Create (only show if no layer is selected and not creating) -->
                  {#if !importCtx.getSelectedLayer() && !importCtx.getIsCreatingLayer()}
                    <!-- Layer Search (only show if layers exist) -->
                    {#if importCtx.getLayersLoaded() && importCtx.getAllLayers().length > 0}
                      <div class="space-y-4">
                        <div class="flex w-full flex-row items-stretch gap-2">
                          <div class="relative flex-1">
                            <input
                              type="text"
                              placeholder="Search for layer..."
                              class="input input-bordered w-full pr-10"
                              bind:value={importCtx.state.layerSearchQuery}
                              oninput={handleLayerSearchWrapper}
                              onfocus={handleLayerSearchFocusWrapper} />
                            <div
                              class="absolute inset-y-0 right-2 flex items-center pr-3">
                              <Icon
                                src={MagnifyingGlass}
                                class="h-4 w-4 text-base-content/50" />
                            </div>
                          </div>
                          <!-- New Layer Button -->
                          <button
                            class="btn btn-outline btn-primary flex-shrink-0"
                            onclick={() => showLayerCreationForm(importCtx)}>
                            <Icon src={Plus} class="h-4 w-4" />
                            Create New Layer
                          </button>
                        </div>

                        <!-- Search Results -->
                        {#if importCtx.getLayerSearchResults().length > 0}
                          <div class="space-y-2">
                            {#each importCtx.getLayerSearchResults() as layer}
                              <button
                                class="flex w-full items-center gap-3 rounded border border-base-content/20 bg-base-100 p-3 text-left hover:bg-base-200"
                                onclick={() => selectLayerWrapper(layer)}>
                                <div
                                  class="flex h-8 w-8 items-center justify-center rounded bg-primary text-xs font-medium text-primary-content">
                                  {layer.i18n?.en?.name?.charAt(0)?.toUpperCase() ||
                                    'L'}
                                </div>
                                <div class="min-w-0 flex-1">
                                  <div class="text-sm font-medium">
                                    {layer.i18n?.en?.name || 'Unknown Layer'}
                                  </div>
                                  {#if layer.i18n?.en?.description}
                                    <div class="text-xs text-base-content/70">
                                      {layer.i18n.en.description}
                                    </div>
                                  {/if}
                                </div>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <!-- Show create button when no layers exist -->
                      <div class="flex justify-center">
                        <button
                          class="btn btn-outline btn-primary"
                          onclick={() => showLayerCreationForm(importCtx)}>
                          <Icon src={Plus} class="h-4 w-4" />
                          Create New Layer
                        </button>
                      </div>
                    {/if}
                  {/if}

                  <!-- Inline Layer Creation Form -->
                  {#if importCtx.getIsCreatingLayer()}
                    <div class="mt-4 rounded-lg border border-primary bg-primary/5 p-4">
                      <div class="mb-4 flex items-center justify-between">
                        <h4 class="font-medium text-primary">Create New Layer</h4>
                        <button
                          class="btn btn-ghost btn-sm"
                          onclick={() => hideLayerCreationForm(importCtx)}>
                          <Icon src={XCircle} class="h-4 w-4" />
                        </button>
                      </div>

                      {#if importCtx.getLayerForm()}
                        <form onsubmit={(e) => submitLayerForm(importCtx, e)}>
                          <I18nSection
                            title={m.admin__forms_common_descriptors()}
                            fields={LAYER_FIELDS as any}
                            form={importCtx.getLayerForm()} />

                          <div class="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              class="btn btn-ghost"
                              onclick={() => hideLayerCreationForm(importCtx)}>
                              Cancel
                            </button>
                            <button
                              type="submit"
                              class="btn btn-primary"
                              disabled={importCtx.getIsSubmittingLayer()}>
                              {importCtx.getIsSubmittingLayer()
                                ? 'Creating...'
                                : 'Create Layer'}
                            </button>
                          </div>
                        </form>
                      {/if}
                    </div>
                  {/if}

                  <!-- Selected Layer Display -->
                  {#if importCtx.getSelectedLayer()}
                    <button
                      class="w-full rounded border border-success bg-success/10 p-3 text-left transition-colors hover:bg-success/20"
                      onclick={() => {
                        importCtx.setSelectedLayer(null);
                        const layerValidation = importCtx.getLayerValidation();
                        layerValidation.fallbackLayerId = undefined;
                        importCtx.setLayerValidation(layerValidation);
                      }}
                      title="Click to unselect this layer">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                          <Icon src={CheckCircle} class="h-5 w-5 text-success" />
                          <div>
                            <div class="font-medium text-success">
                              Selected: {importCtx.getSelectedLayer()?.i18n?.en?.name}
                            </div>
                            <div class="text-sm text-success/70">
                              All features will be assigned to this layer
                            </div>
                          </div>
                        </div>
                        <div class="text-xs text-success/70">Click to change</div>
                      </div>
                    </button>
                  {/if}
                </div>
              {/if}

              <!-- Layer Validation Results -->
              {#if !importCtx.getLayerValidation().isValidating && !importCtx.getLayerValidation().showLayerSelection}
                <div class="space-y-4">
                  {#if importCtx.getLayerValidation().results.length > 0 && !importCtx.getLayerValidation().showLayerResolution}
                    <!-- Validation Results Summary -->
                    {@const validCount = importCtx
                      .getLayerValidation()
                      .results.filter((r: any) => r.isValid).length}
                    {@const invalidCount = importCtx
                      .getLayerValidation()
                      .results.filter((r: any) => !r.isValid).length}
                    <div class="space-y-2">
                      {#each importCtx.getLayerValidation().results as result}
                        <div
                          class="flex items-center justify-between rounded border border-base-content/20 bg-base-100/50 p-3">
                          <div class="flex items-center gap-3">
                            {#if result.isValid}
                              <Icon src={CheckCircle} class="h-5 w-5 text-success" />
                            {:else}
                              <Icon src={XCircle} class="h-5 w-5 text-error" />
                            {/if}
                            <div>
                              <div class="font-medium">{result.value}</div>
                              {#if result.error}
                                <div class="text-sm text-error">{result.error}</div>
                              {/if}
                            </div>
                          </div>
                          <div
                            class="badge {result.isValid
                              ? 'badge-success'
                              : 'badge-error'}">
                            {result.isValid ? 'Valid' : 'Invalid'}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <!-- Layer Resolution Interface -->
                    <div class="space-y-4">
                      {#if importCtx.getLayerResolution().invalidValues.length === importCtx.getLayerResolution().resolutions.size}
                        <div class="rounded-lg border border-success bg-success/10 p-4">
                          <h4 class="font-medium text-success">
                            All Layers Resolved ✓
                          </h4>
                          <p class="text-sm text-success/70">
                            All invalid layer values have been successfully resolved.
                            You can now continue to the next step.
                          </p>
                        </div>
                      {:else}
                        <div class="rounded-lg border border-warning bg-warning/10 p-4">
                          <h4 class="font-medium text-warning">
                            Resolve Invalid Layers ({importCtx.getLayerResolution()
                              .invalidValues.length -
                              importCtx.getLayerResolution().resolutions.size} remaining)
                          </h4>
                          <p class="text-sm text-base-content/70">
                            Please select a replacement layer for each invalid value.
                          </p>
                        </div>
                      {/if}

                      {#each importCtx.getLayerResolution().invalidValues as invalidValue}
                        {@const resolution = importCtx
                          .getLayerResolution()
                          .resolutions.get(invalidValue)}
                        {@const resolvedLayer = resolution?.layerData}
                        <div
                          class="grid grid-cols-1 gap-4 rounded-lg border border-base-content/20 bg-base-100/50 p-4 lg:grid-cols-2">
                          <!-- Invalid Value -->
                          <div class="space-y-2">
                            <h4 class="text-sm font-medium text-error">
                              Invalid Value
                            </h4>
                            <div class="flex items-center gap-2">
                              <Icon src={XCircle} class="h-5 w-5 text-error" />
                              <span class="font-mono text-sm">{invalidValue}</span>
                            </div>
                          </div>

                          <!-- Resolution Selection -->
                          <div class="space-y-2">
                            <div class="flex items-center justify-between">
                              <h4 class="text-sm font-medium">Assign to Layer</h4>
                              {#if !importCtx.getIsCreatingLayer() || importCtx.getActiveLayerCreation() !== invalidValue}
                                <button
                                  class="btn btn-outline btn-primary btn-xs"
                                  onclick={() => {
                                    showLayerCreationForm(importCtx, invalidValue);
                                    importCtx.setActiveLayerCreation(invalidValue);
                                  }}>
                                  <Icon src={Plus} class="h-3 w-3" />
                                  NEW
                                </button>
                              {/if}
                            </div>
                            {#if resolution}
                              <!-- Show selected layer -->
                              <button
                                class="flex w-full items-center justify-between rounded border border-success bg-success/10 p-3 text-left transition-colors hover:bg-success/20 focus:bg-success/20 focus:outline-none"
                                onclick={() =>
                                  resetLayerResolutionWrapper(invalidValue)}
                                title="Click to change layer selection">
                                <div class="flex items-center gap-3">
                                  <div
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-success text-xs font-medium text-success-content">
                                    {resolvedLayer?.i18n?.en?.name
                                      ?.charAt(0)
                                      ?.toUpperCase() || 'L'}
                                  </div>
                                  <div class="min-w-0">
                                    <div class="text-sm font-medium">
                                      {resolvedLayer?.i18n?.en?.name ||
                                        'Selected Layer'}
                                    </div>
                                    {#if resolvedLayer?.i18n?.en?.description}
                                      <div class="text-xs text-success/70">
                                        {resolvedLayer.i18n.en.description}
                                      </div>
                                    {/if}
                                  </div>
                                </div>
                                <div
                                  class="flex items-center gap-2 text-xs text-success/70">
                                  <Icon src={CheckCircle} class="h-4 w-4" />
                                  <span>Click to change</span>
                                </div>
                              </button>
                            {:else if !importCtx.getIsCreatingLayer() || importCtx.getActiveLayerCreation() !== invalidValue}
                              <!-- Layer search for this invalid value (only show when not creating layer for this value) -->
                              <div class="relative">
                                <input
                                  type="text"
                                  placeholder="Search for replacement layer..."
                                  class="input input-sm input-bordered w-full pr-10"
                                  value={importCtx
                                    .getLayerResolutionSearchQueries()
                                    .get(invalidValue) || ''}
                                  data-layer-search-for={invalidValue}
                                  tabindex="0"
                                  oninput={(e) =>
                                    handleLayerResolutionSearchWrapper(
                                      e,
                                      invalidValue
                                    )} />
                                <div
                                  class="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-3">
                                  <Icon
                                    src={MagnifyingGlass}
                                    class="h-4 w-4 text-base-content/50" />
                                </div>

                                <!-- Search results overlay for this specific invalid value -->
                                {#if (importCtx
                                    .getLayerResolutionSearchResults()
                                    .get(invalidValue) || []).length > 0}
                                  <div
                                    class="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 shadow-lg">
                                    {#each importCtx
                                      .getLayerResolutionSearchResults()
                                      .get(invalidValue) || [] as layer, index}
                                      <button
                                        class="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-base-200 focus:bg-base-200 focus:outline-none"
                                        data-invalid-value={invalidValue}
                                        data-result-index={index}
                                        tabindex="0"
                                        onclick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          selectLayerForResolutionWrapper(
                                            invalidValue,
                                            layer
                                          );
                                        }}>
                                        <div
                                          class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-content">
                                          {layer.i18n?.en?.name
                                            ?.charAt(0)
                                            ?.toUpperCase() || 'L'}
                                        </div>
                                        <div class="min-w-0 flex-1">
                                          <div class="text-sm font-medium">
                                            {layer.i18n?.en?.name || 'Unknown Layer'}
                                          </div>
                                          {#if layer.i18n?.en?.description}
                                            <div class="text-xs text-base-content/70">
                                              {layer.i18n.en.description}
                                            </div>
                                          {/if}
                                        </div>
                                      </button>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            {/if}
                          </div>
                        </div>

                        <!-- Inline Layer Creation Form for this specific invalid value -->
                        {#if importCtx.getIsCreatingLayer() && importCtx.getActiveLayerCreation() === invalidValue}
                          <div
                            class="mt-4 rounded-lg border border-primary bg-primary/5 p-4">
                            <div class="mb-4 flex items-center justify-between">
                              <h4 class="font-medium text-primary">
                                Create New Layer for "{invalidValue}"
                              </h4>
                              <button
                                class="btn btn-ghost btn-sm"
                                onclick={() => {
                                  hideLayerCreationForm(importCtx);
                                  importCtx.setActiveLayerCreation(null);
                                }}>
                                <Icon src={XCircle} class="h-4 w-4" />
                              </button>
                            </div>

                            {#if importCtx.getLayerForm()}
                              <form onsubmit={(e) => submitLayerForm(importCtx, e)}>
                                <I18nSection
                                  title={m.admin__forms_common_descriptors()}
                                  fields={LAYER_FIELDS as any}
                                  form={importCtx.getLayerForm()} />

                                <div class="mt-4 flex justify-end gap-2">
                                  <button
                                    type="button"
                                    class="btn btn-ghost"
                                    onclick={() => {
                                      hideLayerCreationForm(importCtx);
                                      importCtx.setActiveLayerCreation(null);
                                    }}>
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    class="btn btn-primary"
                                    disabled={importCtx.getIsSubmittingLayer()}>
                                    {importCtx.getIsSubmittingLayer()
                                      ? 'Creating...'
                                      : 'Create Layer'}
                                  </button>
                                </div>
                              </form>
                            {/if}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {:else if importCtx.getCurrentStep() === 'property-matching'}
              <!-- Property Reconciliation Interface -->
              <PropertyReconciliation />
            {:else if importCtx.getCurrentStep() === 'translation'}
              <!-- Translation Step Interface -->
              <TranslationStep />
            {:else if importCtx.getCurrentStep() === 'geo-lookup'}
              <!-- Geo Lookup Step Interface -->
              <GeoLookupStep />
            {:else if importCtx.getCurrentStep() === 'feature-resolution'}
              <!-- Feature Resolution Step Interface -->
              <FeatureResolutionStep
                bind:startProcessing={featureResolutionStartProcessing}
                bind:statusCounts={featureResolutionStatusCounts} />
            {/if}
          </div>

          <!-- Footer with Progress and Actions -->
          <ImportFooter {...footerProps} />
        </div>
      </div>
    </div>
  {/if}

  <!-- TODO Clean up the condition under which this is shown -->
  <!-- IMAGE :: Progress Summary -->
  {#if uploadResults.length > 0}
    <div class="flex-none" in:fade={{ duration: 300 }}>
      <UploadSummary {successCount} {errorCount} {uploadingCount} {pendingCount} />
    </div>
  {/if}

  <!-- IMAGE :: Upload Results -->
  {#if uploadResults.length > 0}
    <div class="flex-1" in:fade={{ duration: 300, delay: 200 }}>
      <h3 class="mb-4 text-lg font-medium">{m.batch_upload__results()}</h3>
      <div class="space-y-2">
        {#each uploadResults as result, index (result.file.name)}
          <UploadResult {result} {index} />
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Empty Columns Modal -->
{#if showEmptyColumnsModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-bold">Empty Property Columns Detected</h3>
      <div class="py-4">
        <p class="mb-4">The following property columns appear to be empty:</p>
        <ul class="mb-4 list-inside list-disc space-y-2">
          {#each emptyColumnsErrors as error}
            <li class="text-sm text-base-content/70">{error}</li>
          {/each}
        </ul>
        <p class="text-sm text-base-content/70">
          Would you like to edit the column mapping or skip these empty columns?
        </p>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost" onclick={handleEditMapping}>Edit</button>
        <button class="btn btn-primary" onclick={handleSkipEmptyColumns}>Skip</button>
      </div>
    </div>
  </div>
{/if}

<!-- Association Modal for CSV Import -->
<Association
  bind:isOpen={importCtx.state.showAssociationModal}
  resourceType={FirstClassResource.project}
  mode="select"
  onSelect={handleProjectSelectionWrapper} />
