<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import FormInput from '../elements/Input.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FieldPropsExtended, FacetRouter, FieldDiscriminator } from '$lib/types';

// STATE : PROPS
let {
  languageTag,
  fieldRoot,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  field,
  ...fieldProps
}: FieldPropsExtended & { fieldDiscriminator: FieldDiscriminator } = $props();

// STATE : FORM
let { form, constraints, errors } = fieldProps.form;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as FacetRouter;

// STATE : INTERMEDIATE
let value = $state('');
let isGenAI = $state(false);

// EFFECTS
$effect(() => {
  ({ value, isGenAI } = getValues(
    $form,
    field,
    languageTag,
    fieldRoot,
    fieldIndex,
    fieldKey
  ));
});

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, languageTag)
);
</script>

<label class="form-control w-full" for={id} aria-label={field.label}>
  <!-- {#if fieldDiscriminator !== 'specifier'} -->
  <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
  <!-- {/if} -->
  <div
    class="group relative rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    <FormInput
      bind:value
      bind:isGenAI
      {id}
      {languageTag}
      {...field}
      onchange={() =>
        updateForm(
          form,
          field,
          languageTag,
          fieldRoot,
          fieldIndex,
          fieldKey,
          value,
          false
        )} />
  </div>
  <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
</label>
