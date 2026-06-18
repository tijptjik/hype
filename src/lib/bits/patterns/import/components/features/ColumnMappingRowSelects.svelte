<script lang="ts">
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import ImportRowCol from '../ImportRowCol.svelte'
// SERVICES
import { getAvailableFields } from '$lib/client/services/import/features'
import { getPropertyType } from '$lib/client/services/import/features/property'
// ENUMS
import { SupportedLocales } from '$lib/enums'
// TYPES
import type { FeatureCSVColumn } from '$lib/client/services/import/types'

type Props = {
  importCtx: ImportCtx
  index: number
}

type ColumnModelType = FeatureCSVColumn['modelType']
type ColumnLocale = FeatureCSVColumn['locale']
type ColumnPropertyType = NonNullable<FeatureCSVColumn['propertyType']>

let { importCtx, index }: Props = $props()

const column = $derived(importCtx.getColumns()[index])
const isSkipped = $derived(column.modelType === 'SKIP')
const disabledLabelClass = $derived(
  isSkipped ? 'cursor-not-allowed text-base-content/20' : '',
)
const disabledSelectClass = $derived(
  isSkipped ? 'cursor-not-allowed text-base-content/20' : '',
)

function handleColumnLocaleChange(): void {
  if (
    column.locale !== 'None' ||
    column.modelType !== 'Property' ||
    column.propertyKey !== 'NEW' ||
    column.propertyType !== 'classifier'
  ) {
    return
  }

  const columnIndex = importCtx.getColumnIndex(column)
  const values = importCtx
    .getData()
    .map(row => row[columnIndex])
    .filter(value => value?.trim())
    .map(value => value.trim())
    .slice(0, 20)

  const hasInvalidValues = values.some(value => {
    const lowerValue = value.toLowerCase()
    if (lowerValue === 'true' || lowerValue === 'false') return false

    const numericValue = Number.parseFloat(value)
    return Number.isNaN(numericValue) || !Number.isFinite(numericValue)
  })

  if (!hasInvalidValues) return

  alert(m.feature_import__column_locale_none_classifier_error())
  column.locale = SupportedLocales.en
}

function handlePropertyKeyChange(): void {
  if (column.propertyKey === 'NEW') {
    column.field = 'value'
    return
  }

  const columnIndex = importCtx.getColumnIndex(column)
  const nonEmptyValues = importCtx
    .getData()
    .map(row => row[columnIndex] || '')
    .filter(value => value.trim() !== '')

  const allAreIds =
    nonEmptyValues.length > 0 &&
    (nonEmptyValues.every(value => value.length === 12) ||
      nonEmptyValues.every(value => value.length === 16))

  column.field = allAreIds ? 'id' : 'value'
  column.propertyType = getPropertyType(
    column.propertyKey || '',
    importCtx.getFetchedProperties(),
  )
}

function handleModelChange(event: Event): void {
  column.modelType = (event.currentTarget as HTMLSelectElement).value as ColumnModelType
}

function handleLocaleChange(event: Event): void {
  column.locale = (event.currentTarget as HTMLSelectElement).value as ColumnLocale
  handleColumnLocaleChange()
}

function handlePropertyKeySelect(event: Event): void {
  column.propertyKey = (event.currentTarget as HTMLSelectElement).value
  handlePropertyKeyChange()
}

function handlePropertyTypeChange(event: Event): void {
  column.propertyType = (event.currentTarget as HTMLSelectElement)
    .value as ColumnPropertyType
}

function handleFieldChange(event: Event): void {
  column.field = (event.currentTarget as HTMLSelectElement).value
}
</script>

