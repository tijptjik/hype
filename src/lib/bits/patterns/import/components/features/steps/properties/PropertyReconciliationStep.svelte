<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import PropertyCreationStep from './PropertyCreationStep.svelte'
import PropertyTranslationPrompt from './PropertyTranslationPrompt.svelte'
import PropertyDataEnrichment from './PropertyDataEnrichment.svelte'
import PropertyValueMatching from './PropertyValueMatching.svelte'
import PropertyRangeValidation from './PropertyRangeValidation.svelte'
// SERVICES
import { enrichFeaturesWithPropertyData } from '$lib/client/services/import/features/property'
// ENUMS
import { supportedLocaleKeys } from '$lib/enums'
// TYPES
import type {
  FeatureCSVColumn,
  FieldDiscriminator,
  Locale,
} from '$lib/client/services/import/types'

type Props = {
  autoAdvance?: boolean
  footerAction?: () => void
  footerActionLabel?: string
  footerActionDisabled?: boolean
  footerStatus?: string
}

let {
  autoAdvance = true,
  footerAction = $bindable(),
  footerActionLabel = $bindable(''),
  footerActionDisabled = $bindable(false),
  footerStatus = $bindable(''),
}: Props = $props()

const importCtx = getImportCtx()
const state = importCtx.state

function getFetchedPropertyByKey(key: string) {
  return importCtx.getFetchedProperties().find(property => property.key === key)
}

// Derive property columns that need processing
let propertyColumns = $derived.by(() => {
  const columns = state.columns.filter(
    col => col.modelType === 'Property' && col.field === 'value' && col.propertyKey,
  )
  return columns
})

// Group columns by actual property key for processing
// For NEW properties, use extractedPropertyKey; for existing, use propertyKey
let propertyGroups = $derived.by(() => {
  const groups = new Map<string, FeatureCSVColumn[]>()
  propertyColumns.forEach(col => {
    // Get the actual property key
    const actualKey =
      col.propertyKey === 'NEW' ? col.extractedPropertyKey : col.propertyKey
    if (actualKey) {
      if (!groups.has(actualKey)) {
        groups.set(actualKey, [])
      }
      groups.get(actualKey)?.push(col)
    }
  })
  return groups
})

// Categorize property groups by scenario
let scenarios = $derived.by(() => {
  const categorized = {
    scenario1: [] as string[], // locale defined, NEW, categorical
    scenario2: [] as string[], // locale NONE, NEW, categorical
    scenario3: [] as string[], // locale defined, MATCHED, categorical
    scenario4: [] as string[], // locale NONE, MATCHED, categorical
    scenario5: [] as string[], // locale defined, NEW, freeform
    scenario6: [] as string[], // locale NONE, NEW, freeform
    scenario7: [] as string[], // locale defined, MATCHED, freeform
    scenario8: [] as string[], // locale NONE, MATCHED, freeform
  }

  propertyGroups.forEach((columns, key) => {
    const firstCol = columns[0]
    const hasLocale = firstCol.locale && firstCol.locale !== 'None'
    const fetchedProperty = getFetchedPropertyByKey(key)
    const isNew = !fetchedProperty && firstCol.propertyKey === 'NEW'
    const propertyType = fetchedProperty?.type || firstCol.propertyType
    const isCategorical = propertyType === 'classifier'

    if (hasLocale && isNew && isCategorical) {
      categorized.scenario1.push(key)
    } else if (!hasLocale && isNew && isCategorical) {
      categorized.scenario2.push(key)
    } else if (hasLocale && !isNew && isCategorical) {
      categorized.scenario3.push(key)
    } else if (!hasLocale && !isNew && isCategorical) {
      categorized.scenario4.push(key)
    } else if (hasLocale && isNew && !isCategorical) {
      categorized.scenario5.push(key)
    } else if (!hasLocale && isNew && !isCategorical) {
      categorized.scenario6.push(key)
    } else if (hasLocale && !isNew && !isCategorical) {
      categorized.scenario7.push(key)
    } else if (!hasLocale && !isNew && !isCategorical) {
      categorized.scenario8.push(key)
    }
  })

  return categorized
})

