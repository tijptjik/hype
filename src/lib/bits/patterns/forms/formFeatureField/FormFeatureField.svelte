<script lang="ts">
// LINKED FIELD CONTROLS
import { getLinkedFields } from '../linkedFields/linkedFields.svelte.js'
const linkedFields = getLinkedFields()

import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import CollapseIcon from 'virtual:icons/proicons/full-screen-minimize'
import { m } from '#lib/i18n.js'
import { TextInput } from '#lib/bits/custom/index.js'
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import TextIcon from 'virtual:icons/lucide/type'
import ParagraphIcon from 'virtual:icons/lucide/align-left'
import PhoneIcon from 'virtual:icons/lucide/phone'
import LinkIcon from 'virtual:icons/lucide/link'
import CalendarIcon from 'virtual:icons/lucide/calendar-days'
import ClockIcon from 'virtual:icons/lucide/clock'
import NumberIcon from 'virtual:icons/lucide/hash'
import RangeIcon from 'virtual:icons/lucide/sliders-horizontal'
import SelectIcon from 'virtual:icons/lucide/list-filter'
import ToggleIcon from 'virtual:icons/lucide/toggle-right'
import PlusIcon from 'virtual:icons/proicons/add'
import { isRangeProperty } from '#lib/properties/range.js'
import FeatureFieldInterval from './components/FeatureFieldInterval.svelte'
import FeatureFieldLinks from './components/FeatureFieldLinks.svelte'
import FeatureFieldPhone from './components/FeatureFieldPhone.svelte'
import FeatureFieldInput from './components/FeatureFieldInput.svelte'
import FeatureFieldRange from './components/FeatureFieldRange.svelte'
import FeatureFieldSelect from './components/FeatureFieldSelect.svelte'
import FeatureFieldMultiSelect from './components/FeatureFieldMultiSelect.svelte'
import FeatureFieldTextArea from './components/FeatureFieldTextArea.svelte'
import FeatureFieldToggle from './components/FeatureFieldToggle.svelte'
import type { FormFeatureFieldProps } from './formFeatureField.types'
// PROPERTY SELECTION
import { isMultiSelectProperty } from '#lib/properties/selection.js'

let {
  property,
  idPrefix = 'feature-field',
  localeKey,
  value = '',
  checked = false,
  options = [],
  isEditing = true,
  onChange,
}: FormFeatureFieldProps = $props()

