<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import Select from '$lib/components/forms/elements/Select.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// TYPES
import type { FieldPropsExtended, FieldDiscriminator } from '$lib/types';

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

// STATE : INTERMEDIATE
let value = $state('');

// EFFECTS
$effect(() => {
  ({ value } = getValues($form, field, languageTag, fieldRoot, fieldIndex, fieldKey));
});

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, languageTag)
);
</script>

{#if !field.isTranslated && languageTag !== 'core' && languageTag !== 'en'}
  <!-- SPACER -->
  <div class="h-[74px] w-full rounded-lg bg-neutral bg-opacity-10"></div>
{:else}
  <label class="form-control w-full">
    <!-- {#if fieldDiscriminator !== 'specifier'} -->
    <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
    <!-- {/if} -->
    <div
      class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
      <Select
        bind:value
        {id}
        values={field.values}
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
            value
          )} />
    </div>
    <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
  </label>
{/if}
