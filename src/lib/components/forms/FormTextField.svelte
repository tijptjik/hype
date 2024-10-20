<script lang="ts">
import type { InputConstraints, SuperFormError } from 'sveltekit-superforms';
import Form from 'sveltekit-superforms';
import type { Component } from 'svelte';
import FormTextArea from './FormTextArea.svelte';

let {
  languageTag,
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
  constraints: InputConstraints<Record<string, unknown>>;
  errors: SuperFormError;
} = $props();
</script>

<label class="form-control w-full">
  <div class="label text-sm">
    <span class="label-text text-xs font-bold">{field.label}</span>
    <span class="label-text-alt text-xs font-bold">
      {$constraints[fieldId]?.required ? '*' : ''}
    </span>
  </div>
  <div class="flex items-baseline gap-2 rounded-lg bg-neutral pl-0 pr-3 relative outline outline-1 outline-black focus-within:outline-neutral-500 border-none">
    {#if languageTag === 'en'}
      <FormTextArea
        bind:value={$form[fieldId]}
        id={`${fieldId}_${languageTag}`}
        constraints={$constraints[fieldId]}
        isGenAI={$form[`${fieldId}Gen`]}
        {languageTag} />
    {:else}
      <FormTextArea
        bind:value={$form.translations[languageTag][fieldId]}
        id={`${fieldId}_${languageTag}`}
        constraints={$constraints[fieldId]}
        isGenAI={$form.translations[languageTag][`${fieldId}Gen`]}
        {languageTag} />
    {/if}
  </div>
  {#if $errors[fieldId]}
  <div class="label">
    <span class="label-text-alt text-error">Error</span>
      <span class="label-text-alt text-error">{$errors[fieldId]}</span>
    </div>
  {/if}
</label>
