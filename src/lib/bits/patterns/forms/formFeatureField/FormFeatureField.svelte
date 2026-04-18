<script lang="ts">
import FeatureFieldInput from './components/FeatureFieldInput.svelte'
import FeatureFieldRange from './components/FeatureFieldRange.svelte'
import FeatureFieldSelect from './components/FeatureFieldSelect.svelte'
import FeatureFieldTextArea from './components/FeatureFieldTextArea.svelte'
import FeatureFieldToggle from './components/FeatureFieldToggle.svelte'
import type { FormFeatureFieldProps } from './formFeatureField.types'

let {
  property,
  localeKey,
  value = '',
  checked = false,
  options = [],
  isEditing = true,
  onChange,
}: FormFeatureFieldProps = $props()

const propertyI18n = $derived(
  (property.i18n?.[localeKey] ?? property.i18n?.en) as {
    label?: string
    placeholder?: string
  },
)
const title = $derived(propertyI18n?.label ?? property.key)
const placeholder = $derived(propertyI18n?.placeholder ?? '')
const isRangeField = $derived(property.component === 'RangeField')
const isToggleField = $derived(
  property.component === 'CheckboxField' || property.component === 'Toggle',
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

<article class={fieldClass}>
  <div class="bits-feature-field__content">
    <div class="bits-feature-field__label">
      <span class="bits-feature-field__title">{title}</span>
      <span class="bits-feature-field__subtitle">{property.key}</span>
    </div>

    {#if property.component === 'SelectField'}
      <div
        class={[
          'bits-feature-field__control',
          'bits-feature-field__control--select',
          isEditing ? 'bits-feature-field__control--placeholder-marker' : '',
          hasValue ? 'bits-feature-field__control--has-value' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <FeatureFieldSelect
          id={`feature-field-${property.id}`}
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
    {:else if property.component === 'CheckboxField' || property.component === 'Toggle'}
      <div class="bits-feature-field__control bits-feature-field__control--toggle">
        <FeatureFieldToggle
          {checked}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      </div>
    {:else if property.component === 'TextareaField'}
      <div
        class={[
          'bits-feature-field__control',
          'bits-feature-field__control--textarea',
          isEditing ? 'bits-feature-field__control--placeholder-marker' : '',
          hasValue ? 'bits-feature-field__control--has-value' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <FeatureFieldTextArea
          id={`feature-field-${property.id}`}
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
          isEditing ? 'bits-feature-field__control--placeholder-marker' : '',
          hasValue ? 'bits-feature-field__control--has-value' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <FeatureFieldInput
          id={`feature-field-${property.id}`}
          value={value ?? ''}
          {placeholder}
          {isEditing}
          onChange={nextValue => onChange(nextValue)}
        />
      </div>
    {/if}
  </div>
</article>
