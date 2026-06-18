<script lang="ts">
// SVELTE
import { goto } from '$app/navigation'
import { fade } from 'svelte/transition'
// CONTEXT
import type { AppCtx } from '$lib/context/app.svelte'
import type { ImportCtx } from '$lib/context/import.svelte'
// SERVICES
import {
  handleProjectSelection,
  getHeaderProps,
  getStepIndex,
  handleCSVDropEvent,
  getFeatureImportFooterProps,
  getFeatureImportHeaderStats,
  getFeatureImportHeaderProgressValue,
  markEmptyPropertyColumnsAsSkip,
  validateFeatureImportTitleColumns,
  validateFeatureImportLocationData,
  enrichFeatureImportBooleanFields,
  type FeatureResolutionStatusCounts,
  type GeoLookupStatusCounts,
} from '$lib/client/services/import/features'
import {
  setAllMissingProvidedFeatureIdRows,
  type FeatureResolutionData,
} from '$lib/client/services/import/features/resolution'
import {
  canCompleteUserResolution,
  validateUsers,
  startUserResolution,
  enrichFeaturesWithUserData,
} from '$lib/client/services/import/users'
import {
  fetchAvailablePropertyKeys,
  validatePropertyColumns,
} from '$lib/client/services/import/features/property'
import {
  preloadLayers,
  canCompleteLayerResolution,
  validateLayers,
  enrichFeaturesWithLayerData,
} from '$lib/client/services/import/features/layer'
// BITS COMPONENTS
import { Switch } from '$lib/bits/custom/switch'
// PATTERN COMPONENTS
import * as ImportPrimitive from './components'
// COMPONENT TYPES
import type {
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '$lib/bits/patterns/forms/formParentSection'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Project, Organisation, Resource } from '$lib/client/services/import/types'

type Props = {
  appCtx: AppCtx
  importCtx: ImportCtx
  pendingDrop: {
    acceptedFiles: File[]
    fileRejections?: unknown[]
    type: 'features' | 'users' | 'events' | 'images'
    event?: Event
  } | null
  onCancel: () => void
}

let { appCtx, importCtx, pendingDrop, onCancel }: Props = $props()

let lastProcessedDrop = $state<Props['pendingDrop']>(null)
let propertyBackInspection = $state(false)

// STATE :: FLOW ORCHESTRATION

const currentStep = $derived(importCtx.getCurrentStep())
const headerContent = $derived(getHeaderProps(currentStep))
const stepIndex = $derived(getStepIndex(currentStep))
const totalSteps = 8
const dataLabel = $derived(
  `${importCtx.getHeaders().length} COLS / ${importCtx.getData().length} ROWS`,
)

// STATE :: FLOW ORCHESTRATION :: STEPS

// STEP 1 :: COLUMN MAPPING
let showEmptyColumnsModal = $state(false)
let emptyColumnsErrors = $state<string[]>([])
// STEP 4 :: PROPERTY MATCHING
let propertyAction: (() => void) | undefined = $state()
let propertyActionLabel = $state('')
let propertyActionDisabled = $state(false)
let propertyFooterStatus = $state('')
// STEP 5 :: TRANSLATION
let translationStartProcessing: (() => void) | undefined = $state()
let translationFooterStatus = $state('')
let translationIsProcessing = $state(false)
// STEP 6 :: GEO LOOKUP
let geoLookupStartProcessing: (() => void) | undefined = $state()
let geoLookupClearCache: (() => void) | undefined = $state()
let geoLookupPauseProcessing: (() => void) | undefined = $state()
let geoLookupFooterStatus = $state('')
let geoLookupIsBusy = $state(false)
let geoLookupIsPaused = $state(false)
let geoLookupStatusCounts: GeoLookupStatusCounts | undefined = $state()
// STEP 7 :: FEATURE RESOLUTION
let featureResolutionStartProcessing: (() => void) | undefined = $state()
let featureResolutionDownloadResults: (() => void) | undefined = $state()
let featureResolutionCanDownloadResults = $state(false)
let featureResolutionStatusCounts: FeatureResolutionStatusCounts | undefined = $state()
let featureResolutionIsProcessing = $state(false)
let featureResolutionFooterStatus = $state('')

