<script lang="ts">
  // CONTEXT
  import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FieldProps } from '$lib/types';

let {
  fieldRoot,
  fieldIndex,
  fieldKey,
  resource,
  entity
}: FieldProps = $props();

let { form } = getForm(resource, entity);

</script>

<!-- TODO: Make into an actual field instead of an element-->

<input
  type="range"
  class="range range-primary"
  min={$form[fieldRoot][fieldIndex].property.min}
  max={$form[fieldRoot][fieldIndex].property.max}
  step="1"
  bind:value={$form[fieldRoot][fieldIndex][fieldKey]}
 />
 <div class="flex w-full justify-between px-2 text-xs">
  <span>{$form[fieldRoot][fieldIndex].property.min}</span>
  <span>❘</span>
  <span>|</span>
  <span>❘</span>
  <span>{$form[fieldRoot][fieldIndex].property.max}</span>
</div>
<!-- <ErrorLabel errors={$errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} /> -->
