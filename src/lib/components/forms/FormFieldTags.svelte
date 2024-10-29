<script lang="ts">
import Form from 'sveltekit-superforms';
import Tags from '$lib/components/forms/FormTags.svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { Component } from 'svelte';
import type { ResourceType, FalsableRef, FalsableFacetType, CustomPropertyType, LanguageTag, TargetLang } from '$lib/types';
import type { Writable } from 'svelte/store';

// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: string;
  field: {
    label: string;
    component: Component;
  };
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
  customPropertyType?: CustomPropertyType;
  customProperty?: string;
  customPropertyKey?: string;
};

// STATE : PROPS
let {
  resourceType,
  entity,
  facet,
  languageTag = 'core',
  fieldId,
  field,
  form,
  constraints,
  errors,
  customPropertyType,
  customProperty,
  customPropertyKey
}: Props = $props();

const isError = (languageTag: LanguageTag, fieldId: string) =>
  (languageTag === 'core' && $errors?.[fieldId]) ||
  (languageTag === 'en' && $errors?.[fieldId]) ||
  $errors?.translations?.[languageTag as TargetLang]?.[fieldId];

const getError = (languageTag: string, fieldId: string) => {
  if (facet === 'config') {
    return $errors?.[fieldId]?.[customPropertyType as CustomPropertyType][customProperty as string][customPropertyKey as string];
  } else if (languageTag === 'core') {
    return $errors?.[fieldId];
  } else if (languageTag === 'en') {
    return $errors?.[fieldId];
  } else {
    return $errors?.translations?.[languageTag]?.[fieldId];
  }
};
</script>

<label class="form-control w-full">
  <div class="label text-sm">
    <span class="label-text text-xs font-bold">{field.label}</span>
    <span class="label-text-alt text-xs font-bold">
      {#if facet === 'config'}
        <!-- TODO - When https://github.com/ciscoheat/sveltekit-superforms/issues/447 is implemented in v3 revisit this and obtain the constraint from the constraint object -->
        *
      {:else}
        {$constraints?.[fieldId]?.required ? '*' : ''}
      {/if}
    </span>
  </div>
  <div
    class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    {#if facet == 'config'}
      <Tags
        id={`${fieldId}_${customPropertyType}_${customProperty}_${customPropertyKey}`}
        bind:tags={$form[fieldId][customPropertyType as CustomPropertyType][customProperty as string][customPropertyKey as string]} />
    {/if}
  </div>
  {#if isError(languageTag, fieldId)}
    <div class="label">
      <span class="label-text-alt text-error"></span>
      <span class="label-text-alt text-error">{getError(languageTag, fieldId)}</span>
    </div>
  {/if}
</label>
