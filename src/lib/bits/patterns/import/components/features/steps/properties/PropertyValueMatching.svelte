<script lang="ts">
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// API
import {
  appendPropertyValues,
  getProperties,
  getPropertyValueAppendAccess,
} from '$lib/api/server/property.remote'
import { translateText } from '$lib/api/server/translation.remote'
// I18N
import { m, toLocaleKey } from '$lib/i18n'
// TYPES
import type {
  FeatureCSVColumn,
  Property,
  PropertyValueI18nDB,
  Locale,
  Id,
} from '$lib/client/services/import/types'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { LocaleKey } from '$lib/types'

type PropertyData = {
  key: string
  columns: FeatureCSVColumn[]
  scenario: number
}

type ValueMatchData = {
  value: string
  locale: Locale
  exists: boolean
  matchedPropertyValueId?: Id
  isIgnored?: boolean
  existingOptions: PropertyValueI18nDB[]
}

type PropertyValueAppendAccess = {
  allowed: boolean
  scope: 'hub' | 'organisation' | 'project'
}

type Props = {
  property: PropertyData
  onActionComplete: () => void
}

let { property, onActionComplete }: Props = $props()

const importCtx = getImportCtx()
const appCtx = getAppCtx()

// Get the existing property data
let existingProperty = $state<Property | null>(null)
let isLoading = $state(true)
let valueMatches = $state<ValueMatchData[]>([])
let initializedPropertyKey = $state('')
let valueAppendAccess = $state<PropertyValueAppendAccess | null>(null)

// Reactive effect to reload data when property changes
$effect(() => {
  if (initializedPropertyKey === property.key) return

  initializedPropertyKey = property.key
  isLoading = true
  valueMatches = []
  existingProperty = null
  valueAppendAccess = null

  loadExistingProperty().then(() => {
    analyzeValues()
  })
})

async function loadExistingProperty() {
  try {
    // Prefer the project-visible property set captured during column parsing/reconciliation.
    let found = importCtx
      .getFetchedProperties()
      .find((p: Property) => p.key === property.key)

    if (found) {
      existingProperty = found
      appCtx.addToCache(FirstClassResource.property, found.id, found)
      await loadValueAppendAccess(found.id)
      return
    }

    // Fall back to app cache.
    found = Array.from(appCtx.cache.property.values()).find(
      (p: Property) => p.key === property.key,
    )

    if (found) {
      existingProperty = found
      await loadValueAppendAccess(found.id)
    } else {
      // If not in cache, load through the guarded remote boundary.
      try {
        const result = await getProperties({
          conditions: { key: property.key },
          meta: { isAdminRequest: true, profile: 'admin' },
        })
        const properties = Array.isArray(result.data) ? result.data : []
        if (properties.length > 0) {
          found = properties[0] as Property
          existingProperty = found
          await loadValueAppendAccess(found.id)
          // Add to cache for future use
          if (found) {
            appCtx.addToCache(FirstClassResource.property, found.id, found)
          }
        } else {
          console.error('ValueMatching: Property not found:', property.key)
        }
      } catch (apiError) {
        console.error('ValueMatching: Error loading property:', apiError)
      }
    }

    if (!found) {
      console.error('ValueMatching: Property not found in cache or API:', property.key)
    }
  } catch (error) {
    console.error('ValueMatching: Error loading property:', error)
  } finally {
    isLoading = false
  }
}

async function loadValueAppendAccess(propertyId: string): Promise<void> {
  try {
    const result = await getPropertyValueAppendAccess({
      id: propertyId,
      meta: { isAdminRequest: true },
    })
    valueAppendAccess = result.data || null
  } catch (error) {
    console.error('ValueMatching: Error loading property value append access:', error)
    valueAppendAccess = null
  }
}