// STATE :: RESOURCE HIERACHY

const selectableProjects = $derived(
  appCtx.getFilteredResource<Project>(FirstClassResource.project),
)
const selectableOrganisations = $derived(
  appCtx.getFilteredResource<Organisation>(FirstClassResource.organisation),
)
const selectedParentOrganisation = $derived(
  (importCtx.getSelectedOrganisation() as ParentSectionOrganisationItem | null) ?? null,
)
const selectedParentProject = $derived(
  (importCtx.getSelectedProject() as ParentSectionProjectItem | null) ?? null,
)

// STATE :: STATS

const headerStats = $derived.by(() =>
  getFeatureImportHeaderStats({
    currentStep,
    stats: importCtx.getStats(),
    userValidation: importCtx.getUserValidation(),
    layerValidation: importCtx.getLayerValidation(),
    translation: importCtx.getTranslation(),
    geoLookupStatusCounts,
    featureResolutionStatusCounts,
  }),
)

const headerProgressValue = $derived.by(() =>
  getFeatureImportHeaderProgressValue({
    currentStep,
    userValidation: importCtx.getUserValidation(),
    layerValidation: importCtx.getLayerValidation(),
    translation: importCtx.getTranslation(),
    geoLookupStatusCounts,
    featureResolutionStatusCounts,
  }),
)
const featureResolutionResults = $derived(
  importCtx.getFeatureResolution().results as FeatureResolutionData[],
)
const featureResolutionIgnoreMissingIds = $derived(
  importCtx.getFeatureResolution().ignoreMissingFeatureIds,
)

// HANDLERS

// STEP 1 :: COLUMN MAPPING

async function handleFeaturesDropWrapper(
  event: NonNullable<Props['pendingDrop']>,
): Promise<void> {
  propertyBackInspection = false
  await handleCSVDropEvent(importCtx, event)
  importCtx.setShowAssociationModal(false)
  importCtx.setIsTypeSelected(true)
  importCtx.setCurrentStep('column-mapping')
}
// Empty columns modal handlers
function handleEditMapping(): void {
  showEmptyColumnsModal = false
  emptyColumnsErrors = []
  // Stay on column-mapping step to allow editing
}

function handleSkipEmptyColumns(): void {
  showEmptyColumnsModal = false
  emptyColumnsErrors = []
  // Mark empty property columns as SKIP and continue
  markEmptyPropertyColumnsAsSkip(importCtx)
  void validateUsersWrapper()
}

async function handleProjectSelectionWrapper(selectedProject: Resource): Promise<void> {
  await handleProjectSelection(
    selectedProject as Project,
    importCtx,
    appCtx,
    () => fetchAvailablePropertyKeys(importCtx),
    (selected: boolean) => {
      importCtx.setIsTypeSelected(selected)
    },
  )
  importCtx.state.showAssociationModal = false
}

async function onSearchParentOrganisations(
  query: string,
): Promise<ParentSectionOrganisationItem[]> {
  const normalizedQuery = query.trim().toLowerCase()
  const results = selectableOrganisations.filter(organisation => {
    if (!normalizedQuery) return true
    return [organisation.code, organisation.i18n?.en?.name]
      .filter(Boolean)
      .some(value => value?.toLowerCase().includes(normalizedQuery))
  })
  return results as unknown as ParentSectionOrganisationItem[]
}

function onReplaceParentOrganisation(
  organisation: ParentSectionOrganisationItem,
): void {
  importCtx.setSelectedOrganisation(organisation as Organisation)

  const selectedProject = importCtx.getSelectedProject()
  if (selectedProject?.organisationId !== organisation.id) {
    importCtx.setSelectedProject(null)
  }
}

function onRemoveParentOrganisation(): void {
  importCtx.setSelectedOrganisation(null)
  importCtx.setSelectedProject(null)
}

