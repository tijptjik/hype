<script module>
const name = 'FieldSelect';
</script>

<script lang="ts">
import Form from 'sveltekit-superforms';
import Select from '$lib/components/forms/FormSelect.svelte';
import ErrorLabel from '$lib/components/forms/FormErrorLabel.svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type { FormFieldExtendedDefinition } from '$lib/types';
import type { ResourceType, FalsableRef, FalsableFacetType, FieldDiscriminator } from '$lib/types';
import type { Writable } from 'svelte/store';
import type { LanguageTag, Key } from '$lib/types';

// TYPES
type Props = {
  resourceType: ResourceType;
  entity: FalsableRef;
  facet: FalsableFacetType;
  languageTag: LanguageTag;
  fieldId: Key;
  field: FormFieldExtendedDefinition;
  form: Writable<Form>;
  constraints?: Writable<InputConstraints<Record<string, InputConstraint>>>;
  errors?: Writable<ValidationErrors<Record<string, string>>>;
  fieldDiscriminator?: FieldDiscriminator;
  customProperty?: string;
  values: string[];
  fieldIndex: number;
  fieldKey?: Key;
};

// STATE : PROPS
let {
  resourceType,
  languageTag = 'core',
  fieldId,
  field,
  form,
  constraints,
  errors,
  fieldDiscriminator,
  fieldIndex = 0,
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
        {#if field.isNested}
          {$constraints?.[fieldId]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
        {:else}
          {$constraints?.[fieldId]?.required ? '*' : ''}
        {/if}
      </span>
    </div>
    <div
      class="flex items-center gap-2 rounded-lg border-1 border-transparent bg-neutral pl-2 pr-3 focus-within:outline focus-within:outline-1 focus-within:outline-neutral-500">
      {#if field.isNested}
        {@const id = `${fieldId}_${fieldDiscriminator}_${fieldIndex}_${fieldKey}_${languageTag}`}
        {#if languageTag === 'core' || languageTag === 'en'}
          <Select
            {id}
            bind:value={$form[fieldId][fieldIndex][fieldKey as string]}
            values={field.values}
            {languageTag} />
        {:else}
          <Select
            {id}
            bind:value={$form[fieldId][fieldIndex]['translations'][languageTag][fieldKey as string]}
            values={field.values}
            {languageTag} />
        {/if}
      {:else}
        {@const id = `${fieldId}_${languageTag}`}
        {#if languageTag === 'core' || languageTag === 'en'}
          <Select {id} bind:value={$form[fieldId]} values={field.values} {languageTag} />
        {:else}
          <Select
            bind:value={$form.translations[languageTag][fieldId]}
            {id}
            values={field.values}
            {languageTag} />
        {/if}
      {/if}
    </div>
    <ErrorLabel errors={$errors} {field} {languageTag} {fieldId} {fieldIndex} {fieldKey} />
  </label>
{/if}