function analyzeValues() {
  if (!existingProperty) {
    return
  }

  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  // Get unique values from CSV for each locale
  const csvValues = new Map<Locale, Set<string>>()

  property.columns.forEach(col => {
    // Handle both localized columns and locale="None" columns
    const locale = col.locale && col.locale !== 'None' ? (col.locale as Locale) : 'en' // Default to 'en' for None
    const colIndex = headers.indexOf(col.header)

    if (colIndex !== -1) {
      if (!csvValues.has(locale)) {
        csvValues.set(locale, new Set())
      }

      data.forEach(row => {
        const cellValue = row[colIndex]
        if (cellValue?.trim()) {
          const trimmedValue = cellValue.trim()
          csvValues.get(locale)?.add(trimmedValue)
        }
      })
    } else {
      console.warn(`ValueMatching: Column "${col.header}" not found in headers`)
    }
  })

  // Create match data for each unique value per locale
  const matches: ValueMatchData[] = []

  // Check if this is a ToggleField - if so, handle differently
  if (existingProperty.component === 'ToggleField') {
    // For ToggleFields, validate that all values are truthy/falsy
    let allValidBooleans = true
    const invalidValues: string[] = []

    csvValues.forEach(values => {
      values.forEach(value => {
        const lowerValue = value.toLowerCase()
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
          allValidBooleans = false
          invalidValues.push(value)
        }
      })
    })

    if (allValidBooleans) {
      // For ToggleFields, we don't need property value mappings since they're just boolean
      // Store empty mapping but mark as completed
      handleAccept()
      return
    } else {
      console.error(
        'ValueMatching: Invalid boolean values found in ToggleField:',
        invalidValues,
      )
      // Could show error UI here
      return
    }
  }

  csvValues.forEach((values, locale) => {
    values.forEach(value => {
      // Check if this value exists in the existing property values
      const localeKey = toLocaleKey(locale)
      const existingValueI18n = existingProperty?.values
        ?.flatMap(pv => Object.values(pv.i18n || {}))
        .find(i18n => {
          const localeMatch = toLocaleKey(i18n.locale) === localeKey
          const valueMatch = i18n.value === value
          return localeMatch && valueMatch
        })

      // Get all existing values for this locale as options
      const existingOptions =
        existingProperty?.values
          ?.flatMap(pv => Object.values(pv.i18n || {}))
          .filter(i18n => toLocaleKey(i18n.locale) === localeKey) || []

      matches.push({
        value,
        locale,
        exists: !!existingValueI18n,
        matchedPropertyValueId: existingValueI18n?.propertyValueId,
        existingOptions,
      })
    })
  })

  valueMatches = matches

  // Check if all values match perfectly - if so, auto-complete
  const allValuesMatch = matches.every(match => match.exists)

  if (allValuesMatch) {
    // Auto-proceed after a short delay to show the matches
    setTimeout(() => {
      handleAccept()
    }, 1000)
  }
}

function updateMatch(index: number, propertyValueId: Id | 'NEW' | 'IGNORE') {
  if (propertyValueId === 'IGNORE') {
    valueMatches[index].matchedPropertyValueId = undefined
    valueMatches[index].exists = false
    valueMatches[index].isIgnored = true
  } else if (propertyValueId === 'NEW') {
    valueMatches[index].matchedPropertyValueId = undefined
    valueMatches[index].exists = false
    valueMatches[index].isIgnored = false
  } else {
    valueMatches[index].matchedPropertyValueId = propertyValueId
    valueMatches[index].exists = true
    valueMatches[index].isIgnored = false
  }
}

function canProceed(): boolean {
  if (cannotCreateNewValues()) return false

  return valueMatches.every(
    match => match.exists || match.matchedPropertyValueId === undefined,
  )
}

function hasNewValues(): boolean {
  return valueMatches.some(
    match =>
      !match.exists && match.matchedPropertyValueId === undefined && !match.isIgnored,
  )
}

function cannotCreateNewValues(): boolean {
  return (
    hasNewValues() &&
    valueAppendAccess !== null &&
    !valueAppendAccess.allowed &&
    valueAppendAccess.scope !== 'project'
  )
}

function getScopeLabel(scope: PropertyValueAppendAccess['scope']): string {
  if (scope === 'hub') return 'Global'
  if (scope === 'organisation') return 'Organisational'
  return 'Project'
}

