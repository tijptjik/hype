<script lang="ts">
import FormTextArea from '$lib/components/forms/elements/Textarea.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
import { getValues, updateForm, getId } from '$lib/index';
// TYPES
import type { FieldPropsExtended, FieldDiscriminator, Locale } from '$lib/types';

// STATE : PROPS
let {
  locale,
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
  getValues($form, field, locale, fieldRoot, fieldIndex, fieldKey) || {
    value: '',
    isGenAI: false
  }
);

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, locale)
);
</script>

{#if !field.isTranslated && locale !== 'core' && locale !== 'en'}
  <!-- SPACER -->
  <div class="h-[74px] w-full rounded-lg bg-neutral bg-opacity-10"></div>
{:else}
  <label class="form-control w-full">
    <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
    <div
      class="relative rounded-lg border-none bg-neutral pl-0 pr-3  focus-within:outline-neutral-500">
      <FormTextArea
        bind:value={fieldValues.value as string}
        bind:isGenAI={fieldValues.isGenAI as boolean}
        {id}
        {locale}
        {...field}
        onchange={() =>
          updateForm(
            form,
            field,
            locale as Locale,
            fieldRoot,
            fieldIndex,
            fieldKey,
            fieldValues.value as string,
            false
          )} />
    </div>
    <ErrorLabel {errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} />
  </label>
{/if}
