<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// API
import { getProperties } from '$lib/api/server/property.remote'
// I18N
import { m } from '$lib/i18n'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type {
  FeatureCSVColumn,
  Locale,
  Property,
} from '$lib/client/services/import/types'

type PropertyData = {
  key: string
  columns: FeatureCSVColumn[]
  scenario: number
}

type RangeIssue = {
  value: string
  numericValue: number
  reason: 'non-numeric' | 'below-min' | 'above-max'
}

type ValidationResult = {
  isValid: boolean
  issues: RangeIssue[]
  currentRange: {
    min: number | null
    max: number | null
  }
  csvRange: {
    min: number | null
    max: number | null
  }
}

type Props = {
  property: PropertyData
  onActionComplete: () => void
  footerAction?: () => void
  footerActionLabel?: string
  footerActionDisabled?: boolean
}

const DROP_VALUE = '__DROP__'

let {
  property,
  onActionComplete,
  footerAction = $bindable(),
  footerActionLabel = $bindable(''),
  footerActionDisabled = $bindable(false),
}: Props = $props()

const importCtx = getImportCtx()
const appCtx = getAppCtx()

let existingProperty = $state<Property | null>(null)
let validation = $state<ValidationResult | null>(null)
let isLoading = $state(true)
let hasValidated = $state(false)
let isToggleField = $state(false)
let initializedPropertyKey = $state('')
let assignments = $state<Record<string, string>>({})
let isActive = true

const uniqueValues = $derived(getUniqueValuesSnapshot())
const discreteRangeOptions = $derived(getDiscreteRangeOptions())
const usesDiscreteAssignments = $derived(discreteRangeOptions.length > 0)
const valuesNeedingResolution = $derived(validation?.issues ?? [])
const canContinue = $derived.by(() => {
  if (validation?.isValid) return true

  return valuesNeedingResolution.every(issue => {
    const assignment = assignments[issue.value]
    if (assignment === DROP_VALUE) return true
    return assignment !== undefined && assignment.trim() !== ''
  })
})

const footerContinueAction = () => handleProceed()

onDestroy(() => {
  isActive = false
})

$effect(() => {
  syncFooterAction(!canContinue || isLoading || !validation || isToggleField)
})

async function initializeProperty() {
  isLoading = true
  isToggleField = false
  validation = null
  hasValidated = false
  assignments = {}

  await loadExistingProperty()
  if (!isActive) return

  if (!existingProperty) {
    console.error('RangeValidation: Property not found, cannot proceed')
    return
  }

  const currentUniqueValues = getUniqueValuesSnapshot()

  // Check if this should actually be treated as a toggle field.
  if (shouldTreatAsToggle(currentUniqueValues)) {
    isToggleField = true
    isLoading = false
    importCtx.setPropertyEnrichedData(property.key, {
      propertyId: existingProperty.id,
      propertyType: 'classifier',
      resolvedData: buildBooleanRangeMappings(),
      resolvedValues: buildBooleanRangeMappings(),
    })
    setTimeout(() => {
      if (isActive) {
        onActionComplete()
      }
    }, 1000)
    return
  }

  validateValues(currentUniqueValues)
}

// Re-initialize when property changes.
$effect(() => {
  if (initializedPropertyKey === property.key) return
  initializedPropertyKey = property.key
  void initializeProperty()
})

async function loadExistingProperty() {
  if (!importCtx) {
    console.error('RangeValidation: Import context unavailable')
    isLoading = false
    return
  }

  try {
    // Prefer the project-visible property set captured during column parsing/reconciliation.
    let found = importCtx
      .getFetchedProperties()
      .find((p: Property) => p.key === property.key)

    if (found) {
      existingProperty = found
      appCtx.addToCache(FirstClassResource.property, found.id, found)
      return
    }

    found = Array.from(appCtx.cache.property.values()).find(
      (p: Property) => p.key === property.key,
    )

    if (found) {
      existingProperty = found
    } else {
      const result = await getProperties({
        conditions: { key: property.key },
        meta: { isAdminRequest: true, profile: 'admin' },
      })
      const properties = Array.isArray(result.data) ? result.data : []
      found = properties[0] as Property | undefined

      if (found) {
        existingProperty = found
        appCtx.addToCache(FirstClassResource.property, found.id, found)
      } else {
        console.error('Property not found:', property.key)
      }
    }
  } catch (error) {
    console.error('Error loading property:', error)
  } finally {
    isLoading = false
  }
}

