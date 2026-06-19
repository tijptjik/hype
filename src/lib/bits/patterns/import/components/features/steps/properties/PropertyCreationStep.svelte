<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
import { getAppCtx } from '$lib/context/app.svelte'
// API
import { createProjectProperty } from '$lib/api/server/property.remote'
import { translateText } from '$lib/api/server/translation.remote'
// I18N
import { m } from '$lib/i18n'
// BITS COMPONENTS
import { Switch } from '$lib/bits/custom/switch'
import { Swap } from '$lib/bits/custom/swap'
// ICONS
import Check from 'virtual:icons/lucide/check'
import Pencil from 'virtual:icons/lucide/pencil'
// COMPONENTS
import PropertyEditableRow from './PropertyEditableRow.svelte'
// LIB
import { customAlphabet } from 'nanoid'
// TYPES
import type {
  FeatureCSVColumn,
  FieldComponentType,
  FieldDiscriminator,
  LocaleKey,
  Property,
} from '$lib/client/services/import/types'
import type { ProjectPropertyForm } from '$lib/db/zod/schema/property.types'
// ENUMS
import { FirstClassResource } from '$lib/enums'

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12,
)

type PropertyData = {
  key: string
  columns: FeatureCSVColumn[]
  scenario: number
}

type PropertyKind = Extract<FieldDiscriminator, 'classifier' | 'specifier'>

type Props = {
  property: PropertyData
  onActionComplete: () => void
  footerAction?: () => void
  footerActionLabel?: string
  footerActionDisabled?: boolean
}

let {
  property,
  onActionComplete,
  footerAction = $bindable(),
  footerActionLabel = $bindable(''),
  footerActionDisabled = $bindable(false),
}: Props = $props()

const importCtx = getImportCtx()
const appCtx = getAppCtx()

let propertyKey = $state('')
let englishLabel = $state('')
let englishPlaceholder = $state('')
let propertyKind = $state<PropertyKind>('specifier')
let componentType = $state<FieldComponentType>('InputField')
let isTranslatable = $state(false)
let editingField = $state<'key' | 'label' | 'placeholder' | 'component' | null>(null)
let initialisedPropertyKey = $state('')
let propertyId = $state(nanoid())
let hasPersistedProperty = $state(false)

// Translation state
let translatedLabels = $state<Partial<Record<LocaleKey, string>>>({})
let translatedPlaceholders = $state<Partial<Record<LocaleKey, string>>>({})
let isTranslating = $state(false)
let translatedForKey = $state('')

// Form state
let isSubmitting = $state(false)
let formErrors = $state<Record<string, string>>({})
let apiNameTaken = $derived(formErrors.key === 'PROPERTY_KEY_TAKEN')

function isPropertyKeyTakenError(error: unknown): boolean {
  if (error instanceof Error && error.message === 'PROPERTY_KEY_TAKEN') {
    return true
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'body' in error &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'message' in error.body &&
    error.body.message === 'PROPERTY_KEY_TAKEN'
  ) {
    return true
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409 &&
    'body' in error &&
    typeof error.body === 'object' &&
    error.body !== null &&
    'message' in error.body &&
    error.body.message === 'PROPERTY_KEY_TAKEN'
  ) {
    return true
  }

  return false
}

$effect(() => {
  if (initialisedPropertyKey === property.key) return

  const existingData = importCtx.getPropertyEnrichedData(property.key)
  const persistedPropertyId = existingData?.propertyId?.trim()
  const nextPropertyKind = getInitialPropertyKind(property, existingData?.propertyType)

  initialisedPropertyKey = property.key
  propertyId = persistedPropertyId || nanoid()
  hasPersistedProperty = Boolean(persistedPropertyId)
  propertyKey = property.key
  englishLabel = capitalizeKey(property.key)
  englishPlaceholder = `Enter ${property.key}`
  propertyKind = nextPropertyKind
  componentType = inferComponentType(property, nextPropertyKind)
  isTranslatable = hasLocaleColumns(property)
  editingField = null
  translatedLabels = {}
  translatedPlaceholders = {}
  translatedForKey = ''
  formErrors = {}
})

