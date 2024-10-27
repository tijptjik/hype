<script lang="ts">
import Form from 'sveltekit-superforms';
import FormInput from './FormInput.svelte';
// TYPES
import type { InputConstraints, ValidationErrors } from 'sveltekit-superforms';
import type { Component } from 'svelte';
import type { ResourceType, FalsableRef } from '$lib/types';

let {
  resourceType,
  entity,
  languageTag = 'core',
  fieldId,
  field,
  form,
  constraints,
  errors
}: {
  resourceType: ResourceType;
  entity: FalsableRef;
  languageTag: string;
  fieldId: string;
  field: {
    label: string;
    component: Component;
  };
  form: Form;
  constraints: InputConstraints<Record<string, InputConstraints>>;
  errors: ValidationErrors<Record<string, string>>;
} = $props();

const isError = (languageTag: string, fieldId: string) =>
  (languageTag === 'core' && $errors[fieldId]) ||
  (languageTag === 'en' && $errors[fieldId]) ||
  $errors.translations?.[languageTag]?.[fieldId];
const getError = (languageTag: string, fieldId: string) => {
  if (languageTag === 'core') {
    return $errors[fieldId];
  } else if (languageTag === 'en') {
    return $errors[fieldId];
  } else {
    return $errors.translations?.[languageTag]?.[fieldId];
  }
};

const getField = (fieldId: string) => {
  if (fieldId.endsWith('Gen') && languageTag === 'core') {
    return false;
  } else if (resourceType !== 'feature') {
    if (languageTag === 'core') {
      return $form[fieldId];
    } else if (languageTag === 'en') {
      return $form[fieldId];
    } else {
      return $form.translations[languageTag][fieldId];
    }
  } else {
    if (languageTag === 'core') {
      return $form[fieldId];
    } else if (languageTag === 'en') {
      return $form[fieldId];
    } else {
      return $form.translations[languageTag][fieldId];
    }
  }
};

let fieldValue = $state(getField(fieldId));

const mapIdToField = (id: string) => {
  Object.entries(f).forEach(([key, value]) => {
    if (key.endsWith('Gen') && id === key.replace('Gen', '')) {
      return true;
    }
  });
  return false;
};
</script>

<label class="form-control w-full">
  <div class="label text-sm">
    <span class="label-text text-xs font-bold">{field.label}</span>
    <span class="label-text-alt text-xs font-bold">
      {$constraints[fieldId]?.required ? '*' : ''}
    </span>
  </div>
  <div
    class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    <FormInput
      bind:value={fieldValue}
      id={`${fieldId}_${languageTag}`}
      isGenAI={`${fieldValue}Gen`}
      {languageTag} />
  </div>
  {#if isError(languageTag, fieldId)}
    <div class="label">
      <span class="label-text-alt text-error"></span>
      <span class="label-text-alt text-error">{getError(languageTag, fieldId)}</span>
    </div>
  {/if}
</label>
