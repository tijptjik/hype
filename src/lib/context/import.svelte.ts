// SVELTE
import { setContext, getContext } from 'svelte'
// TYPES
import type {
  FeatureCSVColumn,
  UserValidationResult,
  LayerValidationResult,
  Organisation,
  Project,
  FeatureImportStep,
  Property,
  Layer,
} from '$lib/client/services/import/types'
import type { LayerFormInput } from '$lib/db/zod/schema/layer.types'
import type { Id, Locale, LocaleKey } from '$lib/types'

export type ImportState = {
  isTypeSelected: boolean
  file: File | null
  headers: string[]
  data: string[][]
  columns: FeatureCSVColumn[]
  selectedOrganisation: Organisation | null
  selectedProject: Project | null
  selectedLocale: LocaleKey
  showAssociationModal: boolean
  currentStep: FeatureImportStep
  stats: { valid: number; invalid: number; truncated: number }
  userValidation: {
    isValidating: boolean
    progress: number
    total: number
    results: UserValidationResult[]
    fallbackUserId?: string
    showUserSelection: boolean
    showUserResolution: boolean
  }
  userResolution: {
    invalidValues: string[]
    resolutions: Map<string, { userId: string; userData?: unknown }>
  }
  layerValidation: {
    isValidating: boolean
    progress: number
    total: number
    results: LayerValidationResult[]
    fallbackLayerId?: string
    showLayerSelection: boolean
    showLayerResolution: boolean
    showLayerCreation: boolean
  }
  layerResolution: {
    invalidValues: string[]
    resolutions: Map<string, { layerId: string; layerData?: unknown }>
  }
  activeLayerCreation: string | null
  isCreatingLayer: boolean
  isSubmittingLayer: boolean
  layerForm: LayerFormInput['data'] | null
  availablePropertyKeys: string[]
  fetchedProperties: Property[]
  isFetchingProperties: boolean
  userSearchQuery: string
  userSearchResults: UserValidationResult[]
  resolutionSearchResults: Map<string, UserValidationResult[]>
  resolutionSearchQueries: Map<string, string>
  layerSearchQuery: string
  layerSearchResults: Layer[]
  allLayers: Layer[]
  selectedLayer: Layer | null
  layersLoaded: boolean
  layerResolutionSearchResults: Map<string, Layer[]>
  layerResolutionSearchQueries: Map<string, string>
  translation: {
    status: 'idle' | 'analyzing' | 'translating' | 'complete' | 'error'
    allTranslated: number
    missingTranslations: number
    translating: number
    notLinguistic: number
    totalRows: number
    totalTranslations: number
    completedTranslations: number
    currentBatch: number
    totalBatches: number
    error?: string
  }
  propertyReconciliation: {
    currentAction:
      | 'none'
      | 'freeform-creation'
      | 'translation-prompt'
      | 'data-enrichment'
      | 'value-matching'
      | 'range-validation'
      | 'categorical-creation'
    enrichedData: Map<
      string,
      {
        propertyId?: Id
        propertyValueId?: Id
        translatedValues?: Record<Locale, string>
        enrichedData?: Map<number, Record<Locale, string>>
        resolvedValues?: Record<string, Id | undefined>
      }
    >
    pendingProperties: string[]
    currentPropertyIndex: number
    translationChoices: Map<
      string,
      { mode: 'translate' | 'copy'; sourceLocale?: Locale }
    >
    isProcessing: boolean
  }
  rowEnrichedData: Map<number, Record<string, unknown>>
  featureResolution: {
    isProcessing: boolean
    currentIndex: number
    total: number
    results: unknown[]
    showPreview: boolean
    previewIndex: number
    ignoreMissingFeatureIds: boolean
  }
}