$effect(() => {
  if (propertyKind === 'classifier' && !isClassifierComponent(componentType)) {
    componentType = 'SelectField'
    return
  }

  if (propertyKind === 'specifier' && componentType === 'SelectField') {
    componentType = 'InputField'
  }
})

// Generate stable property ID
const uniqueValues = $derived(getUniqueValues(property))
const visibleValues = $derived(uniqueValues.slice(0, 18))
const propertyValueIds = $derived(uniqueValues.map(() => nanoid()))
const numericValues = $derived(
  uniqueValues
    .map(value => Number.parseFloat(value))
    .filter(value => !Number.isNaN(value)),
)

// Create form data for property creation
let formData = $derived.by((): ProjectPropertyForm => {
  const fallbackLabel = englishLabel || capitalizeKey(propertyKey)
  const fallbackPlaceholder = englishPlaceholder || `Enter ${propertyKey}`
  const values =
    propertyKind === 'classifier'
      ? uniqueValues.map((value, index) => ({
          id: propertyValueIds[index],
          propertyId,
          rank: index,
          value,
          i18n: {
            en: { value, valueGen: false },
            zhHant: { value, valueGen: false },
            zhHans: { value, valueGen: false },
          },
        }))
      : null

  const formDataResult: ProjectPropertyForm = {
    id: propertyId,
    projectId: importCtx.getSelectedProject()?.id || '',
    scope: 'project',
    isEnabled: true,
    isDefaultEnabled: false,
    type: propertyKind,
    key: propertyKey,
    rank: 0, // Will be calculated properly by the API
    component: componentType,
    isTranslatable: isTranslatable,
    values,
    min:
      componentType === 'RangeField' && numericValues.length > 0
        ? Math.floor(Math.min(...numericValues))
        : null,
    max:
      componentType === 'RangeField' && numericValues.length > 0
        ? Math.ceil(Math.max(...numericValues))
        : null,
    i18n: {
      en: {
        label: fallbackLabel,
        labelGen: false,
        placeholder: fallbackPlaceholder,
        placeholderGen: false,
      },
      zhHant: {
        label: translatedLabels.zhHant || fallbackLabel,
        labelGen: Boolean(translatedLabels.zhHant),
        placeholder: translatedPlaceholders.zhHant || fallbackPlaceholder,
        placeholderGen: Boolean(translatedPlaceholders.zhHant),
      },
      zhHans: {
        label: translatedLabels.zhHans || fallbackLabel,
        labelGen: Boolean(translatedLabels.zhHans),
        placeholder: translatedPlaceholders.zhHans || fallbackPlaceholder,
        placeholderGen: Boolean(translatedPlaceholders.zhHans),
      },
    },
  }

  return formDataResult
})

const footerSubmitAction = () => void submitProperty()

function getInitialPropertyKind(
  targetProperty: PropertyData,
  persistedPropertyType?: PropertyKind,
): PropertyKind {
  if (persistedPropertyType) return persistedPropertyType
  if ([1, 2, 8].includes(targetProperty.scenario)) return 'classifier'
  return hasStructuredValues(getUniqueValues(targetProperty))
    ? 'classifier'
    : 'specifier'
}

function inferComponentType(
  targetProperty: PropertyData,
  targetPropertyKind: PropertyKind,
): FieldComponentType {
  if (targetPropertyKind === 'classifier') {
    const values = getUniqueValues(targetProperty)
    if (values.length === 0) return 'SelectField'

    const booleanValues = values.every(value => {
      const normalized = value.toLowerCase()
      return normalized === 'true' || normalized === 'false'
    })
    const binaryValues =
      values.length <= 2 && values.every(value => value === '0' || value === '1')
    const allNumericValues = values.every(
      value => !Number.isNaN(Number.parseFloat(value)),
    )

    if (booleanValues || binaryValues) return 'ToggleField'
    if (allNumericValues) return 'RangeField'
    return 'SelectField'
  }

  const sampleValues = targetProperty.columns[0]?.sampleValues || []
  if (sampleValues.length === 0) return 'InputField'

  // Keep short text fields inline unless the input is predominantly long-form text.
  const longValues = sampleValues.filter(value => value && value.length > 48)
  const longValuePercentage = longValues.length / sampleValues.length

  return longValuePercentage < 0.05 ? 'InputField' : 'TextareaField'
}

