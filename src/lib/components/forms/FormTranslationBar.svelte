<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { Language } from '@steeze-ui/heroicons';
import { getTranslation } from '$lib/api/translation';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// Types
import type { FormField, ResourceType, FalsableRef, OrganisationForm, ProjectForm, LayerForm } from '$lib/types';
import SuperValidated from 'sveltekit-superforms';
// CONFIG
const allLanguages = [
  { code: 'en', label: 'EN' },
  { code: 'zh-hant', label: 'HK' },
  { code: 'zh-hans', label: 'CN' }
];

// TYPES
type Props = {
  languageTag: string;
  fields: FormField;
  entity: FalsableRef;
  resourceType: Exclude<ResourceType, 'feature'>;
};

// STATE
let {
  languageTag,
  fields,
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form } = getForm(resourceType, entity);


const languageOptions = $derived(allLanguages.filter((lang) => lang.code !== languageTag));

function translateFields(event: Event, sourceLang: string, targetLang: string) {
  event.preventDefault();
  
  // Step 1: Initialize sourceTexts array
  const sourceTexts: string[] = [];
  const sourceLangObj = sourceLang.toLowerCase() === 'en' ? $form : $form.translations[sourceLang];

  // Step 1: Lookup the sourceLang texts
  Object.keys(fields).forEach((key) => {
    sourceTexts.push(sourceLangObj[key]);
  });

  // Step 2: Translation API call
  const translatedTexts = getTranslation(sourceLang, targetLang, sourceTexts);

  // Step 3: Update the form with translated texts
  translatedTexts.forEach((translatedText, index) => {
        let field = Object.keys(fields)[index];
        if (targetLang.toLowerCase() === 'en') {
          form.update($form => {
            $form[field] = translatedText;
            $form[`${field}Gen`] = true;
            return $form;
          });
        } else {
          form.update($form => {
            $form.translations[targetLang][field] = translatedText;
            $form.translations[targetLang][`${field}Gen`] = true;
            return $form;
          });
        }
      });
}
</script>

<div class="flex items-center justify-between px-6 py-3 bg-base-200 rounded-b-xl">
  <div class="flex items-center gap-4">
    <Icon src={Language} class="h-6 w-6 text-primary" />
    <span class="text-sm text-base-content">TRANSLATE FROM</span>
  </div>
  <div class="flex gap-2">
    {#each languageOptions as { code, label }}
      <button
        class="btn btn-circle btn-primary text-base-content text-md font-normal"
        onclick={(e) => translateFields(e, code, languageTag)}>
        {label}
      </button>
    {/each}
  </div>
</div>