let linksCollapsed = $state(false)
let linkControl = $state<{
  add: () => void
  canAdd: () => boolean
  hasItems: () => boolean
}>()
let phoneControl = $state<{ add: () => void; canAdd: () => boolean }>()
const propertyI18n = $derived(
  (property.i18n?.[localeKey] ?? property.i18n?.en) as {
    label?: string
    placeholder?: string
  },
)
const title = $derived(
  propertyI18n?.label?.trim() || m.admin__forms_property_untitled(),
)
const FieldIcon = $derived(
  property.dataType === 'link'
    ? LinkIcon
    : property.dataType === 'date' || property.dataType === 'dateRange'
      ? CalendarIcon
      : property.dataType === 'timeRange'
        ? ClockIcon
        : property.component === 'PhoneField'
          ? PhoneIcon
          : property.component === 'RangeField'
            ? RangeIcon
            : property.component === 'SelectField'
              ? SelectIcon
              : ['CheckboxField', 'Toggle', 'ToggleField'].includes(
                    property.component ?? '',
                  )
                ? ToggleIcon
                : property.component === 'TextareaField'
                  ? ParagraphIcon
                  : property.dataType === 'number'
                    ? NumberIcon
                    : TextIcon,
)
const placeholder = $derived(propertyI18n?.placeholder ?? '')
const isRangeField = $derived(property.component === 'RangeField')
const isToggleField = $derived(
  property.component === 'CheckboxField' ||
    property.component === 'Toggle' ||
    property.component === 'ToggleField',
)
const isTextareaField = $derived(property.component === 'TextareaField')
const hasValue = $derived(
  isToggleField
    ? checked
    : typeof value === 'string'
      ? value.trim().length > 0
      : value != null,
)
const fieldClass = $derived(
  [
    'bits-feature-field',
    isRangeField ? 'bits-feature-field--range' : '',
    isToggleField ? 'bits-feature-field--toggle' : '',
    isTextareaField ? 'bits-feature-field--textarea' : '',
    !isEditing ? 'bits-feature-field--readonly' : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<article
  hidden={property.key === 'phoneNumber' &&
    linkedFields &&
    !linkedFields.visible('phoneNumber')}
  class={fieldClass}
>
  <!-- Keep label spacing local; legacy field-card sizing must not stretch this stack. -->
  <div class="flex min-w-0 flex-col gap-2 px-6 py-4">
    <div class="flex min-h-0 min-w-0 shrink-0 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <FieldIcon class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <Label for={`${idPrefix}-${property.id}`} text={title} {isEditing} />
        <span class="bits-feature-field__subtitle">{property.key}</span>
      </div>
      {#if isEditing && property.dataType === 'link'}
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="text-primary inline-flex items-center gap-2 text-sm disabled:opacity-40"
            disabled={!linkControl?.canAdd()}
            onclick={() => {
              linksCollapsed = false
              linkControl?.add()
            }}
          >
            <PlusIcon class="size-4" />Add link
          </button>
          <button
            type="button"
            class="text-primary hover:bg-primary/10 flex size-9 items-center justify-center rounded disabled:opacity-30"
            aria-label={linksCollapsed ? 'Expand links' : 'Collapse links'}
            data-tooltip={linksCollapsed ? 'Expand links' : 'Collapse links'}
            disabled={!linkControl?.hasItems()}
            aria-expanded={!linksCollapsed}
            onclick={() => (linksCollapsed = !linksCollapsed)}
          >
            {#if linksCollapsed}
              <ExpandIcon class="size-5 [&_path]:[stroke-width:2]" />
            {:else}
              <CollapseIcon class="size-5 [&_path]:[stroke-width:2]" />
            {/if}
          </button>
        </div>
      {:else if isEditing && property.component === 'PhoneField'}
        <button
          type="button"
          class="text-primary inline-flex shrink-0 items-center gap-2 text-sm disabled:opacity-40"
          disabled={!phoneControl?.canAdd()}
          onclick={() => phoneControl?.add()}
        >
          <PlusIcon class="size-4" />Add number
        </button>
      {/if}
    </div>

    <!-- Align displayed values with dropdown text (border + 4.5 spacing units); keep the grade slider full-width. -->
    <div
      class={[
        String.raw`min-w-0 [&_.bits-form\_\_label]:hidden!`,
        !isEditing && !isRangeField
          ? String.raw`pl-[calc(1px+var(--spacing)*4.5)] [&_.bits-form\_\_control-wrap]:border-l-0! [&_.bits-form\_\_control-wrap]:pl-0! [&_.bits-form\_\_control]:pl-0! [&_.bits-form\_\_select-display]:pl-0!`
          : '',
      ]}
    >
      {#if !isEditing && !hasValue && !isToggleField}
        <TextInput
          id={`${idPrefix}-${property.id}`}
          value=""
          placeholder="—"
          isEditing={false}
          label=""
          class="bits-feature-field__form-field"
          controlClass="bits-feature-field__control-wrap"
        />
      {:else if isRangeProperty(property)}
        <FeatureFieldInterval
          definition={property}
          value={value == null ? '' : String(value)}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      {:else if property.dataType === 'link'}
        <FeatureFieldLinks
          collapsed={linksCollapsed}
          bind:this={linkControl}
          headerAction={true}
          value={value == null ? '' : String(value)}
          cardinality={property.cardinality}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      {:else if property.component === 'PhoneField'}
        <FeatureFieldPhone
          bind:this={phoneControl}
          headerAction={true}
          id={`${idPrefix}-${property.id}`}
          value={value == null ? '' : String(value)}
          {placeholder}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      {:else if isMultiSelectProperty(property)}
        <FeatureFieldMultiSelect
          id={`${idPrefix}-${property.id}`}
          {value}
          {options}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      {:else if property.component === 'SelectField'}
        <div
          class={[
            'bits-feature-field__control',
            'bits-feature-field__control--select',
            hasValue ? 'bits-feature-field__control--has-value' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <FeatureFieldSelect
            id={`${idPrefix}-${property.id}`}
            value={value ?? ''}
            {placeholder}
            {options}
            {isEditing}
            onChange={nextValue => onChange(nextValue)}
          />
        </div>
      {:else if property.component === 'RangeField'}
        <FeatureFieldRange
          value={value == null ? null : String(value)}
          min={property.min ?? 0}
          max={property.max ?? 100}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      {:else if property.component === 'CheckboxField' ||
        property.component === 'Toggle' ||
        property.component === 'ToggleField'}
        <div
          class="flex min-h-12 items-center [&_.bits-switch]:origin-center!"
          class:justify-center={isEditing}
        >
          <FeatureFieldToggle
            id={`${idPrefix}-${property.id}`}
            {checked}
            {isEditing}
            onChange={nextValue => onChange(nextValue)}
          />
        </div>
      {:else if isTextareaField}
        <div
          class={[
            'bits-feature-field__control',
            'bits-feature-field__control--textarea',
            hasValue ? 'bits-feature-field__control--has-value' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <FeatureFieldTextArea
            isPhone={property.component === 'PhoneField'}
            id={`${idPrefix}-${property.id}`}
            value={value ?? ''}
            {placeholder}
            {isEditing}
            onChange={nextValue => onChange(nextValue)}
          />
        </div>
      {:else}
        <div
          class={[
            'bits-feature-field__control',
            'bits-feature-field__control--input',
            hasValue ? 'bits-feature-field__control--has-value' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <FeatureFieldInput
            inputType={property.dataType === 'date'
              ? 'date'
              : property.dataType === 'number'
                ? 'number'
                : 'text'}
            isPhone={property.component === 'PhoneField'}
            id={`${idPrefix}-${property.id}`}
            value={value ?? ''}
            {placeholder}
            {isEditing}
            onChange={nextValue => onChange(nextValue)}
          />
        </div>
      {/if}
    </div>
  </div>
</article>