// Processing order based on specification
let processingOrder = $derived.by(() => {
  return [
    // Scenario 8: No steps required, skip (excluded from processing)
    // Scenarios 5,6: Create new freeform properties (Action A)
    ...scenarios.scenario5,
    ...scenarios.scenario6,
    // Scenario 7: Translation prompt for existing freeform properties (Action B)
    ...scenarios.scenario7,
    // Scenario 3: Match values for existing categorical properties with locale (Action D)
    ...scenarios.scenario3,
    // Scenario 4: Match values for existing categorical properties without locale (Action D)
    ...scenarios.scenario4,
    // Scenario 1: Add new categorical properties and values (Action F)
    ...scenarios.scenario1,
    // Scenario 2: Add new categorical properties (toggle/range) (Action G)
    ...scenarios.scenario2,
  ]
})

// Initialize processing
onMount(() => {
  initializeProcessing()
})

function initializeProcessing() {
  const recon = state.propertyReconciliation

  // Existing freeform properties without locale-specific columns do not need a UI step,
  // but they still need resolved property IDs for feature submission.
  scenarios.scenario8.forEach(key => {
    if (recon.enrichedData.get(key)?.propertyId) return
    const matchedProperty = getFetchedPropertyByKey(key)
    if (!matchedProperty?.id) return

    importCtx.setPropertyEnrichedData(key, {
      propertyId: matchedProperty.id,
      propertyType:
        (matchedProperty.type as FieldDiscriminator | undefined) || 'specifier',
    })
  })

  const toProcess = processingOrder.filter(
    key => !hasCompletedPropertyAction(key, recon),
  )

  importCtx.updatePropertyReconciliation({
    pendingProperties: toProcess,
    currentPropertyIndex: 0,
    currentAction: 'none',
  })

  if (toProcess.length > 0) {
    processNextProperty()
  } else {
    try {
      enrichFeaturesWithPropertyData(importCtx)
    } catch (error) {
      console.error(
        'PropertyReconciliation: Error during property enrichment (no properties case):',
        error,
      )
    }

    if (autoAdvance) {
      // All done, move to next step
      importCtx.setCurrentStep('translation')
    }
  }
}

function hasCompletedPropertyAction(
  key: string,
  recon: typeof state.propertyReconciliation,
): boolean {
  const enrichedData = recon.enrichedData.get(key)
  const propertyId = enrichedData?.propertyId?.trim()
  if (!propertyId) return false

  return true
}