async function onSearchParentProjects(
  query: string,
): Promise<ParentSectionProjectItem[]> {
  const normalizedQuery = query.trim().toLowerCase()
  const organisationId = importCtx.getSelectedOrganisation()?.id ?? null

  const results = selectableProjects
    .filter(project => !organisationId || project.organisationId === organisationId)
    .filter(project => {
      if (!normalizedQuery) return true
      return [project.code, project.i18n?.en?.name]
        .filter(Boolean)
        .some(value => value?.toLowerCase().includes(normalizedQuery))
    })
  return results as unknown as ParentSectionProjectItem[]
}

async function onReplaceParentProject(
  project: ParentSectionProjectItem,
): Promise<void> {
  await handleProjectSelectionWrapper(project as Project)
}

function onRemoveParentProject(): void {
  importCtx.setSelectedProject(null)
}

// STEP 2 :: USER MATCHING

// Wrapper functions for service integration
async function validateUsersWrapper(): Promise<void> {
  importCtx.setCurrentStep('user-matching')

  const userColumns = importCtx.getColumns().filter(col => col.modelType === 'User')

  if (userColumns.length === 0) {
    const userValidation = importCtx.getUserValidation()
    userValidation.showUserSelection = true
    importCtx.setUserValidation(userValidation)
    return
  }

  const userValidation = importCtx.getUserValidation()
  userValidation.isValidating = true
  userValidation.progress = 0
  userValidation.results = []
  importCtx.setUserValidation(userValidation)

  try {
    const { invalidCount, results } = await validateUsers(
      userColumns,
      importCtx.getData(),
      importCtx.getHeaders(),
      (progress, total) => {
        const nextUserValidation = importCtx.getUserValidation()
        nextUserValidation.progress = progress
        nextUserValidation.total = total
        importCtx.setUserValidation(nextUserValidation)
      },
      results => {
        const nextUserValidation = importCtx.getUserValidation()
        nextUserValidation.results = results
        importCtx.setUserValidation(nextUserValidation)
      },
    )

    const finalUserValidation = importCtx.getUserValidation()
    finalUserValidation.isValidating = false
    importCtx.setUserValidation(finalUserValidation)

    if (invalidCount === 0) {
      // Enrich feature data with validated user IDs
      enrichFeaturesWithUserData(importCtx, results)
      await validateLayersWrapper()
    } else {
      const resolution = startUserResolution(results)
      importCtx.setUserResolution({
        invalidValues: resolution.invalidValues,
        resolutions: resolution.resolutions,
      })
    }
  } catch (error) {
    console.error('Error during user validation:', error)
    const finalUserValidation = importCtx.getUserValidation()
    finalUserValidation.isValidating = false
    importCtx.setUserValidation(finalUserValidation)
  }
}

function startUserResolutionWrapper(): void {
  const resolution = startUserResolution(importCtx.getUserValidation().results)
  importCtx.setUserResolution({
    invalidValues: resolution.invalidValues,
    resolutions: resolution.resolutions,
  })
  const userValidation = importCtx.getUserValidation()
  userValidation.showUserResolution = true
  importCtx.setUserValidation(userValidation)
}

function canCompleteUserResolutionWrapper(): boolean {
  const userResolution = importCtx.getUserResolution()
  return canCompleteUserResolution(
    userResolution.invalidValues,
    userResolution.resolutions,
  )
}

// STEP 3 :: LAYER MATCHING

// Wrapper functions for service integration
async function preloadLayersWrapper(): Promise<void> {
  const selectedProject = importCtx.getSelectedProject()
  if (!selectedProject) {
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
    return
  }

  try {
    const layers = await preloadLayers(selectedProject.id)
    importCtx.setAllLayers(layers)
    importCtx.setLayersLoaded(true)
    importCtx.setLayerSearchResults(layers)
  } catch (error) {
    console.error('Error preloading layers:', error)
    importCtx.setAllLayers([])
    importCtx.setLayersLoaded(false)
  }
}

function canCompleteLayerResolutionWrapper(): boolean {
  const layerResolution = importCtx.getLayerResolution()
  return canCompleteLayerResolution(
    layerResolution.invalidValues,
    layerResolution.resolutions,
  )
}

