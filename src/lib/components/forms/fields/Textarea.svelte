<script lang="ts">
import FormTextArea from '$lib/components/forms/elements/Textarea.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import { getValues, updateForm, getId } from '$lib/index';
// TYPES
import type { FieldPropsExtended } from '$lib/types';

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

// STATE : CONTEXT :: FORM
let { form, constraints, errors } = fieldProps.form;

let fieldValues = $derived(
  getValues($form, field, languageTag, fieldRoot, fieldIndex, fieldKey) || {
    value: '',
    isGenAI: false
  }
);

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
    <div class="label text-sm">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if field.isArray}
          {$constraints?.[fieldRoot]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldRoot]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    <div
      class="relative rounded-lg border-none bg-neutral pl-0 pr-3 outline outline-1 outline-black focus-within:outline-neutral-500">
      <FormTextArea
        bind:value={fieldValues.value as string}
        bind:isGenAI={fieldValues.isGenAI as boolean}
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
            fieldValues.value as string,
            false
          )} />
    </div>
    <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
  </label>
{/if}
