<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import FormInput from '$lib/components/forms/elements/Input.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// TYPES
import type {
  FieldPropsExtended,
  FieldDiscriminator,
  Locale,
  LocaleExtended,
  Field
} from '$lib/types';

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

// EFFECT : SYNC WITH FORM
let fieldValues = $derived(
  getValues(
    $form as any,
    field,
    locale as LocaleExtended,
    fieldRoot,
    fieldIndex,
    fieldKey
  )
)!;

// STATE : LOCAL
let inputValue = $state('');
let isGenAI = $derived(fieldValues.isGenAI);

// STATE : DERIVED
let id = $derived(
  getId(
    field,
    fieldRoot,
    fieldIndex,
    fieldDiscriminator,
    fieldKey,
    locale as LocaleExtended
  )
);

function syncToForm(newValue: string, isGenAI: boolean) {
  updateForm(
    form,
    field,
    locale as Locale,
    fieldRoot,
    fieldIndex,
    fieldKey,
    newValue,
    isGenAI // Set to false when human edits the field
  );
}

// HANDLERS
function handleChange(newValue: string) {
  syncToForm(newValue, false);
}

function handleToggleGenAI(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  console.log('toggle genai');
  // isGenAI = !isGenAI;
  syncToForm(fieldValues.value as string, (isGenAI = !isGenAI));
}
</script>

<label class="form-control w-full" for={id} aria-label={field.label}>
  <FieldLabel
    {field}
    locale={locale as Locale}
    {fieldRoot}
    {fieldIndex}
    {fieldKey}
    {constraints}
    isTranslated={field.isTranslated} />
  <ErrorLabel
    {errors}
    {field}
    locale={locale as Locale}
    {fieldRoot}
    {fieldIndex}
    {fieldKey} />
  <div class="group relative">
    <!-- Input field with its background -->
    <div
      class="rounded-lg bg-glass-100 pl-2 pr-3 focus-within:ring-2 focus-within:ring-primary">
      <FormInput
        {id}
        bind:value={fieldValues.value as string}
        bind:isGenAI={fieldValues.isGenAI as boolean}
        locale={locale as Locale}
        {...field}
        onchange={handleChange}
        onToggleGenAI={handleToggleGenAI} />
    </div>
  </div>
</label>
