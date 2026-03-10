<script lang="ts">
import { Checkbox, SelectField, TextArea, TextInput } from '$lib/bits/custom'
import { Switch } from '$lib/bits/custom'
import type { FormFeatureFieldProps } from './formFeatureField.types'

let { property, localeKey, value = '', checked = false, options = [], onChange }: FormFeatureFieldProps =
  $props()

const propertyI18n = $derived((property.i18n?.[localeKey] ?? property.i18n?.en) as {
  label?: string
  placeholder?: string
})
const title = $derived(propertyI18n?.label ?? property.key)
const placeholder = $derived(propertyI18n?.placeholder ?? '')
</script>

<article class="bits-feature-field">
  <div class="bits-feature-field__label">
    <span class="bits-feature-field__title">{title}</span>
    <span class="bits-feature-field__subtitle">{property.key}</span>
  </div>

  {#if property.component === 'SelectField'}
    <SelectField
      id={`feature-field-${property.id}`}
      name={`feature-field-${property.id}`}
      label=""
      items={options.map(option => ({ value: option.value, label: option.label }))}
      value={value ?? ''}
      placeholder={placeholder}
      onValueChange={nextValue => onChange(nextValue)}
    />
  {:else if property.component === 'RangeField'}
    <div class="bits-feature-field__range">
      <input
        type="range"
        min={property.min ?? 0}
        max={property.max ?? 100}
        value={value ?? property.min ?? 0}
        oninput={event => onChange((event.currentTarget as HTMLInputElement).value)}
      >
      <div class="bits-feature-field__range-values">
        <span>{property.min ?? 0}</span>
        <span>{property.max ?? 100}</span>
      </div>
    </div>
  {:else if property.component === 'CheckboxField' || property.component === 'Toggle'}
    <Switch checked={checked} onCheckedChange={nextValue => onChange(nextValue ?? false)} />
  {:else if property.component === 'TextareaField'}
    <TextArea
      id={`feature-field-${property.id}`}
      name={`feature-field-${property.id}`}
      label=""
      value={value ?? ''}
      placeholder={placeholder}
      onValueChange={nextValue => onChange(nextValue)}
    />
  {:else}
    <TextInput
      id={`feature-field-${property.id}`}
      name={`feature-field-${property.id}`}
      label=""
      value={value ?? ''}
      placeholder={placeholder}
      onValueChange={nextValue => onChange(nextValue)}
    />
  {/if}
</article>