export class ImportCtx {
  state: ImportState = $state({
    isTypeSelected: false,
    file: null,
    headers: [],
    data: [], // Store the complete CSV data for validation
    columns: [],
    selectedOrganisation: null,
    selectedProject: null,
    selectedLocale: 'en',
    showAssociationModal: false,
    currentStep: 'column-mapping',
    stats: { valid: 0, invalid: 0, truncated: 0 },
    userValidation: {
      isValidating: false,
      progress: 0,
      total: 0,
      results: [],
      fallbackUserId: undefined,
      showUserSelection: false,
      showUserResolution: false,
    },
    userResolution: {
      invalidValues: [],
      resolutions: new Map(),
    },
    layerValidation: {
      isValidating: false,
      progress: 0,
      total: 0,
      results: [],
      fallbackLayerId: undefined,
      showLayerSelection: false,
      showLayerResolution: false,
      showLayerCreation: false,
    },
    layerResolution: {
      invalidValues: [],
      resolutions: new Map(),
    },
    activeLayerCreation: null as string | null,
    availablePropertyKeys: [],
    fetchedProperties: [],
    isFetchingProperties: false,
    userSearchQuery: '',
    userSearchResults: [],
    resolutionSearchResults: new Map(),
    resolutionSearchQueries: new Map(),
    layerSearchQuery: '',
    layerSearchResults: [],
    allLayers: [],
    selectedLayer: null,
    layersLoaded: false,
    layerResolutionSearchResults: new Map(),
    layerResolutionSearchQueries: new Map(),
    translation: {
      status: 'idle',
      allTranslated: 0,
      missingTranslations: 0,
      translating: 0,
      notLinguistic: 0,
      totalRows: 0,
      totalTranslations: 0,
      completedTranslations: 0,
      currentBatch: 0,
      totalBatches: 0,
      error: undefined,
    },
    // Layer FORM state
    isCreatingLayer: false,
    layerForm: null,
    isSubmittingLayer: false,
    // Property reconciliation state
    propertyReconciliation: {
      currentAction: 'none',
      enrichedData: new Map(),
      pendingProperties: [],
      currentPropertyIndex: 0,
      translationChoices: new Map(),
      isProcessing: false,
    },
    // Row enriched data for translations and other per-row data
    rowEnrichedData: new Map(),
    // Feature resolution state
    featureResolution: {
      isProcessing: false,
      currentIndex: 0,
      total: 0,
      results: [],
      showPreview: false,
      previewIndex: 0,
      ignoreMissingFeatureIds: false,
    },
  })

  // ═══════════════════════
  // STATE MUTATION & ACCESS
  // ═══════════════════════

  setFile(file: File) {
    this.state.file = file
  }

  getFile() {
    return this.state.file
  }

  setHeaders(headers: string[]) {
    this.state.headers = headers
  }

  getHeaders() {
    return this.state.headers
  }

  setData(data: string[][]) {
    this.state.data = data
  }

  getData() {
    return this.state.data
  }

  setColumns(columns: FeatureCSVColumn[]) {
    this.state.columns = columns
  }

  getColumns() {
    return this.state.columns
  }

  getColumnIndex(column: FeatureCSVColumn) {
    return this.state.columns.indexOf(column)
  }

  setStats(stats: { valid: number; invalid: number; truncated: number }) {
    this.state.stats = stats
  }

  getStats() {
    return this.state.stats
  }

  setUserValidation(userValidation: Partial<ImportState['userValidation']>) {
    this.state.userValidation = { ...this.state.userValidation, ...userValidation }
  }

  getUserValidation() {
    return this.state.userValidation
  }

  updateUserValidation(userValidation: {
    isValidating?: boolean
    progress?: number
    total?: number
    results?: UserValidationResult[]
    showUserSelection?: boolean
    showUserResolution?: boolean
  }) {
    this.state.userValidation = { ...this.state.userValidation, ...userValidation }
  }

  setUserResolution(userResolution: {
    invalidValues: string[]
    resolutions: Map<string, { userId: string; userData?: unknown }>
  }) {
    this.state.userResolution = userResolution
  }

  getUserResolution() {
    return this.state.userResolution
  }

  updateUserResolution(userResolution: {
    invalidValues?: string[]
    resolutions?: Map<string, { userId: string; userData?: unknown }>
  }) {
    this.state.userResolution = { ...this.state.userResolution, ...userResolution }
  }

  setLayerValidation(layerValidation: Partial<ImportState['layerValidation']>) {
    this.state.layerValidation = { ...this.state.layerValidation, ...layerValidation }
  }

  updateLayerValidation(updates: Partial<typeof this.state.layerValidation>) {
    this.state.layerValidation = { ...this.state.layerValidation, ...updates }
  }

  getLayerValidation() {
    return this.state.layerValidation
  }

  setLayerResolution(layerResolution: {
    invalidValues: string[]
    resolutions: Map<string, { layerId: string; layerData?: unknown }>
  }) {
    this.state.layerResolution = layerResolution
  }

  getLayerResolution() {
    return this.state.layerResolution
  }

  setActiveLayerCreation(activeLayerCreation: string | null) {
    this.state.activeLayerCreation = activeLayerCreation
  }

  getActiveLayerCreation() {
    return this.state.activeLayerCreation
  }

  updateLayerResolution(layerResolution: {
    invalidValues?: string[]
    resolutions?: Map<string, { layerId: string; layerData?: unknown }>
  }) {
    this.state.layerResolution = { ...this.state.layerResolution, ...layerResolution }
  }

  setShowAssociationModal(showAssociationModal: boolean) {
    this.state.showAssociationModal = showAssociationModal
  }

  getShowAssociationModal() {
    return this.state.showAssociationModal
  }

