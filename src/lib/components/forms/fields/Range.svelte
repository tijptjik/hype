<script lang="ts">
// TYPES
import type { FieldProps } from '$lib/types';

let { fieldRoot, fieldIndex, fieldKey, ...fieldProps }: FieldProps = $props();

// STATE : FORM
let { form } = fieldProps.form;
</script>

<!-- TODO: Make into an actual field instead of an element-->

<input
  type="range"
  class="range range-primary"
  min={$form[fieldRoot][fieldIndex].property.min}
  max={$form[fieldRoot][fieldIndex].property.max}
  step="1"
  value={$form[fieldRoot][fieldIndex][fieldKey]}
  onchange={(e) => {
    e.preventDefault();
    form.update(($form) => {
      $form[fieldRoot][fieldIndex][fieldKey] = e.target.value;
      return $form;
    });
  }} />
<div class="flex w-full justify-between px-2 text-xs">
  <span>{$form[fieldRoot][fieldIndex].property.min}</span>
  <span>❘</span>
  <span>|</span>
  <span>❘</span>
  <span>{$form[fieldRoot][fieldIndex].property.max}</span>
</div>
<!-- <ErrorLabel errors={$errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} /> -->
