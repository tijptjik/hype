<script lang="ts">
import type { InputConstraints, InputConstrait, ValidationErrors } from 'sveltekit-superforms';
import Form from 'sveltekit-superforms';
import type { Component } from 'svelte';
import FormInput from './FormInput.svelte';

let {
  languageTag = 'core',
  fieldId,
  field,
  form,
  constraints,
  errors
}: {
  languageTag: string;
  fieldId: string;
  field: {
    label: string;
    component: Component;
  };
  form: Form;
  constraints: InputConstraints<Record<string, InputConstraint>>;
  errors: ValidationErrors<Record<string, string>>;
} = $props();

const isError = (languageTag: string, fieldId: string) => (
  (languageTag === 'core' && $errors[fieldId]) ||
  (languageTag === 'en' && $errors[fieldId]) ||
  ($errors.translations?.[languageTag]?.[fieldId])
)
const getError = (languageTag: string, fieldId: string) => {
  if (languageTag === 'core') {
    return $errors[fieldId]
  } else if (languageTag === 'en') {
    return $errors[fieldId]
  } else {
    return $errors.translations?.[languageTag]?.[fieldId]
  }
}

</script>

<label class="form-control w-full">
  <div class="label text-sm">
    <span class="label-text text-xs font-bold">{field.label}</span>
    <span class="label-text-alt text-xs font-bold">
      {$constraints[fieldId]?.required ? '*' : ''}
    </span>
  </div>
  <div class="flex items-center gap-2 rounded-lg bg-neutral pl-2 pr-3 border-1 border-transparent focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
    {#if languageTag === 'core'}
      <FormInput
        bind:value={$form[fieldId]}
        id={`${fieldId}`}
        isGenAI={false}
        {languageTag}
      />
    {:else if languageTag === 'en'}
      <FormInput
        bind:value={$form[fieldId]}
        id={`${fieldId}_${languageTag}`}
        isGenAI={$form[`${fieldId}Gen`]}
        {languageTag} />
    {:else}
      <FormInput
        bind:value={$form.translations[languageTag][fieldId]}
        id={`${fieldId}_${languageTag}`}
        isGenAI={$form.translations[languageTag][`${fieldId}Gen`]}
        {languageTag} />
    {/if}
  </div>
  {#if isError(languageTag, fieldId)}
  <div class="label">
    <span class="label-text-alt text-error"></span>
      <span class="label-text-alt text-error">{getError(languageTag, fieldId)}</span>
    </div>
  {/if}
</label>