  setCurrentStep(currentStep: FeatureImportStep) {
    this.state.currentStep = currentStep
  }

  getCurrentStep() {
    return this.state.currentStep
  }

  setSelectedOrganisation(selectedOrganisation: Organisation | null) {
    this.state.selectedOrganisation = selectedOrganisation
  }

  getSelectedOrganisation() {
    return this.state.selectedOrganisation
  }

  setSelectedProject(selectedProject: Project | null) {
    this.state.selectedProject = selectedProject
  }

  getSelectedProject() {
    return this.state.selectedProject
  }

  setSelectedLocale(selectedLocale: LocaleKey) {
    this.state.selectedLocale = selectedLocale
  }

  getSelectedLocale() {
    return this.state.selectedLocale
  }

  setFetchedProperties(fetchedProperties: Property[]) {
    this.state.fetchedProperties = fetchedProperties
  }

  getFetchedProperties() {
    return this.state.fetchedProperties
  }

  setIsFetchingProperties(isFetchingProperties: boolean) {
    this.state.isFetchingProperties = isFetchingProperties
  }

  getIsFetchingProperties() {
    return this.state.isFetchingProperties
  }

  setIsTypeSelected(isTypeSelected: boolean) {
    this.state.isTypeSelected = isTypeSelected
  }

  getIsTypeSelected() {
    return this.state.isTypeSelected
  }

  setAvailablePropertyKeys(availablePropertyKeys: string[]) {
    this.state.availablePropertyKeys = availablePropertyKeys
  }

  getAvailablePropertyKeys() {
    return this.state.availablePropertyKeys
  }

  setUserSearchQuery(userSearchQuery: string) {
    this.state.userSearchQuery = userSearchQuery
  }

  getUserSearchQuery() {
    return this.state.userSearchQuery
  }

  setUserSearchResults(userSearchResults: UserValidationResult[]) {
    this.state.userSearchResults = userSearchResults
  }

  getUserSearchResults() {
    return this.state.userSearchResults
  }

  setResolutionSearchResults(
    resolutionSearchResults: Map<string, UserValidationResult[]>,
  ) {
    this.state.resolutionSearchResults = resolutionSearchResults
  }

  getResolutionSearchResults() {
    return this.state.resolutionSearchResults
  }

  setResolutionSearchQueries(resolutionSearchQueries: Map<string, string>) {
    this.state.resolutionSearchQueries = resolutionSearchQueries
  }

  getResolutionSearchQueries() {
    return this.state.resolutionSearchQueries
  }

  setLayerSearchQuery(layerSearchQuery: string) {
    this.state.layerSearchQuery = layerSearchQuery
  }

  getLayerSearchQuery() {
    return this.state.layerSearchQuery
  }

  setLayerSearchResults(layerSearchResults: Layer[]) {
    this.state.layerSearchResults = layerSearchResults
  }

  getLayerSearchResults() {
    return this.state.layerSearchResults
  }

  setAllLayers(allLayers: Layer[]) {
    this.state.allLayers = allLayers
  }

  getAllLayers() {
    return this.state.allLayers
  }

  setSelectedLayer(selectedLayer: Layer | null) {
    this.state.selectedLayer = selectedLayer
  }

  getSelectedLayer() {
    return this.state.selectedLayer
  }

  setLayersLoaded(layersLoaded: boolean) {
    this.state.layersLoaded = layersLoaded
  }

  getLayersLoaded() {
    return this.state.layersLoaded
  }

  setLayerResolutionSearchResults(layerResolutionSearchResults: Map<string, Layer[]>) {
    this.state.layerResolutionSearchResults = layerResolutionSearchResults
  }

  getLayerResolutionSearchResults() {
    return this.state.layerResolutionSearchResults
  }

  setLayerResolutionSearchQueries(layerResolutionSearchQueries: Map<string, string>) {
    this.state.layerResolutionSearchQueries = layerResolutionSearchQueries
  }

  getLayerResolutionSearchQueries() {
    return this.state.layerResolutionSearchQueries
  }

  setIsCreatingLayer(isCreatingLayer: boolean) {
    this.state.isCreatingLayer = isCreatingLayer
  }

  getIsCreatingLayer() {
    return this.state.isCreatingLayer
  }

  setLayerForm(layerForm: LayerFormInput['data'] | null) {
    this.state.layerForm = layerForm
  }

  getLayerForm() {
    return this.state.layerForm
  }

  setIsSubmittingLayer(isSubmittingLayer: boolean) {
    this.state.isSubmittingLayer = isSubmittingLayer
  }

  getIsSubmittingLayer() {
    return this.state.isSubmittingLayer
  }

  // Property reconciliation methods
  getPropertyReconciliation() {
    return this.state.propertyReconciliation
  }