function getUniqueValuesSnapshot(): string[] {
  if (!importCtx) return []

  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const values = new Set<string>()

  property.columns.forEach(col => {
    const colIndex = headers.indexOf(col.header)
    if (colIndex < 0) return

    data.forEach(row => {
      const value = row[colIndex]?.trim()
      if (value) values.add(value)
    })
  })

  return Array.from(values)
}

function shouldTreatAsToggle(values: string[]): boolean {
  if (!existingProperty) {
    return false
  }

  // Check for binary toggle patterns.
  const isBinaryToggle =
    values.length === 2 &&
    [...values].sort((a, b) => a.localeCompare(b)).join(',') === '0,1'
  const isSingleBinaryValue =
    values.length === 1 && (values[0] === '0' || values[0] === '1')
  const isBooleanValues =
    values.length > 0 &&
    values.every(val => {
      const lower = val.toLowerCase()
      return lower === 'true' || lower === 'false'
    })

  return isBinaryToggle || isSingleBinaryValue || isBooleanValues
}

function toNumericValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  if (lower === 'true') return 1
  if (lower === 'false') return 0

  const parsed = Number.parseFloat(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

function validateValues(values: string[]) {
  if (!existingProperty) return

  const issues: RangeIssue[] = []
  const numericValues: number[] = []
  const currentMin = existingProperty.min
  const currentMax = existingProperty.max

  values.forEach(value => {
    const numericValue = toNumericValue(value)

    if (numericValue === null) {
      issues.push({ value, numericValue: Number.NaN, reason: 'non-numeric' })
      return
    }

    numericValues.push(numericValue)

    if (currentMin !== null && numericValue < currentMin) {
      issues.push({ value, numericValue, reason: 'below-min' })
      return
    }

    if (currentMax !== null && numericValue > currentMax) {
      issues.push({ value, numericValue, reason: 'above-max' })
    }
  })

  validation = {
    isValid: issues.length === 0,
    issues,
    currentRange: {
      min: currentMin,
      max: currentMax,
    },
    csvRange: {
      min: numericValues.length > 0 ? Math.min(...numericValues) : null,
      max: numericValues.length > 0 ? Math.max(...numericValues) : null,
    },
  }

  assignments = Object.fromEntries(
    issues.map(issue => [issue.value, getDefaultAssignment(issue.value)]),
  )
  hasValidated = true
}

function getDefaultAssignment(value: string): string {
  const numericValue = toNumericValue(value)
  if (numericValue === null) return ''

  if (usesDiscreteAssignments) {
    const normalized = String(Math.round(numericValue))
    return discreteRangeOptions.includes(normalized) ? normalized : ''
  }

  return String(numericValue)
}

function getDiscreteRangeOptions(): string[] {
  if (
    existingProperty?.min === null ||
    existingProperty?.min === undefined ||
    existingProperty?.max === null ||
    existingProperty?.max === undefined
  ) {
    return []
  }

  const min = existingProperty.min
  const max = existingProperty.max
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return []
  }

  const count = max - min + 1
  if (count <= 0 || count > 10) {
    return []
  }

  return Array.from({ length: count }, (_, index) => String(min + index))
}

function buildBooleanRangeMappings(): Record<string, string | null> {
  const mappedValues: Record<string, string | null> = {}
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  property.columns.forEach(col => {
    const locale = col.locale && col.locale !== 'None' ? (col.locale as Locale) : 'en'
    const colIndex = headers.indexOf(col.header)
    if (colIndex < 0) return

    data.forEach(row => {
      const value = row[colIndex]?.trim()
      if (!value) return

      const numeric = toNumericValue(value)
      const mappedValue = numeric === null ? null : String(numeric)
      mappedValues[value] = mappedValue
      mappedValues[`${locale}:${value}`] = mappedValue
    })
  })

  return mappedValues
}

