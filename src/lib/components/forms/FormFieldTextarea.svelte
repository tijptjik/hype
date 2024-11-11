<script lang="ts">
import Form from 'sveltekit-superforms';
import FormTextArea from './FormTextArea.svelte';
import ErrorLabel from '$lib/components/forms/FormErrorLabel.svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { ResourceType, FalsableRef, FalsableFacetType, FieldDiscriminator } from '$lib/types';
import type { Writable } from 'svelte/store';
import type { LanguageTag, Key, FormFieldExtendedDefinition } from '$lib/types';

export const name = 'FieldTextarea';

// TYPES
type Props = {
  resourceType: ResourceType;
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

let {
  resourceType,
  entity,
  facet,
  languageTag = 'core',
  fieldId,
  field,
  fieldIndex,
  fieldDiscriminator,
  fieldKey,
  form,
  constraints,
  errors
}: Props = $props();

const isGenAI = (fieldId: string) => {
  if (languageTag == 'core') {
    return false;
  } else if (resourceType === 'feature') {
    if (languageTag == 'en') {
      return $form.properties[`${fieldId}Gen`] === true;
    } else {
      return $form.properties[`${fieldId}Gen_${languageTag}`] === true;
    }
  } else {
    if (languageTag === 'en') {
      return $form[`${fieldId}Gen`] === true;
    } else {
      return $form.translations[languageTag][`${fieldId}Gen`] === true;
    }
  }
};
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
          {$constraints?.[fieldId]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    <div
      class="relative flex items-baseline gap-2 rounded-lg border-none bg-neutral pl-0 pr-3 outline outline-1 outline-black focus-within:outline-neutral-500">
      {#if field.isArray}
        {@const id = `${fieldId}_${fieldDiscriminator}_${fieldIndex}_${fieldKey}_${languageTag}`}
        {#if languageTag === 'core' || languageTag === 'en'}
          <FormTextArea
            {id}
            placeholder={field.placeholder}
            bind:value={$form[fieldId][fieldIndex][fieldKey]}
            isGenAI={isGenAI(fieldId)}
            {languageTag} />
        {:else}
          <FormTextArea
            {id}
            placeholder={field.placeholder}
            bind:value={$form[fieldId][fieldIndex]['translations'][languageTag][fieldKey]}
            isGenAI={isGenAI(fieldId)}
            {languageTag} />
        {/if}
      {:else}
        {@const id = `${fieldId}_${languageTag}`}
        {#if resourceType !== 'feature'}
          {#if languageTag === 'core' || languageTag === 'en'}
            <FormTextArea
              {id}
              placeholder={field.placeholder}
              bind:value={$form[fieldId]}
              isGenAI={isGenAI(fieldId)}
              {languageTag} />
          {:else}
            <FormTextArea
              {id}
              placeholder={field.placeholder}
              bind:value={$form.translations[languageTag][fieldId]}
              isGenAI={isGenAI(fieldId)}
              {languageTag} />
          {/if}
        {:else if languageTag === 'core' || languageTag === 'en'}
          <FormTextArea
            {id}
            placeholder={field.placeholder}
            bind:value={$form.properties[fieldId]}
            isGenAI={isGenAI(fieldId)}
            {languageTag} />
        {:else}
          <FormTextArea
            {id}
            placeholder={field.placeholder}
            bind:value={$form.properties[`${fieldId}_${languageTag}`]}
            isGenAI={isGenAI(fieldId)}
            {languageTag} />
        {/if}
      {/if}
    </div>
    <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
  </label>
{/if}
