<script lang="ts">
import Form from 'sveltekit-superforms';
import FormInput from './FormInput.svelte';
import ErrorLabel from '$lib/components/forms/FormErrorLabel.svelte';

// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { FormFieldExtendedDefinition } from '$lib/types';
import type { FalsableRef, FalsableFacetType, FieldDiscriminator } from '$lib/types';
import type { Writable } from 'svelte/store';
import type { LanguageTag, Key } from '$lib/types';

// TYPES
type Props = {
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldExtendedDefinition;
  fieldIndex: number;
  fieldDiscriminator?: FieldDiscriminator;
  fieldKey?: Key;
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
};

// STATE : PROPS
let {
  languageTag = 'core',
  fieldId,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  field,
  form,
  constraints,
  errors
}: Props = $props();

const getId = () => {
  if (field.isNested) {
    return `${fieldId}_${fieldDiscriminator}_${fieldIndex}_${fieldKey}_${languageTag}`;
  } else if (fieldDiscriminator === 'specifier') {
    return `${fieldId}_${fieldIndex}_${fieldKey}_${languageTag}`;
  } else {
    return `${fieldId}_${languageTag}`;
  }
};
</script>

{#if !field.isTranslated && languageTag !== 'core' && languageTag !== 'en'}
  <!-- SPACER -->
  <div class="h-[74px] w-full rounded-lg bg-neutral bg-opacity-10"></div>
{:else}
<label class="form-control w-full">
  {#if fieldDiscriminator !== 'specifier'}
    <div class="label text-sm">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if field.isNested}
          {$constraints?.[fieldId]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    {/if}
    <div
      class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
      {#if field.isNested}
        {#if languageTag === 'core' || languageTag === 'en'}
          <FormInput
            bind:value={$form[fieldId][fieldIndex][fieldKey]}
            id={getId()}
            {languageTag}
            {...field}
            isGenAI={$form[fieldId][fieldIndex][`${fieldKey}Gen`]} />
        {:else}
          <FormInput
            bind:value={$form[fieldId][fieldIndex]['translations'][languageTag][fieldKey]}
            id={getId()}
            {languageTag}
            {...field}
            isGenAI={$form[fieldId][fieldIndex]['translations'][languageTag][`${fieldKey}Gen`]} />
        {/if}
      {:else if (languageTag === 'core' || languageTag === 'en') && fieldDiscriminator !== 'specifier'}
        <FormInput
          bind:value={$form[fieldId]}
          id={getId()}
          {languageTag}
          {...field}
          isGenAI={$form[`${fieldId}Gen`]} />
      {:else if fieldDiscriminator === 'specifier'}
        <FormInput
          bind:value={$form[fieldId][fieldIndex][fieldKey]}
          id={getId()}
          {languageTag}
          {...field}
          isGenAI={$form[`${fieldId}Gen`]} />
      {:else}
        <FormInput
          bind:value={$form.translations[languageTag][fieldId]}
          id={getId()}
          {languageTag}
          {...field}
          isGenAI={$form.translations[languageTag][`${fieldId}Gen`]} />
      {/if}
    </div>
    <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
  </label>
{/if}
