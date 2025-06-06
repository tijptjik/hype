<script lang="ts">
 // I18N
import { localeLabels } from '$lib/i18n';
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Language, Backspace } from '@steeze-ui/heroicons';
// ENUMS
import { supportedLocales } from '$lib/enums';
// Types
import type { Locale, FormField, FormFieldArray, Form } from '$lib/types';

// CONFIG
type TranslationBarProps = {
  fields: FormField | FormFieldArray;
  targetLocale: Locale;
  form: Form;
  loadingLocale?: Locale | null;
  isClearAllVisible?: boolean;
  isTranslationDisabled: boolean;
  onTranslate?: (event: Event, sourceLocale: Locale) => Promise<void>;
  onClear?: (event: Event) => void;
};

// STATE : PROPS
let {
  fields,
  targetLocale,
  form,
  onTranslate,
  onClear,
  isClearAllVisible = false,
  isTranslationDisabled = false,
  loadingLocale = $bindable(null)
}: TranslationBarProps = $props();

// STATE : CONTEXT :: FORM
let resourceForm: Form['form'] = $derived(form.form);
const sourceLocales = $derived(supportedLocales.filter((locale) => locale !== targetLocale));

/**
 * Translate the fields from the source locale to the target locale.
 * Instead of returning the translated texts, we update the form in place.
 * This is the default internal translation logic if no onTranslate is provided.
 * @param event - The event that triggered the translation
 * @param source - The source locale
 * @param target - The target locale
 * @returns void
 */
async function translateFields(event: Event, source: Locale, target: Locale) {
  event.preventDefault();
  if (isTranslationDisabled) return;

  try {
    loadingLocale = source;

    // Step 1: Initialize sourceTexts array
    const sourceTexts: string[] = [];
    const sourceObj = ($resourceForm.i18n as Record<Locale, Record<string, string>>)[source]  ;

    // Step 2: Lookup the source texts from the `fields` prop
    // This internal logic assumes `fields` is a flat record for direct i18n properties
    Object.keys(fields).forEach((key) => {
      sourceTexts.push(sourceObj[key] ?? '');
    });

    // Step 3: Translation API call
    const response = await fetch('/api/translation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source,
        target,
        texts: sourceTexts
      })
    });
    const translatedTexts: string[] = await response.json();

    // Step 4: Update the form with translated texts
    translatedTexts.forEach((translatedText, index) => {
      let field = Object.keys(fields)[index];
      // @ts-expect-error - TODO: TYPE narrow the form to the correct type
      resourceForm.update(($form) => {
        ($form.i18n as Record<Locale, Record<string, string>>)[target][field] = translatedText;
        ($form.i18n as Record<Locale, Record<string, boolean>>)[target][`${field}Gen`] = true;
        return $form;
      });
    });
  } finally {
    loadingLocale = null;
  }
}
</script>

<div
  class="absolute bottom-0 left-0 right-0 z-10 m-0 overflow-hidden opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
  <div class="flex items-center justify-between rounded-b-xl bg-base-200 px-6 py-3">
    <div class="flex items-center gap-4">
      <Icon src={Language} class="h-6 w-6 text-primary" />
      <span class="text-sm text-base-content">{isClearAllVisible ? m.novel_real_gadfly_savor_missing() : m.novel_real_gadfly_savor()}</span>
    </div>
    <div class="flex items-center gap-2">
      {#if isClearAllVisible && onClear}
        <button
          class="text-md btn btn-circle btn-ghost text-error focus:border-none focus:outline-1 focus:outline-neutral-content"
          title={`Clear all values for ${targetLocale.toUpperCase()}`}
          disabled={loadingLocale !== null}
          onclick={(e) => onClear(e)}>
          {#if loadingLocale === targetLocale}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <Icon src={Backspace} class="h-5 w-5" />
          {/if}
        </button>
      {/if}
      {#each sourceLocales as sourceLocale}
        <button
          class="text-md btn btn-circle btn-primary font-normal text-base-content focus:border-none focus:outline-1 focus:outline-neutral-content"
          disabled={loadingLocale !== null || isTranslationDisabled}
          onclick={async (e) => {
            onTranslate ? await onTranslate(e, sourceLocale) : await translateFields(e, sourceLocale, targetLocale);
          }}>
          {#if loadingLocale === sourceLocale}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            {localeLabels.find((locale) => locale.locale === sourceLocale)?.label}
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>
