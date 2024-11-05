<script lang="ts">
import Form from 'sveltekit-superforms';
import FormInput from './FormInput.svelte';
import ErrorLabel from '$lib/components/forms/FormErrorLabel.svelte';

// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { Component } from 'svelte';
import type { ResourceType, FalsableRef, FalsableFacetType, CustomPropertyType } from '$lib/types';

// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: string;
  fieldId: string;
  field: {
    label: string;
    component: Component;
  };
  form: Form;
  constraints?: InputConstraints<Record<string, InputConstraint>>;
  errors?: ValidationErrors<Record<string, string>>;
  customPropertyType?: CustomPropertyType;
  customProperty?: string;
  customPropertyKey?: string;
  inputType?: 'text' | 'number' | 'email' | 'password';
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
  customPropertyKey,
  inputType = 'text'
}: Props = $props();

const isError = (languageTag: string, fieldId: string) =>
  (languageTag === 'core' && $errors[fieldId]) ||
  (languageTag === 'en' && $errors[fieldId]) ||
  $errors.translations?.[languageTag]?.[fieldId];

const getError = (languageTag: string, fieldId: string) => {
  if (facet === 'config') {
    return $errors[fieldId][customPropertyType][customProperty][customPropertyKey];
  } else if (languageTag === 'core') {
    return $errors[fieldId];
  } else if (languageTag === 'en') {
    return $errors[fieldId];
  } else {
    return $errors.translations?.[languageTag]?.[fieldId];
  }
};

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

<label class="form-control w-full">
  <div class="label text-sm">
    <span class="label-text text-xs font-bold">{field.label}</span>
    <span class="label-text-alt text-xs font-bold">
      {#if facet === 'config'}
        <!-- TODO - When https://github.com/ciscoheat/sveltekit-superforms/issues/447 is implemented in v3 revisit this and obtain the constraint from the constraint object -->
        *
      {:else}
        {$constraints[fieldId]?.required ? '*' : ''}
      {/if}
    </span>
  </div>
  <div
  class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
  {#if facet == 'config'}
      <FormInput
        bind:value={$form[fieldId][customPropertyType][customProperty][customPropertyKey]}
        id={`${fieldId}_${customPropertyType}_${customProperty}_${customPropertyKey}`}
        {inputType} />
    {:else if resourceType !== 'feature'}
      {#if languageTag === 'core' || languageTag === 'en'}
        <FormInput
          bind:value={$form[fieldId]}
          id={`${fieldId}_${languageTag}`}
          isGenAI={isGenAI(fieldId)}
          {languageTag}
          {inputType} />
      {:else}
        <FormInput
          bind:value={$form.translations[languageTag][fieldId]}
          id={`${fieldId}_${languageTag}`}
          isGenAI={isGenAI(fieldId)}
          {languageTag}
          {inputType} />
      {/if}
    {:else if languageTag === 'core' || languageTag === 'en'}
      <FormInput
        bind:value={$form.properties[fieldId]}
        id={`${fieldId}_${languageTag}`}
        isGenAI={isGenAI(fieldId)}
        {languageTag}
        {inputType} />
    {:else}
      <FormInput
        bind:value={$form.properties[`${fieldId}_${languageTag}`]}
        id={`${fieldId}_${languageTag}`}
        isGenAI={isGenAI(fieldId)}
        {languageTag}
        {inputType} />
    {/if}
  </div>
  <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
</label>
