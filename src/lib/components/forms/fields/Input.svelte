<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import FormInput from '../elements/Input.svelte';
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

// STATE : LOCAL
let inputValue = $state('');
let isGenAI = $state(false);

// EFFECT : SYNC WITH FORM
$effect(() => {
  const formValues = getValues(
    $form,
    field,
    languageTag,
    fieldRoot,
    fieldIndex,
    fieldKey
  );
  if (formValues) {
    inputValue = formValues.value;
    isGenAI = formValues.isGenAI;
  }
  console.log($form.properties[0].propertyValueId);
});

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, languageTag)
);

// HANDLERS
function handleChange() {
  updateForm(
    form,
    field,
    languageTag,
    fieldRoot,
    fieldIndex,
    fieldKey,
    inputValue,
    isGenAI
  );
}
</script>

<label class="form-control w-full" for={id} aria-label={field.label}>
  <!-- {#if fieldDiscriminator !== 'specifier'} -->
  <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
  <!-- {/if} -->
  <div
    class="group relative rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    <FormInput
      bind:value={inputValue}
      bind:isGenAI
      {id}
      {languageTag}
      {...field}
      onchange={handleChange} />
  </div>
  <ErrorLabel {errors} {field} {languageTag} {fieldRoot} {fieldIndex} {fieldKey} />
</label>