async function validateLayersWrapper(): Promise<void> {
  importCtx.setCurrentStep('layer-matching')

  // Preload layers for the project
  if (!importCtx.getLayersLoaded()) {
    await preloadLayersWrapper()
  }

  const layerColumns = importCtx.getColumns().filter(col => col.modelType === 'Layer')

  // If no layer columns, show layer selection modal
  if (layerColumns.length === 0) {
    const layerValidation = importCtx.getLayerValidation()
    layerValidation.showLayerSelection = true
    importCtx.setLayerValidation(layerValidation)
    return
  }

  const layerValidation = importCtx.getLayerValidation()
  layerValidation.isValidating = true
  layerValidation.progress = 0
  layerValidation.results = []
  importCtx.setLayerValidation(layerValidation)

  const selectedProject = importCtx.getSelectedProject()
  if (!selectedProject) return

  const { invalidCount, results } = await validateLayers(
    layerColumns,
    importCtx.getData(),
    importCtx.getHeaders(),
    selectedProject.id,
    importCtx.getSelectedLocale() || 'en',
    (progress, total) => {
      const nextLayerValidation = importCtx.getLayerValidation()
      nextLayerValidation.progress = progress
      nextLayerValidation.total = total
      importCtx.setLayerValidation(nextLayerValidation)
    },
    results => {
      const nextLayerValidation = importCtx.getLayerValidation()
      nextLayerValidation.results = results
      importCtx.setLayerValidation(nextLayerValidation)
    },
  )

  const finalLayerValidation = importCtx.getLayerValidation()
  finalLayerValidation.isValidating = false
  importCtx.setLayerValidation(finalLayerValidation)

  if (invalidCount === 0) {
    // Enrich feature data with validated layer IDs
    enrichFeaturesWithLayerData(importCtx, results)
    importCtx.setCurrentStep('property-matching')
  } else {
    // Prepare layer resolution data but don't automatically show the resolution interface
    // User needs to click "Resolve Invalid Layers" button to enter resolution mode
    importCtx.setLayerResolution({
      invalidValues: results
        .filter(result => !result.isValid)
        .map(result => result.value),
      resolutions: new Map(),
    })
  }
}

// STEP ALL

// Footer button handlers
function handleCancel(): void {
  propertyBackInspection = false
  importCtx.reset()
  onCancel()
}

function handleBack(): void {
  const currentStep = importCtx.getCurrentStep()

  if (currentStep === 'user-matching') {
    importCtx.setCurrentStep('column-mapping')
    importCtx.updateUserValidation({
      showUserSelection: false,
      showUserResolution: false,
    })
  } else if (currentStep === 'layer-matching') {
    importCtx.setCurrentStep('user-matching')
    importCtx.updateLayerValidation({
      showLayerSelection: false,
      showLayerResolution: false,
      showLayerCreation: false,
    })
  } else if (currentStep === 'property-matching') {
    importCtx.setCurrentStep('layer-matching')
  } else if (currentStep === 'translation') {
    propertyBackInspection = true
    importCtx.setCurrentStep('property-matching')
  } else if (currentStep === 'geo-lookup') {
    importCtx.setCurrentStep('translation')
  } else if (currentStep === 'feature-resolution') {
    importCtx.setCurrentStep('geo-lookup')
  } else if (currentStep === 'finished') {
    importCtx.setCurrentStep('feature-resolution')
  }
}

