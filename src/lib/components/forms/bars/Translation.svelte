<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Language } from '@steeze-ui/heroicons';
import { getTranslation } from '$lib/api/translation';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// Types
import type { BarProps, EntityRouter, Resource } from '$lib/types';

// CONFIG
const allLanguages = [
  { code: 'en', label: 'EN' },
  { code: 'zh-hant', label: 'HK' },
  { code: 'zh-hans', label: 'CN' }
];

// STATE : PROPS
const { fields, languageTag, ...barProps }: BarProps = $props();
let { form } = barProps.form;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

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
      form.update(($form) => {
        $form[field] = translatedText;
        $form[`${field}Gen`] = true;
        return $form;
      });
    } else {
      form.update(($form) => {
        $form.translations[targetLang][field] = translatedText;
        $form.translations[targetLang][`${field}Gen`] = true;
        return $form;
      });
    }
  });
}
</script>

<div
  class="overflow-hidden transition-opacity opacity-0 delay-300 duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
>
  <div class="flex items-center justify-between rounded-b-xl bg-base-200 px-6 py-3">
    <div class="flex items-center gap-4">
      <Icon src={Language} class="h-6 w-6 text-primary" />
      <span class="text-sm text-base-content">TRANSLATE FROM</span>
    </div>
    <div class="flex gap-2">
      {#each languageOptions as { code, label }}
        <button
          class="text-md btn btn-circle btn-primary font-normal text-base-content"
          onclick={(e) => translateFields(e, code, languageTag)}>
          {label}
        </button>
      {/each}
    </div>
  </div>
</div>
