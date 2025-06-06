<script lang="ts">
// LIB
import { updateFeaturePropertyValue } from '$lib';
// TYPES
import type { FieldPropsExtended, FeatureForm } from '$lib/types';

let { fieldRoot, fieldIndex, fieldKey, ...fieldProps }: FieldPropsExtended = $props();

// STATE : FORM
let { form } = fieldProps.form as unknown as FeatureForm;

// STATE : DERIVED
let currentItem = $derived(($form as any)[fieldRoot]?.[fieldIndex]);
let property = $derived(currentItem?.property);
let currentValue = $derived(currentItem?.[fieldKey] || property?.min || 0);
</script>

<!-- TODO: Make into an actual field instead of an element-->

<input
  name={fieldRoot}
  type="range"
  class="range range-primary"
  min={property?.min || 0}
  max={property?.max || 100}
  step="1"
  value={currentValue}
  onchange={(e: Event) => {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    const newValue = target.value;
    updateFeaturePropertyValue(form, fieldRoot, fieldIndex, newValue, fieldKey);
  }} />
<div class="flex w-full justify-between px-2 text-xs">
  <span>{property?.min || 0}</span>
  <span>❘</span>
  <span>|</span>
  <span>❘</span>
  <span>{property?.max || 100}</span>
</div>
<!-- <ErrorLabel errors={$errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} /> -->
