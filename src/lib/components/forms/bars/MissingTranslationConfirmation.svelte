<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, CheckCircle } from '@steeze-ui/heroicons';
// LIB
import { translateText } from '$lib/i18n';
import { supportedLocales } from '$lib/enums';
// TYPES
import type { Locale, Resource, Form } from '$lib/types';

interface Props {
  form: Form;
  locale: Locale;
  fieldRoot: string;
  onConfirm: (event: Event) => void;
  onTranslate: (event: Event) => void;
}

// PROPS
let { form, locale, fieldRoot, onConfirm, onTranslate }: Props = $props();

// STATE
let loadingTranslation = $state(false);

// FUNCTIONS
// TODO Correct this to use the new i18n model
async function handleTranslate(event: Event) {
  event.preventDefault();
  try {
    loadingTranslation = true;
    
    // Find the first non-empty value from supported locales
    let sourceValue = '';
    let sourceLocale: Locale = 'en';
    
    for (const locale of supportedLocales) {
      // @ts-ignore - waiting for runes version of superform
      const value = $form.i18n?.[locale as Locale]?.[fieldRoot];
      if (value) {
        sourceValue = value;
        sourceLocale = locale;
        break;
      }
    }
    
    if (!sourceValue) {
      throw new Error('No source value found for translation');
    }

    const translations = await translateText(sourceLocale, locale, [sourceValue]);

    form.form.update(($form: any) => {
      if (!$form.i18n) {
        $form.i18n = {};
      }
      if (!$form.i18n[locale]) {
        $form.i18n[locale] = {};
      }
      $form.i18n[locale][fieldRoot] = translations[0];
      $form.i18n[locale][`${fieldRoot}Gen`] = true;
      return $form;
    });

    onTranslate(event);
  } catch (error) {
    console.error('Translation failed:', error);
  } finally {
    loadingTranslation = false;
  }
}
</script>

<div
  class="bottom-0 left-0 right-0 flex items-center justify-between rounded-b-xl bg-base-200 px-6 py-3">
  <div class="flex items-center gap-4">
    <Icon src={Language} class="h-6 w-6 text-primary" />
    <span class="text-sm text-base-content">OUT OF SYNC</span>
  </div>
  <div class="flex gap-2">
    <button
      class="btn btn-circle"
      disabled={loadingTranslation}
      onclick={(e) => onConfirm(e)}>
      <Icon src={CheckCircle} class="h-6 w-6" />
    </button>
    <button
      class="btn btn-circle btn-primary"
      disabled={loadingTranslation}
      onclick={(e) => handleTranslate(e)}>
      {#if loadingTranslation}
        <span class="loading loading-spinner loading-sm"></span>
      {:else}
        EN
      {/if}
    </button>
  </div>
</div>