function handleProceed() {
  if (!existingProperty || !canContinue) return

  if (validation?.isValid) {
    importCtx.setPropertyEnrichedData(property.key, {
      propertyId: existingProperty.id,
      propertyType: 'classifier',
    })
    onActionComplete()
    return
  }

  const resolvedData: Record<string, string | null | undefined> = {}
  const resolvedValues: Record<string, string | null | undefined> = {}
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  property.columns.forEach(col => {
    const locale = col.locale && col.locale !== 'None' ? (col.locale as Locale) : 'en'
    const colIndex = headers.indexOf(col.header)
    if (colIndex < 0) return

    data.forEach(row => {
      const rawValue = row[colIndex]?.trim()
      if (!rawValue) return

      const assignment = assignments[rawValue]
      if (assignment === undefined || assignment === '') return

      const mappedValue = assignment === DROP_VALUE ? null : assignment
      resolvedValues[rawValue] = mappedValue
      resolvedData[`${locale}:${rawValue}`] = mappedValue
      resolvedData[rawValue] = mappedValue
    })
  })

  importCtx.setPropertyEnrichedData(property.key, {
    propertyId: existingProperty.id,
    propertyType: 'classifier',
    resolvedData,
    resolvedValues,
  })

  onActionComplete()
}

function syncFooterAction(disabled: boolean): void {
  if (isToggleField) {
    if (footerAction !== undefined) {
      footerAction = undefined
    }
    if (footerActionLabel !== '') {
      footerActionLabel = ''
    }
    if (footerActionDisabled) {
      footerActionDisabled = false
    }
    return
  }

  if (footerAction !== footerContinueAction) {
    footerAction = footerContinueAction
  }
  if (footerActionLabel !== 'Continue') {
    footerActionLabel = 'Continue'
  }
  if (footerActionDisabled !== disabled) {
    footerActionDisabled = disabled
  }
}

// Auto-proceed if validation passes for already-compatible numeric ranges.
$effect(() => {
  if (validation?.isValid && hasValidated) {
    setTimeout(() => {
      if (isActive) {
        handleProceed()
      }
    }, 1000)
  }
})

function getIssueText(issue: RangeIssue): string {
  if (issue.reason === 'non-numeric') {
    return 'Not a number'
  }
  if (issue.reason === 'below-min' && validation?.currentRange.min !== null) {
    return m.below_minimum({ min: validation.currentRange.min })
  }
  if (issue.reason === 'above-max' && validation?.currentRange.max !== null) {
    return m.above_maximum({ max: validation.currentRange.max })
  }
  return m.validation_failed()
}

function getSampleValues(limit = 10): string[] {
  return uniqueValues.slice(0, limit)
}
</script>