async function handleAccept() {
  if (!canProceed()) return

  // Store the resolved property value IDs
  const resolvedData: Record<string, Id | null | undefined> = {}
  const propertyValueMapping: Record<string, string> = {}

  valueMatches.forEach(match => {
    const key = `${match.locale}:${match.value}`
    resolvedData[key] = match.isIgnored ? null : match.matchedPropertyValueId

    // Also create a simple value mapping for CSV value -> property value ID
    if (match.matchedPropertyValueId) {
      propertyValueMapping[match.value] = match.matchedPropertyValueId
    }
  })

  // Store in enriched data
  const enrichedData = {
    ...(importCtx.getPropertyEnrichedData(property.key) || {}),
    propertyId: existingProperty?.id,
    propertyValueMapping: propertyValueMapping,
    resolvedData: resolvedData,
  }

  importCtx.setPropertyEnrichedData(property.key, enrichedData)

  // Verify it was stored
  const storedData = importCtx.getPropertyEnrichedData(property.key)

  // Also check the full reconciliation state
  const reconciliation = importCtx.getPropertyReconciliation()

  if (hasNewValues()) {
    // Need to create new property values by updating the property
    try {
      if (!existingProperty) {
        throw new Error('Property not found during value update')
      }

      const propertyToUpdate = existingProperty

      // Get new values that need to be created
      const newValues = valueMatches.filter(
        match =>
          !match.exists &&
          match.matchedPropertyValueId === undefined &&
          !match.isIgnored,
      )

      // Auto-translate new values to all locales
      const translatedValues = new Map<string, Record<LocaleKey, string>>()

      // Translate each new value to zh-hans and zh-hant
      for (const match of newValues) {
        const baseLocale = match.locale.split(';')[0] as Locale
        const valueTranslations: Record<LocaleKey, string> = {
          en: match.value,
          zhHant: match.value,
          zhHans: match.value,
        } as Record<LocaleKey, string>

        // If source is English, translate to Chinese
        if (baseLocale === 'en') {
          try {
            // Translate to zh-hant
            const [zhHantValue] = await translateText({
              source: 'en',
              target: 'zhHant',
              texts: [match.value],
            })
            valueTranslations.zhHant = zhHantValue

            // Translate to zh-hans
            const [zhHansValue] = await translateText({
              source: 'en',
              target: 'zhHans',
              texts: [match.value],
            })
            valueTranslations.zhHans = zhHansValue
          } catch (error) {
            console.error('ValueMatching: Translation error:', error)
            // Continue with English value as fallback
          }
        }

        translatedValues.set(match.value, valueTranslations)
      }

      // Create property value records for the new values with translations
      const newPropertyValues = newValues.map((match, index) => {
        const valueId = crypto.randomUUID()
        const baseLocale = match.locale.split(';')[0] as Locale
        const translations = translatedValues.get(match.value) || {
          en: match.value,
          zhHans: match.value,
          zhHant: match.value,
        }

        return {
          id: valueId,
          propertyId: propertyToUpdate.id,
          rank: (propertyToUpdate.values?.length || 0) + index,
          i18n: {
            en: {
              propertyValueId: valueId,
              locale: 'en' as Locale,
              value: translations.en || match.value,
              valueGen: baseLocale !== 'en',
            },
            zhHant: {
              propertyValueId: valueId,
              locale: 'zh-hant' as Locale,
              value: translations.zhHant || match.value,
              valueGen: baseLocale === 'en' && translations.zhHant !== match.value,
            },
            zhHans: {
              propertyValueId: valueId,
              locale: 'zh-hans' as Locale,
              value: translations.zhHans || match.value,
              valueGen: baseLocale === 'en' && translations.zhHans !== match.value,
            },
          },
        }
      })

      const response = await appendPropertyValues({
        meta: {
          isAdminRequest: true,
        },
        data: {
          propertyId: propertyToUpdate.id,
          values: newPropertyValues,
        },
      })

      if (!response.data) {
        throw new Error('Property update did not return a property')
      }

      const updatedPropertyData: Property = response.data

      // Update cache
      appCtx.addToCache(
        FirstClassResource.property,
        updatedPropertyData.id,
        updatedPropertyData,
      )

      // Update the resolved data with the new property value IDs
      const updatedResolvedData: Record<string, Id | null | undefined> = {
        ...resolvedData,
      }
      const updatedPropertyValueMapping: Record<string, string> = {
        ...propertyValueMapping,
      }

      newValues.forEach(match => {
        // Find the newly created property value ID
        const baseLocale = toLocaleKey(match.locale)
        const newPropertyValue = updatedPropertyData.values?.find(pv => {
          const i18nValue = pv.i18n?.[baseLocale]
          return i18nValue && i18nValue.value === match.value
        })

        if (newPropertyValue) {
          const key = `${match.locale}:${match.value}`
          updatedResolvedData[key] = newPropertyValue.id
          updatedPropertyValueMapping[match.value] = newPropertyValue.id
        }
      })

      // Store the updated enriched data
      const enrichedData = {
        ...(importCtx.getPropertyEnrichedData(property.key) || {}),
        propertyId: existingProperty?.id,
        propertyValueMapping: updatedPropertyValueMapping,
        resolvedData: updatedResolvedData,
      }

      importCtx.setPropertyEnrichedData(property.key, enrichedData)

      onActionComplete()
    } catch (error) {
      console.error('ValueMatching: Error creating new property values:', error)
      // Still proceed but log the error
      onActionComplete()
    }
  } else {
    // All values matched, proceed to next step
    onActionComplete()
  }
}
</script>

