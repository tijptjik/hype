<script lang="ts">
import Form from 'sveltekit-superforms';
import FormInput from '../elements/Input.svelte';
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { FieldPropsExtended } from '$lib/types';

// STATE : PROPS
let {
  resource,
  entity,
  languageTag,
  fieldRoot,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  field
}: FieldPropsExtended = $props();

// STATE : INTERMEDIATE
let value = $state('');
let isGenAI = $state(false);

// STATE : CONTEXT
let { form, constraints, errors } = getForm(resource, entity);

// EFFECTS
$effect(() => {
  ({ value, isGenAI } = getValues($form, field, languageTag, fieldRoot, fieldIndex, fieldKey));
});

// STATE : DERIVED
let id = $derived(getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, languageTag));
</script>

<label class="form-control w-full" for={id} aria-label={field.label}>
  <!-- {#if fieldDiscriminator !== 'specifier'} -->
    <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
  <!-- {/if} -->
  <div
    class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    <FormInput
      bind:value
      bind:isGenAI
      {id}
      {languageTag}
      {...field}
      onchange={() =>
        updateForm(form, field, languageTag, fieldRoot, fieldIndex, fieldKey, value, isGenAI)} />
  </div>
  <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
</label>
