<script lang="ts">
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Stats from '$lib/components/forms/stats/Address.svelte';
import Actions from '$lib/components/forms/actions/Address.svelte';
import TextField from '$lib/components/forms/fields/Textarea.svelte';
import GeocodeBar from '$lib/components/forms/bars/Geocode.svelte';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { CheckCircle } from '@steeze-ui/heroicons';
// TYPES
import type {
  LanguageTag,
  SectionProps,
  Field,
  Feature,
  AddressProperties,
  AddressMeta
} from '$lib/types';
import type { SuperForm } from 'sveltekit-superforms';
import type { AnyZodObject } from 'zod';
// SERVICES
import { reverseGeocode } from '$lib/services/geocoding';

// CONFIG
const sourceLanguageTag = 'en';
const languageTags: LanguageTag[] = [sourceLanguageTag, 'zh-hant', 'zh-hans'];

// STATE : PROPS
let sectionProps: SectionProps = $props();
const fieldRoot: Field = 'displayAddress';

// STATE : CONTEXT :: FORM
let { form, errors } = sectionProps.form as SuperForm<Feature, AnyZodObject>;

// STATE : UI
let missingTranslations = $state<
  Record<LanguageTag, { confirmed: boolean; translated: boolean }>
>({
  'zh-hant': { confirmed: false, translated: false },
  'zh-hans': { confirmed: false, translated: false }
});
let loadingTranslation = $state<LanguageTag | null>(null);

// Check if we can save based on translation state
$effect(() => {
  $inspect(missingTranslations);
  const hasUnhandledTranslations = Object.entries(missingTranslations).some(
    ([lang, state]) => !state.confirmed && !state.translated
  );
  if (hasUnhandledTranslations) {
    errors.update((currentErrors) => ({
      ...currentErrors,
      displayAddress: 'Please handle missing translations'
    }));
  } else {
    errors.update((currentErrors) => {
      const { displayAddress, ...rest } = currentErrors;
      return rest;
    });
  }
});

async function translateDisplayAddress(targetLang: LanguageTag) {
  try {
    loadingTranslation = targetLang;
    const response = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceLang: 'en',
        targetLang,
        texts: [$form.displayAddress]
      })
    });
    const data = await response.json();

    form.update(($form) => {
      if (!$form.translations[targetLang]) {
        $form.translations[targetLang] = {};
      }
      $form.translations[targetLang].displayAddress = data.translations[0];
      $form.translations[targetLang].displayAddressGen = true;
      return $form;
    });

    missingTranslations[targetLang].translated = true;
  } catch (error) {
    console.error('Translation failed:', error);
  } finally {
    loadingTranslation = null;
  }
}

function confirmCurrentTranslation(lang: LanguageTag) {
  missingTranslations[lang].confirmed = true;
}

const actions = {
  geocode: async (e: Event) => {
    e.preventDefault();
    console.log('currentForm', $form);
    const [lng, lat] = $form.geometry.coordinates;
    const result = await reverseGeocode(lng, lat);

    if (result) {
      console.log('result', result);

      // Reset missing translations state
      // We don't need english translations as the API returns the english address
      missingTranslations = {
        'zh-hant': { confirmed: false, translated: false },
        'zh-hans': { confirmed: false, translated: false }
      };

      // Check which translations are missing
      const hasMissingTranslations = result.translations
        ? Object.entries(result.translations).some(
            ([lang, data]) => !data?.displayAddress
          )
        : true;

      if (hasMissingTranslations) {
        // Mark translations as missing and needing attention
        Object.entries(result.translations || {}).forEach(([lang, data]) => {
          if (!data?.displayAddress) {
            missingTranslations[lang as LanguageTag] = {
              confirmed: false,
              translated: false
            };
          } else {
            missingTranslations[lang as LanguageTag] = {
              confirmed: true,
              translated: true
            };
          }
        });
      }

      // Update form with reverse geocode results
      form.update(($form) => ({
        ...$form,
        displayAddress: result.displayAddress,
        displayAddressGen: true,
        addressProperties: result.addressProperties as AddressProperties,
        addressMeta: result.addressMeta as AddressMeta,
        translations: {
          ...result.translations
        }
      }));
    }
  }
};
</script>

<div
  class="select-none rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
  <Header {...sectionProps} {Actions} {actions} {Stats} />
  <div class="grid grid-cols-1 gap-4 p-4 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each languageTags as languageTag}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4">
          <TextField
            {...sectionProps}
            {languageTag}
            {fieldRoot}
            field={sectionProps.fields[fieldRoot]} />

          {#if languageTag !== 'en' && $form[fieldRoot] && missingTranslations[languageTag] && !missingTranslations[languageTag].confirmed && !missingTranslations[languageTag].translated}
            <div class="flex items-center gap-2 text-sm">
              <button
                class="btn btn-circle btn-sm"
                disabled={loadingTranslation === languageTag}
                onclick={() => confirmCurrentTranslation(languageTag)}>
                <Icon src={CheckCircle} class="h-4 w-4" />
              </button>
              <button
                class="btn btn-circle btn-primary btn-sm"
                disabled={loadingTranslation === languageTag}
                onclick={() => translateDisplayAddress(languageTag)}>
                {#if loadingTranslation === languageTag}
                  <span class="loading loading-spinner loading-sm"></span>
                {:else}
                  EN
                {/if}
              </button>
              <span class="text-warning"
                >Please confirm current translation or translate from English</span>
            </div>
          {/if}
        </div>
        <div
          class="h-2 w-full transition-[height] delay-700 duration-300 group-focus-within:h-0 group-hover:h-0">
        </div>
        <div
          class="ease-in-quad max-h-0 overflow-hidden transition-[max-height] delay-700 duration-300 group-focus-within:max-h-32 group-hover:max-h-32">
          <GeocodeBar {languageTag} />
        </div>
      </div>
    {/each}
  </div>
</div>
