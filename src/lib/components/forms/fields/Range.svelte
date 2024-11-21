<script lang="ts">
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FieldProps, EntityRouter } from '$lib/types';

let { fieldRoot, fieldIndex, fieldKey, ...fieldProps }: FieldProps = $props();

// STATE : FORM
let { form } = fieldProps.form;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;
</script>

<!-- TODO: Make into an actual field instead of an element-->

<input
  type="range"
  class="range range-primary"
  min={$form[fieldRoot][fieldIndex].property.min}
  max={$form[fieldRoot][fieldIndex].property.max}
  step="1"
  bind:value={$form[fieldRoot][fieldIndex][fieldKey]} />
<div class="flex w-full justify-between px-2 text-xs">
  <span>{$form[fieldRoot][fieldIndex].property.min}</span>
  <span>❘</span>
  <span>|</span>
  <span>❘</span>
  <span>{$form[fieldRoot][fieldIndex].property.max}</span>
</div>
<!-- <ErrorLabel errors={$errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} /> -->