<div class="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-3"
  >
    {#if isLoading}
      <div class="flex min-h-full flex-1 items-center justify-center">
        <span class="loading loading-spinner loading-lg"></span>
        <span class="ml-3">{m.validating_range_values()}</span>
      </div>
    {:else if !existingProperty}
      <div class="rounded-2xl border border-error/25 bg-error/10 p-4 text-error">
        <h4 class="font-semibold">{m.property_not_found()}</h4>
        <p class="mt-2 text-sm">
          {m.property_not_found_description({ key: property.key })}
        </p>
      </div>
    {:else if isToggleField}
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-success"
            >
              Existing range property
            </div>
            <h3 class="mt-2 text-2xl font-black tracking-tight">{property.key}</h3>
          </div>
          <div
            class="rounded-full border border-success/25 bg-success/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-success"
          >
            Toggle detected
          </div>
        </div>

        <div class="rounded-2xl border border-success/25 bg-success/10 p-4">
          <h4 class="font-semibold text-success">Boolean values detected</h4>
          <p class="mt-2 text-sm text-success/80">
            This column will be submitted as numeric range values using `true = 1` and
            `false = 0`.
          </p>
        </div>

        <div
          class="grid min-h-[4.35rem] gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-2"
        >
          <div>
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              Current property range
            </div>
            <div class="mt-2 font-mono text-lg text-base-content/90">
              {existingProperty.min ?? '∞'}
              - {existingProperty.max ?? '∞'}
            </div>
          </div>
          <div class="flex items-center justify-start md:justify-end">
            <span class="loading loading-spinner loading-md"></span>
            <span class="ml-3 text-sm text-base-content/70">Auto-proceeding…</span>
          </div>
        </div>
      </div>
    {:else if !validation}
      <div class="rounded-2xl border border-error/25 bg-error/10 p-4 text-error">
        <h4 class="font-semibold">{m.validation_error()}</h4>
        <p class="mt-2 text-sm">{m.unable_to_validate_values()}</p>
      </div>
    {:else}
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-info"
            >
              Existing range property
            </div>
            <h3 class="mt-2 text-2xl font-black tracking-tight">{property.key}</h3>
          </div>
          <div
            class={`rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${
              validation.isValid
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-warning/25 bg-warning/10 text-warning'
            }`}
          >
            {validation.isValid ? m.validation_passed() : m.validation_failed()}
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              {m.current_property_range()}
            </div>
            <div class="mt-2 font-mono text-2xl font-black text-base-content/90">
              {validation.currentRange.min ?? '∞'}
              - {validation.currentRange.max ?? '∞'}
            </div>
            <p class="mt-2 text-sm text-base-content/65">{m.existing_constraints()}</p>
          </div>

          <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              {m.csv_data_range()}
            </div>
            <div class="mt-2 font-mono text-2xl font-black text-base-content/90">
              {validation.csvRange.min ?? '—'}
              - {validation.csvRange.max ?? '—'}
            </div>
            <p class="mt-2 text-sm text-base-content/65">{m.values_in_import_data()}</p>
          </div>
        </div>

        {#if validation.isValid}
          <div class="rounded-2xl border border-success/25 bg-success/10 p-4">
            <h4 class="font-semibold text-success">{m.all_values_within_range()}</h4>
            <p class="mt-2 text-sm text-success/80">
              These values can be imported directly without any remapping.
            </p>
          </div>
        {:else}
          <div class="rounded-2xl border border-warning/25 bg-warning/8 p-4">
            <h4 class="font-semibold text-warning">Resolve invalid input values</h4>
            <p class="mt-2 text-sm text-warning/80">
              Map each CSV value to a stored numeric value, or drop it for this import.
            </p>
          </div>

          <div class="space-y-3">
            {#each valuesNeedingResolution as issue}
              <div
                class="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-[minmax(0,1fr)_10rem]"
              >
                <div class="min-w-0">
                  <div
                    class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-base-content/45"
                  >
                    Source value
                  </div>
                  <div class="mt-2 font-mono text-base text-base-content/90">
                    {issue.value}
                  </div>
                  <div class="mt-2 text-sm text-warning/80">
                    {getIssueText(issue)}
                  </div>
                </div>

                <div class="space-y-2">
                  <div
                    class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-base-content/45"
                  >
                    Assign to
                  </div>
                  {#if usesDiscreteAssignments}
                    <div class="p-2">
                      <select
                        class="select select-bordered w-full bg-black/30 px-2 text-center font-mono text-sm"
                        value={assignments[issue.value] ?? ''}
                        onchange={event => {
                          assignments[issue.value] = (
                            event.currentTarget as HTMLSelectElement
                          ).value
                        }}
                      >
                        <option value="">Select value</option>
                        {#each discreteRangeOptions as option}
                          <option value={option}>{option}</option>
                        {/each}
                        <option value={DROP_VALUE}>Drop value</option>
                      </select>
                    </div>
                  {:else}
                    <div class="flex gap-2 p-2">
                      <input
                        class="input input-bordered w-full bg-black/30 px-2 text-center font-mono text-sm"
                        type="number"
                        step="any"
                        value={assignments[issue.value] === DROP_VALUE
                          ? ''
                          : (assignments[issue.value] ?? '')}
                        placeholder="Enter number"
                        oninput={event => {
                          assignments[issue.value] = (
                            event.currentTarget as HTMLInputElement
                          ).value
                        }}
                      >
                      <button
                        type="button"
                        class={`btn btn-sm min-w-24 ${
                          assignments[issue.value] === DROP_VALUE
                            ? 'btn-warning'
                            : 'btn-ghost'
                        }`}
                        onclick={() => {
                          assignments[issue.value] =
                            assignments[issue.value] === DROP_VALUE ? '' : DROP_VALUE
                        }}
                      >
                        Drop
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-2"
  >
    <div class="mb-5">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-warning"
      >
        {uniqueValues.length} {uniqueValues.length === 1 ? 'value' : 'values'}
      </div>
      <h3 class="mt-2 text-xl font-black tracking-tight">{m.sample_values()}</h3>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04]"
    >
      {#each getSampleValues() as value}
        <div
          class="border-b border-white/10 px-4 py-3 font-mono text-sm text-base-content/80 last:border-b-0"
        >
          {value}
        </div>
      {/each}
    </div>

    {#if validation && !validation.isValid}
      <div class="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          Resolution mode
        </div>
        <p class="mt-2 text-sm leading-relaxed text-base-content/70">
          {usesDiscreteAssignments
            ? 'This range is short enough to choose from fixed numeric options.'
            : 'This range is broad, so enter a numeric replacement or drop the value.'}
        </p>
      </div>
    {/if}
  </section>
</div>
