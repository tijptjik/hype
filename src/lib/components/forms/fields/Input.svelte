<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import FormInput from '../elements/Input.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// TYPES
import type { FieldPropsExtended, FieldDiscriminator, Locale, LocaleExtended, Field } from '$lib/types';

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

// STATE : FORM
let { form, constraints, errors } = fieldProps.form;

// STATE : LOCAL
let inputValue = $state('');
let isGenAI = $state(false);

// EFFECT : SYNC WITH FORM
let fieldValues = $derived(
  getValues($form as any, field as unknown as Field, locale as LocaleExtended, fieldRoot, fieldIndex, fieldKey)
)!;

// STATE : DERIVED
let id = $derived(
  getId(field, fieldRoot, fieldIndex, fieldDiscriminator, fieldKey, locale as LocaleExtended)
);

// HANDLERS
function handleChange() {
  updateForm(
    form,
    field,
    locale as Locale,
    fieldRoot,
    fieldIndex,
    fieldKey,
    fieldValues.value as string,
    false // Set to false when human edits the field
  );
}
</script>

<label class="form-control w-full" for={id} aria-label={field.label}>
  <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
  <div
    class="group relative rounded-lg bg-neutral pl-2 pr-3">
    <FormInput
      bind:value={fieldValues.value as string}
      bind:isGenAI={fieldValues.isGenAI as boolean}
      {id}
      locale={locale as Locale}
      {...field}
      onchange={handleChange} />
  </div>
  <ErrorLabel {errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} />
</label>