<ImportRowCol>
  <div>
    <span class="label label-text text-xs">
      {m.feature_import__column_model_label()}
    </span>
    <select
      id={`column-${index}-model`}
      aria-label={m.feature_import__column_model_label()}
      class="select select-bordered select-sm w-full"
      value={column.modelType}
      onchange={handleModelChange}
    >
      <option value="SKIP">{m.feature_import__column_model_skip()}</option>
      <option value="Feature">{m.feature_import__column_model_feature()}</option>
      <option value="User">{m.feature_import__column_model_user()}</option>
      <option value="Property">{m.feature_import__column_model_property()}</option>
      <option value="Layer">{m.feature_import__column_model_layer()}</option>
      <option value="Address">{m.feature_import__column_model_address()}</option>
      <option value="AddressMeta">
        {m.feature_import__column_model_address_meta()}
      </option>
    </select>
  </div>
</ImportRowCol>

<ImportRowCol>
  <div>
    <span class={`label label-text text-xs ${disabledLabelClass}`}>
      {m.feature_import__column_locale_label()}
    </span>
    <select
      id={`column-${index}-locale`}
      aria-label={m.feature_import__column_locale_label()}
      class={`select select-bordered select-sm w-full ${disabledSelectClass}`}
      value={column.locale}
      disabled={column.modelType === 'SKIP' ||
      column.modelType === 'User' ||
      column.modelType === 'AddressMeta'}
      onchange={handleLocaleChange}
    >
      <option value="None">{m.feature_import__column_locale_none()}</option>
      <option value="en">{m.lang__en()}</option>
      <option value="zh-hant">{m.lang__zh_hant()}</option>
      <option value="zh-hans">{m.lang__zh_hans()}</option>
    </select>
  </div>
</ImportRowCol>

{#if column.modelType === 'Property'}
  <ImportRowCol>
    <div>
      <span class="label label-text text-xs">
        {m.feature_import__column_property_key_label()}
      </span>
      <select
        id={`column-${index}-property-key`}
        aria-label={m.feature_import__column_property_key_label()}
        class="select select-bordered select-sm w-full"
        value={column.propertyKey}
        onchange={handlePropertyKeySelect}
      >
        <option value="NEW">
          {m.feature_import__column_property_new()}
          {column.extractedPropertyKey
          ? ` (${column.extractedPropertyKey})`
          : ''}
        </option>
        {#if importCtx.getIsFetchingProperties()}
          <option disabled>{m.feature_import__column_properties_loading()}</option>
        {:else}
          {#each importCtx.getAvailablePropertyKeys() as key}
            <option value={key}>{key}</option>
          {/each}
        {/if}
      </select>
    </div>
  </ImportRowCol>
{:else}
  <ImportRowCol />
{/if}

{#if column.modelType === 'Property' && column.propertyKey === 'NEW'}
  <ImportRowCol>
    <div>
      <span class="label label-text text-xs">
        {m.feature_import__column_property_type_label()}
        <span class="text-xs text-base-content/50">
          {m.feature_import__column_property_type_auto()}
        </span>
      </span>
      <select
        id={`column-${index}-property-type`}
        aria-label={m.feature_import__column_property_type_label()}
        class="select select-bordered select-sm w-full"
        value={column.propertyType}
        onchange={handlePropertyTypeChange}
      >
        <option value="classifier">
          {m.feature_import__column_property_type_categorical()}
        </option>
        <option value="specifier">
          {m.feature_import__column_property_type_freeform()}
        </option>
      </select>
    </div>
  </ImportRowCol>
{:else}
  <ImportRowCol />
{/if}

<ImportRowCol>
  <div>
    <span class={`label label-text text-xs ${disabledLabelClass}`}>
      {m.feature_import__column_field_label()}
    </span>
    <select
      id={`column-${index}-field`}
      aria-label={m.feature_import__column_field_label()}
      class={`select select-bordered select-sm w-full ${disabledSelectClass}`}
      value={column.field}
      disabled={isSkipped}
      onchange={handleFieldChange}
    >
      <option value="">{m.feature_import__column_field_select()}</option>
      {#each getAvailableFields(column.modelType, column.locale, column.propertyKey) as field}
        <option value={field}>{field}</option>
      {/each}
    </select>
  </div>
</ImportRowCol>