  updatePropertyReconciliation(
    updates: Partial<typeof this.state.propertyReconciliation>,
  ) {
    this.state.propertyReconciliation = {
      ...this.state.propertyReconciliation,
      ...updates,
    }
  }

  setPropertyEnrichedData(
    key: string,
    data: {
      propertyId?: Id
      propertyValueId?: Id
      translatedValues?: Record<Locale, string>
    },
  ) {
    this.state.propertyReconciliation.enrichedData.set(key, data)
  }

  getPropertyEnrichedData(key: string) {
    return this.state.propertyReconciliation.enrichedData.get(key)
  }

  // Row enriched data methods
  setRowEnrichedData(rowIndex: number, data: Record<string, unknown>) {
    if (!this.state.rowEnrichedData) {
      this.state.rowEnrichedData = new Map()
    }
    this.state.rowEnrichedData.set(rowIndex, data)
  }

  getRowEnrichedData(rowIndex: number) {
    return this.state.rowEnrichedData?.get(rowIndex)
  }

  // Translation state methods
  getTranslation() {
    return this.state.translation
  }

  updateTranslation(updates: Partial<typeof this.state.translation>) {
    this.state.translation = {
      ...this.state.translation,
      ...updates,
    }
  }

  // Feature resolution methods
  getFeatureResolution() {
    return this.state.featureResolution
  }

  updateFeatureResolution(updates: Partial<typeof this.state.featureResolution>) {
    this.state.featureResolution = {
      ...this.state.featureResolution,
      ...updates,
    }
  }

  setFeatureResolutionResults(results: unknown[]) {
    this.state.featureResolution.results = results
  }

  updateFeatureResolutionResult(index: number, result: unknown) {
    this.state.featureResolution.results[index] = result
  }

  // ═══════════════════════
  // STATE MUTATION :: UTILS
  // ═══════════════════════

  // Helper function to reset CSV import state to initial values
  reset() {
    this.state.file = null
    this.state.headers = []
    this.state.columns = []
    this.state.selectedOrganisation = null
    this.state.selectedProject = null
    this.state.selectedLocale = 'en'
    this.state.showAssociationModal = false
    this.state.currentStep = 'column-mapping'
    this.state.stats = { valid: 0, invalid: 0, truncated: 0 }
    this.state.userValidation = {
      isValidating: false,
      progress: 0,
      total: 0,
      results: [],
      fallbackUserId: undefined,
      showUserSelection: false,
      showUserResolution: false,
    }
    this.state.userResolution = {
      invalidValues: [],
      resolutions: new Map(),
    }
    this.state.layerValidation = {
      isValidating: false,
      progress: 0,
      total: 0,
      results: [],
      fallbackLayerId: undefined,
      showLayerSelection: false,
      showLayerResolution: false,
      showLayerCreation: false,
    }
    this.state.layerResolution = {
      invalidValues: [],
      resolutions: new Map(),
    }
    this.state.activeLayerCreation = null

    // Reset other related state
    this.state.availablePropertyKeys = []
    this.state.fetchedProperties = []
    this.state.isFetchingProperties = false
    this.state.isTypeSelected = false
    this.state.userSearchQuery = ''
    this.state.userSearchResults = []
    this.state.resolutionSearchResults = new Map()
    this.state.resolutionSearchQueries = new Map()
    this.state.layerSearchQuery = ''
    this.state.layerSearchResults = []
    this.state.allLayers = []
    this.state.selectedLayer = null
    this.state.layersLoaded = false
    this.state.layerResolutionSearchResults = new Map()
    this.state.layerResolutionSearchQueries = new Map()
    this.state.translation = {
      status: 'idle',
      allTranslated: 0,
      missingTranslations: 0,
      translating: 0,
      notLinguistic: 0,
      totalRows: 0,
      totalTranslations: 0,
      completedTranslations: 0,
      currentBatch: 0,
      totalBatches: 0,
      error: undefined,
    }

    // Reset property reconciliation state
    this.state.propertyReconciliation = {
      currentAction: 'none',
      enrichedData: new Map(),
      pendingProperties: [],
      currentPropertyIndex: 0,
      translationChoices: new Map(),
      isProcessing: false,
    }

    // Reset feature resolution state
    this.state.featureResolution = {
      isProcessing: false,
      currentIndex: 0,
      total: 0,
      results: [],
      showPreview: false,
      previewIndex: 0,
      ignoreMissingFeatureIds: false,
    }
  }
}

export const IMPORT_CONTEXT_KEY = Symbol('importContext')

export const setImportCtx = () => setContext(IMPORT_CONTEXT_KEY, new ImportCtx())

export const getImportCtx = (): ImportCtx => getContext(IMPORT_CONTEXT_KEY)