function handleContinue(): void {
  const currentStep = importCtx.getCurrentStep()

  if (currentStep === 'column-mapping') {
    if (!importCtx.getSelectedProject()) {
      alert(
        'Select a project before continuing. All imported layers will be associated with that project.',
      )
      return
    }

    // Validate property columns
    const propertyValidation = validatePropertyColumns(importCtx)
    if (!propertyValidation.isValid) {
      emptyColumnsErrors = propertyValidation.errors
      showEmptyColumnsModal = true
      return
    }

    // Validate title columns
    const titleValidation = validateFeatureImportTitleColumns(importCtx)
    if (!titleValidation.isValid) {
      alert(
        'Title validation failed:\n\n' +
          titleValidation.errors.join('\n\n') +
          '\n\nPlease ensure at least one title column has non-empty values for all rows.',
      )
      return
    }

    // Validate location data
    const locationValidation = validateFeatureImportLocationData(importCtx)
    if (!locationValidation.isValid) {
      alert(
        'Location validation failed:\n\n' +
          locationValidation.errors.join('\n\n') +
          '\n\nPlease ensure each row has either address data OR coordinate data.',
      )
      return
    }

    // Enrich boolean fields before proceeding
    enrichFeatureImportBooleanFields(importCtx)

    void validateUsersWrapper()
  } else if (currentStep === 'user-matching') {
    if (importCtx.getUserValidation().showUserSelection) {
      enrichFeaturesWithUserData(importCtx, [])
      void validateLayersWrapper()
    } else if (importCtx.getUserValidation().showUserResolution) {
      enrichFeaturesWithUserData(importCtx, importCtx.getUserValidation().results)
      void validateLayersWrapper()
    } else {
      // All users validated
      void validateLayersWrapper()
    }
  } else if (currentStep === 'layer-matching') {
    propertyBackInspection = false
    if (importCtx.getLayerValidation().showLayerSelection) {
      enrichFeaturesWithLayerData(importCtx, [])
      importCtx.setCurrentStep('property-matching')
    } else if (importCtx.getLayerValidation().showLayerResolution) {
      enrichFeaturesWithLayerData(importCtx, importCtx.getLayerValidation().results)
      importCtx.setCurrentStep('property-matching')
    } else {
      // All layers validated
      importCtx.setCurrentStep('property-matching')
    }
  } else if (currentStep === 'property-matching') {
    propertyBackInspection = false
    importCtx.setCurrentStep('translation')
  } else if (currentStep === 'feature-resolution') {
    importCtx.setCurrentStep('finished')
  } else if (currentStep === 'translation') {
    importCtx.setCurrentStep('geo-lookup')
  }
}

function handleResolve(): void {
  const currentStep = importCtx.getCurrentStep()

  if (currentStep === 'user-matching') {
    startUserResolutionWrapper()
  } else if (currentStep === 'layer-matching') {
    importCtx.updateLayerValidation({ showLayerResolution: true })
  }
}

function handleFeatureResolutionUpdatePolicy(checked: boolean): void {
  importCtx.updateFeatureResolution({ ignoreMissingFeatureIds: checked })
  setAllMissingProvidedFeatureIdRows(importCtx, featureResolutionResults, checked)
}

async function handleCloseImportFlow(): Promise<void> {
  importCtx.reset()
  onCancel()
  await goto('/admin/import')
}

// COMPONENTS :: PROPS

const footerProps = $derived.by(() =>
  getFeatureImportFooterProps({
    currentStep,
    stepIndex,
    totalSteps,
    selectedProject: importCtx.getSelectedProject(),
    userValidation: importCtx.getUserValidation(),
    userResolution: importCtx.getUserResolution(),
    layerValidation: importCtx.getLayerValidation(),
    layerResolution: importCtx.getLayerResolution(),
    translation: importCtx.getTranslation(),
    translationStartProcessing,
    translationIsProcessing,
    translationFooterStatus,
    columns: importCtx.getColumns(),
    geoLookupClearCache,
    geoLookupPauseProcessing,
    geoLookupIsPaused,
    geoLookupIsBusy,
    geoLookupStartProcessing,
    geoLookupFooterStatus,
    geoLookupStatusCounts,
    featureResolutionStatusCounts,
    featureResolutionIsProcessing,
    featureResolutionStartProcessing,
    featureResolutionFooterStatus,
    propertyCanContinue: propertyBackInspection,
    propertyAction,
    propertyActionLabel,
    propertyActionDisabled,
    propertyFooterStatus,
    canCompleteUserResolution: canCompleteUserResolutionWrapper(),
    canCompleteLayerResolution: canCompleteLayerResolutionWrapper(),
    onCancel: handleCancel,
    onBack: handleBack,
    onContinue: handleContinue,
    onResolve: handleResolve,
    onCloseImportFlow: handleCloseImportFlow,
  }),
)

// EFFECTS

$effect(() => {
  if (!pendingDrop || pendingDrop === lastProcessedDrop) return

  lastProcessedDrop = pendingDrop
  void handleFeaturesDropWrapper(pendingDrop)
})
</script>

