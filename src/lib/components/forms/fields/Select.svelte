<script lang="ts">
import { getValues, updateForm, getId } from '$lib/index';
// COMPONENTS
import Select from '$lib/components/forms/elements/Select.svelte';
import ErrorLabel from '$lib/components/forms/labels/Error.svelte';
import FieldLabel from '$lib/components/forms/labels/Field.svelte';
// TYPES
import type {
  FieldPropsExtended,
  FieldDiscriminator,
  LocaleExtended
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
}: FieldPropsExtended & {
  fieldDiscriminator: FieldDiscriminator;
  locale: LocaleExtended;
} = $props();

// STATE : FORM
let { form, constraints, errors } = fieldProps.form;

let fieldValues = $derived(
  getValues($form, field, locale, fieldRoot, fieldIndex, fieldKey) || {
    value: ''
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
    <!-- {#if fieldDiscriminator !== 'specifier'} -->
    <FieldLabel {field} {fieldRoot} {fieldIndex} {fieldKey} {constraints} />
    <!-- {/if} -->
    <div class="flex items-center gap-2 rounded-lg bg-glass-100 pl-2 pr-1">
      <Select
        bind:value={fieldValues.value as string}
        {id}
        values={field.values}
        {locale}
        {...field}
        onchange={(e) => {
          const newValue = (e.target as HTMLSelectElement).value;
          updateForm(
            form,
            field,
            locale,
            fieldRoot,
            fieldIndex,
            fieldKey,
            newValue,
            false // Set to false when human edits the field
          );
        }} />
    </div>
    <ErrorLabel {errors} {field} {locale} {fieldRoot} {fieldIndex} {fieldKey} />
  </label>
{/if}