/**
 * Returns unique non-empty CSV values across all columns for the current property.
 *
 * @param targetProperty - Property reconciliation item being created.
 * @returns Unique CSV values in source order.
 */
function getUniqueValues(targetProperty: PropertyData): string[] {
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const values = new Set<string>()

  targetProperty.columns.forEach(column => {
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex < 0) return

    data.forEach(row => {
      const value = row[columnIndex]?.trim()
      if (value) values.add(value)
    })
  })

  return Array.from(values)
}

function hasStructuredValues(values: string[]): boolean {
  if (values.length === 0) return false

  const hasBooleanValues = values.every(value => {
    const normalized = value.toLowerCase()
    return normalized === 'true' || normalized === 'false'
  })
  const hasBinaryValues =
    values.length <= 2 && values.every(value => value === '0' || value === '1')
  const hasNumericValues = values.every(
    value => !Number.isNaN(Number.parseFloat(value)),
  )

  return hasBooleanValues || hasBinaryValues || hasNumericValues
}

function hasLocaleColumns(targetProperty: PropertyData): boolean {
  return targetProperty.columns.some(
    column => column.locale && column.locale !== 'None',
  )
}

function normalizeToggleValue(value: string): 'true' | 'false' | null {
  const normalized = value.trim().toLowerCase()

  if (['true', '1', 'yes'].includes(normalized)) return 'true'
  if (['false', '0', 'no'].includes(normalized)) return 'false'

  return null
}

function getCreatedPropertyValueMapping(
  createdProperty: Property,
): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const value of uniqueValues) {
    const matchedPropertyValue = createdProperty.values?.find(candidate => {
      if (componentType === 'ToggleField') {
        const candidateValue = candidate.i18n?.en?.value || candidate.value || ''
        return normalizeToggleValue(candidateValue) === normalizeToggleValue(value)
      }

      return candidate.i18n?.en?.value === value || candidate.value === value
    })

    if (matchedPropertyValue) {
      mapping[value] = matchedPropertyValue.id
    }
  }

  if (componentType === 'ToggleField') {
    const truePropertyValueId = Object.entries(mapping).find(
      ([rawValue]) => normalizeToggleValue(rawValue) === 'true',
    )?.[1]
    const falsePropertyValueId = Object.entries(mapping).find(
      ([rawValue]) => normalizeToggleValue(rawValue) === 'false',
    )?.[1]

    if (truePropertyValueId) {
      mapping.true = truePropertyValueId
      mapping.yes = truePropertyValueId
      mapping['1'] = truePropertyValueId
    }

    if (falsePropertyValueId) {
      mapping.false = falsePropertyValueId
      mapping.no = falsePropertyValueId
      mapping['0'] = falsePropertyValueId
    }
  }

  return mapping
}

function isClassifierComponent(component: FieldComponentType): boolean {
  return ['SelectField', 'ToggleField', 'RangeField'].includes(component)
}

function capitalizeKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

// Translation function
async function translateToAllLocales() {
  if (isTranslating) return

  isTranslating = true

  try {
    {
      const [zhHantLabel, zhHantPlaceholder] = await translateText({
        source: 'en',
        target: 'zhHant',
        texts: [englishLabel, englishPlaceholder],
      })
      translatedLabels.zhHant = zhHantLabel
      translatedPlaceholders.zhHant = zhHantPlaceholder
    }

    {
      const [zhHansLabel, zhHansPlaceholder] = await translateText({
        source: 'en',
        target: 'zhHans',
        texts: [englishLabel, englishPlaceholder],
      })
      translatedLabels.zhHans = zhHansLabel
      translatedPlaceholders.zhHans = zhHansPlaceholder
    }
  } catch (error) {
    console.error('PropertyCreation: Translation error:', error)
  } finally {
    isTranslating = false
  }
}