{#snippet featureResolutionStatsAction()}
  <div class="flex items-center gap-4">
    <div
      class="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-warning"
    >
      Update Policy
    </div>
    <Switch
      checked={featureResolutionIgnoreMissingIds}
      onCheckedChange={checked => handleFeatureResolutionUpdatePolicy(checked === true)}
      color="warning"
      leftText="Select"
      rightText="All"
      size="sm"
    />
  </div>
{/snippet}

<div class="min-h-0 flex-1" in:fade={{ duration: 300 }}>
  <ImportPrimitive.Root>
    <ImportPrimitive.Header
      title={headerContent.title}
      subtitle={headerContent.subtitle}
      {dataLabel}
      stats={headerStats}
      statsAction={currentStep === 'feature-resolution'
        ? featureResolutionStatsAction
        : undefined}
      progressValue={headerProgressValue}
    />

    <ImportPrimitive.Body>
      <ImportPrimitive.ImportStep
        overflow={currentStep === 'feature-resolution' || currentStep === 'finished'
          ? 'hidden'
          : 'auto'}
      >
        {#if currentStep === 'column-mapping'}
          <ImportPrimitive.ColumnMappingStep
            {importCtx}
            {selectedParentOrganisation}
            {selectedParentProject}
            {onSearchParentOrganisations}
            {onReplaceParentOrganisation}
            {onRemoveParentOrganisation}
            {onSearchParentProjects}
            {onReplaceParentProject}
            {onRemoveParentProject}
          />
        {:else if currentStep === 'user-matching'}
          <ImportPrimitive.UserMatchingStep {importCtx} />
        {:else if currentStep === 'layer-matching'}
          <ImportPrimitive.LayerMatchingStep {importCtx} />
        {:else if currentStep === 'property-matching'}
          <ImportPrimitive.PropertyReconciliation
            autoAdvance={!propertyBackInspection}
            bind:footerAction={propertyAction}
            bind:footerActionLabel={propertyActionLabel}
            bind:footerActionDisabled={propertyActionDisabled}
            bind:footerStatus={propertyFooterStatus}
          />
        {:else if currentStep === 'translation'}
          <ImportPrimitive.TranslationStep
            {importCtx}
            bind:startProcessing={translationStartProcessing}
            bind:footerStatus={translationFooterStatus}
            bind:isProcessing={translationIsProcessing}
          />
        {:else if currentStep === 'geo-lookup'}
          <ImportPrimitive.GeoLookupStep
            bind:startProcessing={geoLookupStartProcessing}
            bind:clearCacheAction={geoLookupClearCache}
            bind:pauseAction={geoLookupPauseProcessing}
            bind:footerStatus={geoLookupFooterStatus}
            bind:isBusy={geoLookupIsBusy}
            bind:isPaused={geoLookupIsPaused}
            bind:statusCounts={geoLookupStatusCounts}
          />
        {:else if currentStep === 'feature-resolution'}
          <ImportPrimitive.FeatureResolutionStep
            bind:startProcessing={featureResolutionStartProcessing}
            bind:downloadResultsAction={featureResolutionDownloadResults}
            bind:canDownloadResults={featureResolutionCanDownloadResults}
            bind:statusCounts={featureResolutionStatusCounts}
            bind:isProcessing={featureResolutionIsProcessing}
            bind:footerStatus={featureResolutionFooterStatus}
          />
        {:else if currentStep === 'finished'}
          <ImportPrimitive.FinishedStep
            canDownloadResults={featureResolutionCanDownloadResults}
            downloadResultsAction={featureResolutionDownloadResults}
          />
        {/if}
      </ImportPrimitive.ImportStep>
    </ImportPrimitive.Body>

    <ImportPrimitive.Footer {...footerProps} />
  </ImportPrimitive.Root>
</div>

{#if showEmptyColumnsModal}
  <ImportPrimitive.EmptyColumnsModal
    errors={emptyColumnsErrors}
    onEdit={handleEditMapping}
    onSkip={handleSkipEmptyColumns}
  />
{/if}
