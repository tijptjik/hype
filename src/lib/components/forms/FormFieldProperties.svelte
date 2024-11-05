<script lang="ts">
import { nanoid } from 'nanoid';
import Form from 'sveltekit-superforms';
import { Icon } from '@steeze-ui/svelte-icon';
import { Trash, ExclamationTriangle } from '@steeze-ui/heroicons';
import { scale } from 'svelte/transition';
import { flip } from 'svelte/animate';
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types';
import { getFieldComponent } from '$lib';
// COMPONENTS
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TagsField from '$lib/components/forms/FormFieldTags.svelte';
import SelectField from '$lib/components/forms/FormFieldSelect.svelte';
import UsersField from '$lib/components/forms/FormFieldUsers.svelte';
import RangeField from '$lib/components/forms/FormFieldRange.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import CustomField from '$lib/components/forms/FormFieldProperties.svelte';
import TranslationBar from '$lib/components/forms/FormTranslationBar.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { InputConstraints, InputConstraint, ValidationErrors } from 'sveltekit-superforms';
import type {
  ResourceType,
  FalsableRef,
  FormField,
  FalsableFacetType,
  FieldDiscriminator,
  FormFieldExtendedDefinition,
  FieldComponentType
} from '$lib/types';

// CONFIG
const sourceLanguageTag = 'en';
const languageTags = [sourceLanguageTag, 'zh-hant', 'zh-hans'];

// Add IntermediateValue type
type IntermediateValue = {
  id: string;
  rank: number;
  en: string;
  'zh-hans': string;
  'zh-hant': string;
};

type Props = {
  fieldId: string;
  fields: FormFieldExtendedDefinition[];
  fieldIndex: number;
  fieldDiscriminator: FieldDiscriminator;
  constraints: InputConstraints<Record<string, InputConstraint>>;
  errors: ValidationErrors<Record<string, string>>;
  actionProps: {
    searchMode: boolean;
    removeMode: boolean;
    confirmationMode: boolean;
    confirmingId?: string;
  };
  actions: Record<string, () => void>;
  facet: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType
};

// STATE : PROPS
let {
  fieldId,
  fieldDiscriminator,
  fieldIndex,
  fields,
  constraints,
  errors,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false,
    confirmationMode: false,
    confirmingId: undefined
  }),
  facet,
  entity,
  resourceType,
  actions
}: Props = $props();

const complexValues = $state([]);

// CONTEXT
const { form, validate } = getForm(resourceType, entity);

// UTILS
function isValidJavascriptKey(key: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

// $inspect(JSON.stringify($form, null, 2));
$inspect('fieldId', fieldId);
$inspect('FIELDS', fields);

// Add helper function to reset modes
function resetModes() {
  actionProps.removeMode = false;
  actionProps.confirmationMode = false;
  actionProps.confirmingId = undefined;
}

// Add helper to check if current item is being confirmed
function isConfirming(itemId: string) {
  return actionProps.confirmationMode && actionProps.confirmingId === itemId;
}

// Add function to get values for a specific language
function getValuesForLanguage(languageTag: string): string[] {
  return complexValues.sort((a, b) => a.rank - b.rank).map(v => v[languageTag]);
}

// Add function to update value for a specific language
function updateValueForLanguage(id: string, languageTag: string, value: string) {
  const newValues = complexValues.map(v => 
    v.id === id ? { ...v, [languageTag]: value } : v
  );
  onComplexValueChange?.(newValues);
}
</script>

<div class="relative mx-auto w-32 rounded-lg bg-base-100">
  <h2 class="mt-4 py-2 text-center text-xl font-bold">
    {$form[fieldId][fieldIndex].label}
  </h2>
</div>
<div
  class="relative my-4 grid min-h-32 grid-cols-1 gap-4 bg-base-100 bg-opacity-30 p-4 sm:grid-cols-2 xl:grid-cols-3">
  {#if actionProps.removeMode && !isConfirming($form[fieldId][fieldIndex].id)}
    <div
      class="absolute right-0 top-0 h-full w-full rounded-lg bg-base-200 opacity-50 hover:opacity-70"
      onclick={() => {
        actionProps.confirmationMode = true;
        actionProps.confirmingId = $form[fieldId][fieldIndex].id;
      }}>
      <Icon src={Trash} class="m-auto w-8 shrink-0 stroke-current opacity-100" />
    </div>
  {/if}
  
  {#if isConfirming($form[fieldId][fieldIndex].id)}
    <div class="absolute right-0 top-0 z-10 flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg bg-base-200 bg-opacity-80">
      <Icon src={ExclamationTriangle} class="w-12 h-12 shrink-10 stroke-current opacity-100" />
      <p class="text-xl font-bold text-error w-1/3 text-center">
        This is a destructive action.
      </p>
      <p class="text-xl text-neutral-content w-1/3 text-center">
        Deleting this field eliminates the associated filter control and entries in the info panel.
      </p>
      <p class="text-xl text-neutral-content w-1/3 text-center"> This action is irreversible.</p>
      <div class="flex gap-4">
        <button 
          class="btn btn-outline" 
          onclick={resetModes}>
          Cancel
        </button>
        <button 
          class="btn btn-error" 
          onclick={(e) => {
            actions.remove(e, $form[fieldId][fieldIndex].id);
            resetModes();
          }}>
          DESTROY
        </button>
      </div>
    </div>
  {/if}

  {#each languageTags as languageTag}
    <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
      <div class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4">
        {#each Object.entries(fields) as [fieldKey, field], propIndex (fieldKey)}
          {@const Field = getFieldComponent(field.component)}
          {#if !field.showForComponent || (field.showForComponent && field.showForComponent.includes($form[fieldId][fieldIndex].component as string))}
            {#if field.component === 'ComplexField'}
              <Field
                {resourceType}
                {entity}
                {facet}
                {languageTag}
                {fieldId}
                {fieldIndex}
                {fieldDiscriminator}
                {fieldKey}
                {field}
                {form}
                {constraints}
                {errors}
                values={getValuesForLanguage(languageTag)}
                onValueChange={(value) => updateValueForLanguage(field.id, languageTag, value)} />
            {:else}
              <Field
                {resourceType}
                {entity}
                {facet}
                {languageTag}
                {fieldId}
                {fieldIndex}
                {fieldDiscriminator}
                {fieldKey}
                {field}
                {form}
                {constraints}
                {errors} />
            {/if}
          {/if}
        {/each}
      </div>
      <div
        class="h-2 w-full transition-[height] delay-700 duration-300 group-focus-within:h-0 group-hover:h-0">
      </div>
      <div
        class="ease-in-quad max-h-0 overflow-hidden transition-[max-height] delay-700 duration-300 group-focus-within:max-h-32 group-hover:max-h-32">
        <!-- <TranslationBar {languageTag} {fields} {entity} {resourceType} /> -->
      </div>
    </div>

  {/each}
</div>