$effect(() => {
  if (
    propertyKind !== 'specifier' ||
    !isTranslatable ||
    isTranslating ||
    translatedForKey === propertyKey
  ) {
    return
  }

  translatedForKey = propertyKey
  void translateToAllLocales()
})

$effect(() => {
  syncFooterAction(isSubmitting || isTranslating)
})

function syncFooterAction(disabled: boolean): void {
  const footerLabel = hasPersistedProperty ? 'Next' : m.create_property()

  untrack(() => {
    if (footerAction !== footerSubmitAction) {
      footerAction = footerSubmitAction
    }
    if (footerActionLabel !== footerLabel) {
      footerActionLabel = footerLabel
    }
    if (footerActionDisabled !== disabled) {
      footerActionDisabled = disabled
    }
  })
}

async function submitProperty(): Promise<void> {
  if (isSubmitting) return

  if (hasPersistedProperty) {
    onActionComplete()
    return
  }

  isSubmitting = true
  formErrors = {}

  if (isTranslating) {
    while (isTranslating) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  const data = formData

  try {
    importCtx.updatePropertyReconciliation({ isProcessing: true })

    const createdState = await createProjectProperty({
      meta: {
        isAdminRequest: true,
      },
      data,
    })

    if (!createdState.data) {
      throw new Error('Property creation did not return a property')
    }

    const createdProperty: Property = createdState.data

    const enrichedData: {
      propertyId: string
      propertyType: PropertyKind
      propertyValueMapping?: Record<string, string>
      resolvedData?: Record<string, string | null | undefined>
      resolvedValues?: Record<string, string | null | undefined>
    } = {
      propertyId: createdProperty.id,
      propertyType: propertyKind,
    }

    if (componentType === 'ToggleField') {
      const toggleMappings = Object.fromEntries(
        uniqueValues.flatMap(value => {
          const normalized = normalizeToggleValue(value)
          return normalized ? [[value, normalized]] : []
        }),
      )
      enrichedData.resolvedValues = toggleMappings
      enrichedData.resolvedData = toggleMappings
    } else if (propertyKind === 'classifier' && createdProperty.values) {
      enrichedData.propertyValueMapping =
        getCreatedPropertyValueMapping(createdProperty)
    }

    importCtx.setPropertyEnrichedData(property.key, enrichedData)
    appCtx.addToCache(FirstClassResource.property, createdProperty.id, createdProperty)

    importCtx.updatePropertyReconciliation({ isProcessing: false })
    onActionComplete()
  } catch (error) {
    console.error('Error creating property:', error)
    importCtx.updatePropertyReconciliation({ isProcessing: false })
    if (isPropertyKeyTakenError(error)) {
      formErrors.key = 'PROPERTY_KEY_TAKEN'
    } else {
      formErrors.general =
        error instanceof Error ? error.message : 'Unknown error occurred'
    }
  } finally {
    isSubmitting = false
  }
}

function setEditingField(
  field: 'key' | 'label' | 'placeholder' | 'component',
  checked: boolean,
): void {
  editingField = checked ? field : null
}
</script>

<div class="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-3"
  >
    <div class="mb-5 flex items-start justify-between gap-4">
      <div>
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-warning"
        >
          {propertyKind === 'classifier'
            ? m.create_new_categorical_property()
            : m.create_new_freeform_property()}
        </div>
        <h3 class="mt-2 text-2xl font-black tracking-tight">
          {propertyKey}
        </h3>
      </div>
      <div class="flex flex-col items-end gap-2">
        {#if apiNameTaken}
          <div
            class="rounded-full border border-error/30 bg-error/15 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-error"
          >
            API name taken
          </div>
        {/if}
        <select
          class="select select-bordered select-sm min-w-36 rounded-full border-warning/25 bg-warning/10 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]"
          bind:value={propertyKind}
        >
          <option value="specifier">
            {m.feature_import__column_property_type_freeform()}
          </option>
          <option value="classifier">
            {m.feature_import__column_property_type_categorical()}
          </option>
        </select>
      </div>
    </div>

    <div class="space-y-3">
      <PropertyEditableRow
        label={m.api_name()}
        value={propertyKey}
        isEditing={editingField === 'key'}
        onEdit={checked => setEditingField('key', checked)}
        onCommit={() => {
          editingField = null
        }}
        onInput={value => {
          propertyKey = value
          delete formErrors.key
        }}
      />
      <PropertyEditableRow
        label={m.ui_name()}
        value={englishLabel}
        localePrefix="EN"
        isEditing={editingField === 'label'}
        onEdit={checked => setEditingField('label', checked)}
        onCommit={() => {
          editingField = null
        }}
        onInput={value => {
          englishLabel = value
        }}
      />
      <PropertyEditableRow
        label={m.placeholder()}
        value={englishPlaceholder}
        localePrefix="EN"
        isEditing={editingField === 'placeholder'}
        onEdit={checked => setEditingField('placeholder', checked)}
        onCommit={() => {
          editingField = null
        }}
        onInput={value => {
          englishPlaceholder = value
        }}
      />

      <div
        class="grid min-h-[4.35rem] gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-[12rem_minmax(0,1fr)_2.75rem] md:items-center"
      >
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          {m.component_type()}
        </div>
        {#if editingField === 'component'}
          <select
            class="select select-bordered w-full bg-black/30 px-3 py-2 font-mono text-sm"
            bind:value={componentType}
            onchange={() => {
              editingField = null
            }}
          >
            {#if propertyKind === 'classifier'}
              <option value="SelectField">SelectField</option>
              <option value="ToggleField">ToggleField</option>
              <option value="RangeField">RangeField</option>
            {:else}
              <option value="InputField">InputField</option>
              <option value="TextareaField">TextareaField</option>
            {/if}
          </select>
        {:else}
          <div class="font-mono text-sm text-base-content/85">{componentType}</div>
        {/if}
        <Swap
          checked={editingField === 'component'}
          offIcon={Pencil}
          onIcon={Check}
          size="sm"
          variant="transparent"
          offColor="dark"
          onColor="success"
          label={`Edit ${m.component_type()}`}
          onCheckedChange={checked => setEditingField('component', checked === true)}
        />
      </div>

      <div
        class="grid min-h-[4.35rem] gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 md:grid-cols-[12rem_minmax(0,1fr)_2.75rem] md:items-center"
      >
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          {m.translatable()}
        </div>
        <div class="justify-self-start">
          <Switch
            checked={isTranslatable}
            color="success"
            leftText={m.no()}
            rightText={m.yes()}
            size="sm"
            onCheckedChange={checked => {
              isTranslatable = checked === true
            }}
          />
        </div>
      </div>
    </div>

    {#if Object.keys(formErrors).length > 0}
      <div class="alert alert-error mt-4">
        <div>
          <h4 class="font-semibold">{m.form_errors()}</h4>
          <ul class="mt-2 text-sm">
            {#each Object.entries(formErrors) as [ field, error ]}
              <li>{field}: {error}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
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
        {#if componentType === 'SelectField'}
          {m.unique_values_to_create()}
          ({uniqueValues.length})
        {:else if componentType === 'ToggleField'}
          {m.boolean_values()}
        {:else if componentType === 'RangeField'}
          {m.numeric_range()}
        {:else}
          {m.sample_values()}
        {/if}
      </h3>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04]"
    >
      {#if componentType === 'InputField' || componentType === 'TextareaField'}
        {#each property.columns[0]?.sampleValues.slice(0, 10) || [] as value}
          <div
            class="border-b border-white/10 px-4 py-3 font-mono text-sm text-base-content/80 last:border-b-0"
          >
            {value || m.empty_value()}
          </div>
        {/each}
      {:else}
        {#each visibleValues as value}
          <div
            class="border-b border-white/10 px-4 py-3 font-mono text-sm text-base-content/80 last:border-b-0"
          >
            {value || m.empty_value()}
          </div>
        {/each}
        {#if uniqueValues.length > visibleValues.length}
          <div class="px-4 py-3 text-xs text-base-content/60">
            {m.and_more_values({ count: uniqueValues.length - visibleValues.length })}
          </div>
        {/if}
      {/if}
    </div>
  </section>
</div>