function processNextProperty() {
  const recon = state.propertyReconciliation
  const currentKey = recon.pendingProperties[recon.currentPropertyIndex]

  if (!currentKey) {
    // All properties processed - now enrich feature data with property information

    // Validate that all properties have valid IDs before proceeding
    const recon = importCtx.getPropertyReconciliation()
    const invalidProperties: string[] = []

    for (const [key, data] of recon.enrichedData.entries()) {
      if (!data.propertyId || data.propertyId.trim() === '') {
        invalidProperties.push(key)
        console.error(
          `PropertyReconciliation: Property "${key}" has invalid propertyId:`,
          data.propertyId,
        )
      }
    }

    if (invalidProperties.length > 0) {
      console.error(
        'PropertyReconciliation: FATAL ERROR - Some properties lack valid propertyId values:',
        invalidProperties,
      )
      console.error(
        'PropertyReconciliation: This will cause foreign key constraint errors during feature submission',
      )

      // Force re-processing of invalid properties
      const pendingProperties = importCtx.getPropertyReconciliation().pendingProperties
      const newPendingProperties = [...pendingProperties, ...invalidProperties]

      importCtx.updatePropertyReconciliation({
        pendingProperties: newPendingProperties,
        currentPropertyIndex: pendingProperties.length, // Start from the invalid properties
        currentAction: 'none',
      })

      processNextProperty()
      return // Don't proceed to next step
    }

    try {
      enrichFeaturesWithPropertyData(importCtx)
    } catch (error) {
      console.error('PropertyReconciliation: Error during property enrichment:', error)
    }

    if (autoAdvance) {
      importCtx.setCurrentStep('translation')
    }
    return
  }

  // Determine action based on scenario
  let action: typeof recon.currentAction = 'none'

  // Check if this is a formerly Scenario 8 property that was moved to processing due to missing propertyId
  const isInvalidScenario8 = scenarios.scenario8.includes(currentKey)

  if (isInvalidScenario8) {
    action = 'categorical-creation'
  } else if (
    scenarios.scenario5.includes(currentKey) ||
    scenarios.scenario6.includes(currentKey)
  ) {
    action = 'freeform-creation'
  } else if (scenarios.scenario7.includes(currentKey)) {
    // Only prompt when locale data is incomplete and the user needs to choose
    // whether missing values should be translated or copied.
    const columns = propertyGroups.get(currentKey) || []
    const hasCompleteLocales = hasCompleteLocaleSet(columns)

    // Check if we already have a translation choice
    const hasChoice = state.propertyReconciliation.translationChoices.has(currentKey)

    if (!hasCompleteLocales && !hasChoice) {
      action = 'translation-prompt'
    } else {
      action = 'data-enrichment'
    }
  } else if (scenarios.scenario3.includes(currentKey)) {
    // Check if existing property is a RangeField
    const existingProperty = importCtx
      .getFetchedProperties()
      .find(p => p.key === currentKey)
    if (existingProperty?.component === 'RangeField') {
      action = 'range-validation'
    } else {
      action = 'value-matching'
    }
  } else if (scenarios.scenario4.includes(currentKey)) {
    // Check if existing property is a RangeField
    const existingProperty = importCtx
      .getFetchedProperties()
      .find(p => p.key === currentKey)
    if (existingProperty?.component === 'RangeField') {
      action = 'range-validation'
    } else {
      action = 'value-matching'
    }
  } else if (
    scenarios.scenario1.includes(currentKey) ||
    scenarios.scenario2.includes(currentKey)
  ) {
    action = 'categorical-creation'
  }

  importCtx.updatePropertyReconciliation({ currentAction: action })
}

// Helper function to check if property has complete locale coverage for all rows.
function hasCompleteLocaleSet(columns: FeatureCSVColumn[]): boolean {
  const headers = importCtx.getHeaders()
  const data = importCtx.getData()
  const localeColumns = new Map<string, number>()

  columns.forEach(column => {
    if (!column.locale || column.locale === 'None') return
    localeColumns.set(column.locale, headers.indexOf(column.header))
  })

  if (localeColumns.size < supportedLocaleKeys.length) {
    return false
  }

  for (const row of data) {
    const hasAnyLocaleValue = Array.from(localeColumns.values()).some(
      columnIndex => columnIndex >= 0 && row[columnIndex]?.trim(),
    )

    if (!hasAnyLocaleValue) {
      continue
    }

    const hasAllLocaleValues = Array.from(localeColumns.values()).every(
      columnIndex => columnIndex >= 0 && row[columnIndex]?.trim(),
    )

    if (!hasAllLocaleValues) {
      return false
    }
  }

  return true
}

function onActionComplete() {
  const recon = state.propertyReconciliation
  const nextIndex = recon.currentPropertyIndex + 1

  importCtx.updatePropertyReconciliation({
    currentPropertyIndex: nextIndex,
    currentAction: 'none',
  })

  processNextProperty()
}

// Get current property data
let currentProperty = $derived.by(() => {
  const recon = state.propertyReconciliation
  const currentKey = recon.pendingProperties[recon.currentPropertyIndex]
  if (!currentKey) return null

  const property = {
    key: currentKey,
    columns: propertyGroups.get(currentKey) || [],
    scenario: getScenarioForKey(currentKey),
  }

  return property
})