{#if isLoading}
  <div class="flex items-center justify-center p-8">
    <span class="loading loading-spinner loading-lg"></span>
    <span class="ml-3">{m.loading_property_data()}</span>
  </div>
{:else if !existingProperty}
  <div class="alert alert-error">
    <div>
      <h4 class="font-semibold">{m.property_not_found()}</h4>
      <p>{m.property_not_found_description({ key: property.key })}</p>
    </div>
  </div>
{:else}
  <div class="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
    <section
      class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-3"
    >
      <div class="mb-5">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-warning"
        >
          {m.match_property_values({ key: property.key })}
        </div>
        <h3 class="mt-2 text-2xl font-black tracking-tight">
          {property.key}
        </h3>
      </div>

      <div
        class="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-2"
      >
        <div>
          <div
            class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
          >
            {m.property_id()}
          </div>
          <div class="mt-1 font-mono text-sm text-base-content/85">
            {existingProperty.id}
          </div>
        </div>
        <div>
          <div
            class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
          >
            {m.existing_values()}
          </div>
          <div class="mt-1 font-mono text-sm text-base-content/85">
            {existingProperty.values?.length || 0}
          </div>
        </div>
      </div>

      <div class="space-y-3">
        {#each valueMatches as match, index}
          <div
            class="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-[5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center"
          >
            <div
              class="justify-self-start rounded-full border border-info/25 bg-info/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-info"
            >
              {match.locale}
            </div>
            <div class="min-w-0">
              <div
                class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
              >
                {m.csv_value()}
              </div>
              <div class="mt-1 break-all font-mono text-sm text-base-content/85">
                {match.value}
              </div>
            </div>
            <div>
              <div
                class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
              >
                {m.exists_in_system()}
              </div>
              <div class="mt-1 text-sm">
                {#if match.exists}
                  <span class="text-success">✓ {m.auto_matched()}</span>
                {:else}
                  <span class="text-warning">• {m.new_value()}</span>
                {/if}
              </div>
            </div>
            <div>
              <div
                class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
              >
                {m.match_to()}
              </div>
              <div class="mt-1">
                {#if match.exists}
                  <span class="text-sm text-success">✓ {m.exists()}</span>
                {:else}
                  <select
                    class="select select-bordered select-sm w-full bg-black/30 font-mono text-sm"
                    onchange={event =>
                      updateMatch(
                        index,
                        (event.currentTarget as HTMLSelectElement).value as
                          | Id
                          | 'NEW'
                          | 'IGNORE',
                      )}
                  >
                    <option value="NEW">{m.create_new()}</option>
                    <option value="IGNORE">Ignore</option>
                    {#each match.existingOptions as option}
                      <option value={option.propertyValueId}>
                        {option.value}
                      </option>
                    {/each}
                  </select>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      {#if hasNewValues()}
        <div class="mt-4 rounded-2xl border border-warning/25 bg-warning/10 p-4">
          <h4 class="font-semibold">{m.new_values_detected()}</h4>
          <p class="mt-1 text-sm text-base-content/75">
            {m.new_values_will_be_created()}
          </p>
        </div>
      {/if}

      {#if cannotCreateNewValues() && valueAppendAccess}
        <div class="mt-4 rounded-2xl border border-error/30 bg-error/15 p-4">
          <h4 class="font-semibold text-error">Cannot add new values</h4>
          <p class="mt-1 text-sm text-base-content/80">
            This property is specified at the {getScopeLabel(valueAppendAccess.scope)}
            level, and you do not have permission to add new values.
          </p>
          <p class="mt-2 text-sm text-base-content/80">
            If you still want to import these values, create a new property in step 1.
          </p>
        </div>
      {/if}

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          class="btn btn-primary rounded-full px-6"
          onclick={handleAccept}
          disabled={!canProceed()}
        >
          {m.accept()}
        </button>
      </div>
    </section>

    <section
      class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-2"
    >
      <div class="mb-5">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-info"
        >
          Scenario {property.scenario} / {property.columns[0]?.header}
        </div>
        <h3 class="mt-2 text-xl font-black tracking-tight">
          {m.existing_property_info()}
        </h3>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4"
      >
        <div class="space-y-4">
          {#each existingProperty.values || [] as propertyValue}
            <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <div class="font-mono text-sm text-base-content/85">
                {propertyValue.i18n?.en?.value ||
                  propertyValue.value ||
                  propertyValue.id}
              </div>
              <div class="mt-2 space-y-1">
                {#each Object.values(propertyValue.i18n || {}) as translation}
                  <div class="flex items-center gap-2 text-sm">
                    <span
                      class="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-base-content/60"
                    >
                      {translation.locale}
                    </span>
                    <span class="break-all font-mono text-base-content/85">
                      {translation.value}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </div>
{/if}
