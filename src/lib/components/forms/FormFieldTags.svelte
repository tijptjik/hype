<script lang="ts">
import Form from 'sveltekit-superforms';
import Tags from '$lib/components/forms/FormTags.svelte';
import ErrorLabel from '$lib/components/forms/FormErrorLabel.svelte';

// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { Component } from 'svelte';
import type {
  ResourceType,
  FalsableRef,
  FalsableFacetType,
  FieldDiscriminator,
  LanguageTag,
  TargetLang
} from '$lib/types';
import type { Writable } from 'svelte/store';
import type { FormFieldDefinition, Key } from '$lib/types';
// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldDefinition;
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
  fieldDiscriminator?: FieldDiscriminator;
  customProperty?: string;
  fieldIndex: number;
  fieldKey?: Key;
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
  fieldDiscriminator,
  customProperty,
  fieldIndex,
  fieldKey
}: Props = $props();
</script>

{#if !field.isTranslated && languageTag !== 'core' && languageTag !== 'en'}
  <!-- SPACER -->
  <div class="h-[74px] w-full rounded-lg bg-neutral bg-opacity-10"></div>
{:else}
  <label class="form-control w-full">
    <div class="label text-sm">
      <span class="label-text text-xs font-bold">{field.label}</span>
      <span class="label-text-alt text-xs font-bold">
        {#if facet === 'fields'}
          <!-- TODO - When https://github.com/ciscoheat/sveltekit-superforms/issues/447 is implemented in v3 revisit this and obtain the constraint from the constraint object -->
          *
        {:else}
          {$constraints?.[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    <div
      class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
      <!-- TODO Add Guard for field.isNested -->
      <!-- {#if field.isNested} -->
      <Tags
        id={`${fieldId}_${fieldDiscriminator}_${customProperty}_${fieldKey}`}
        bind:tags={$form[fieldId][fieldIndex][fieldKey as string]} />
      <!-- {/if} -->
    </div>
    <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
  </label>
{/if}