$effect(() => {
  const recon = state.propertyReconciliation
  const total = recon.pendingProperties.length
  footerStatus = total > 0 ? `${recon.currentPropertyIndex + 1} / ${total}` : ''

  if (
    recon.currentAction !== 'freeform-creation' &&
    recon.currentAction !== 'categorical-creation' &&
    recon.currentAction !== 'translation-prompt' &&
    recon.currentAction !== 'data-enrichment' &&
    recon.currentAction !== 'range-validation'
  ) {
    resetFooterAction()
  }
})

function resetFooterAction(): void {
  untrack(() => {
    if (footerAction !== undefined) {
      footerAction = undefined
    }
    if (footerActionLabel !== '') {
      footerActionLabel = ''
    }
    if (footerActionDisabled) {
      footerActionDisabled = false
    }
  })
}

function getScenarioForKey(key: string): number {
  if (scenarios.scenario1.includes(key)) return 1
  if (scenarios.scenario2.includes(key)) return 2
  if (scenarios.scenario3.includes(key)) return 3
  if (scenarios.scenario4.includes(key)) return 4
  if (scenarios.scenario5.includes(key)) return 5
  if (scenarios.scenario6.includes(key)) return 6
  if (scenarios.scenario7.includes(key)) return 7
  if (scenarios.scenario8.includes(key)) return 8
  return 0
}
</script>

<div class="relative mx-2 flex min-h-full flex-col gap-5 py-4 sm:py-5 lg:py-6">
  {#if state.propertyReconciliation.isProcessing}
    <div class="flex min-h-56 items-center justify-center">
      <span class="loading loading-spinner loading-lg"></span>
      <span class="ml-3 text-lg">Processing...</span>
    </div>
  {:else if currentProperty}
    <div class="mx-auto w-full max-w-5xl">
      <div
        class="grid gap-3 rounded-3xl border border-info/25 bg-black/[0.45] p-4 shadow-[var(--shadow-mini)] backdrop-blur-xl md:grid-cols-[auto_minmax(0,1fr)] md:items-center"
      >
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl border border-info/25 bg-info/10 font-mono text-2xl font-black text-info"
        >
          S{currentProperty.scenario}
        </div>
        <div class="min-w-0 space-y-2">
          <div
            class="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-base-content/55"
          >
            Scenario {currentProperty.scenario}
          </div>
          <div class="flex flex-wrap gap-2">
            {#each currentProperty.columns as column}
              <span class="rounded-full  font-mono text-sm text-base-content">
                {column.header}
              </span>
            {/each}
          </div>
        </div>
      </div>
    </div>

    {#if state.propertyReconciliation.currentAction === 'freeform-creation'}
      <PropertyCreationStep
        property={currentProperty}
        {onActionComplete}
        bind:footerAction
        bind:footerActionLabel
        bind:footerActionDisabled
      />
    {:else if state.propertyReconciliation.currentAction === 'translation-prompt'}
      <PropertyTranslationPrompt
        property={currentProperty}
        {onActionComplete}
        bind:footerAction
        bind:footerActionLabel
        bind:footerActionDisabled
      />
    {:else if state.propertyReconciliation.currentAction === 'data-enrichment'}
      <PropertyDataEnrichment
        property={currentProperty}
        {onActionComplete}
        bind:footerAction
        bind:footerActionLabel
        bind:footerActionDisabled
      />
    {:else if state.propertyReconciliation.currentAction === 'value-matching'}
      <PropertyValueMatching property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'range-validation'}
      <PropertyRangeValidation
        property={currentProperty}
        {onActionComplete}
        bind:footerAction
        bind:footerActionLabel
        bind:footerActionDisabled
      />
    {:else if state.propertyReconciliation.currentAction === 'categorical-creation'}
      <PropertyCreationStep
        property={currentProperty}
        {onActionComplete}
        bind:footerAction
        bind:footerActionLabel
        bind:footerActionDisabled
      />
    {/if}
  {:else}
    <div class="p-8 text-center">
      <div class="mb-2 text-lg font-semibold text-success">
        {m.feature_import__properties_complete_title()}
      </div>
      <p class="text-base-content/70">
        {m.feature_import__properties_complete_description()}
      </p>
    </div>
  {/if}
</div>
