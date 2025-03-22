<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { Language } from '@steeze-ui/heroicons';
// Types
import type { BarProps, LanguageTag } from '$lib/types';

// CONFIG
const allLanguages = [
  { code: 'en', label: 'EN' },
  { code: 'zh-hant', label: 'HK' },
  { code: 'zh-hans', label: 'CN' }
];

// STATE : PROPS
const { fields, languageTag, ...barProps }: BarProps = $props();
let { form } = barProps.form;

const languageOptions = $derived(
  allLanguages.filter((lang) => lang.code !== languageTag)
);

// Loading state tracking
let loadingLang = $state<LanguageTag | null>(null);

async function translateFields(
  event: Event,
  sourceLang: LanguageTag,
  targetLang: LanguageTag
) {
  event.preventDefault();

  try {
    loadingLang = sourceLang;

    // Step 1: Initialize sourceTexts array
    const sourceTexts: string[] = [];
    const sourceLangObj =
      sourceLang.toLowerCase() === 'en' ? $form : $form.translations[sourceLang];

    // Step 1: Lookup the sourceLang texts
    Object.keys(fields).forEach((key) => {
      sourceTexts.push(sourceLangObj[key] ?? '');
    });

    // Step 2: Translation API call
    const response = await fetch('/api/translation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sourceLang: sourceLang,
        targetLang: targetLang,
        texts: sourceTexts
      })
    });
    const translatedTexts: string[] = await response.json();

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
  } finally {
    loadingLang = null;
  }
}
</script>

<div
  class="m-0 overflow-hidden opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
  <div class="flex items-center justify-between rounded-b-xl bg-base-200 px-6 py-3">
    <div class="flex items-center gap-4">
      <Icon src={Language} class="h-6 w-6 text-primary" />
      <span class="text-sm text-base-content">TRANSLATE FROM</span>
    </div>
    <div class="flex gap-2">
      {#each languageOptions as { code, label }}
        <button
          class="text-md btn btn-circle btn-primary font-normal text-base-content focus:border-none focus:outline-1 focus:outline-neutral-content"
          disabled={loadingLang !== null}
          onclick={async (e) =>
            await translateFields(e, code as LanguageTag, languageTag)}>
          {#if loadingLang === code}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            {label}
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
