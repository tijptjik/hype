<script lang="ts">
// LIB
import { reverseGeocode } from '$lib/services/geocoding';
import { sourceLanguageTag, languageTags } from '$lib';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Stats from '$lib/components/forms/stats/Address.svelte';
import Actions from '$lib/components/forms/actions/Address.svelte';
import TextField from '$lib/components/forms/fields/Textarea.svelte';
import GeocodeBar from '$lib/components/forms/bars/Geocode.svelte';
import ConfirmationBar from '$lib/components/forms/bars/MissingTranslationConfirmation.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// TYPES
import type {
  LanguageTag,
  SectionProps,
  Field,
  AddressProperties,
  TargetLang,
  TranslationStates,
  Resource,
  Feature,
  ReverseGeocodeResult
} from '$lib/types';
import type { Geometry, Point } from 'geojson';

// STATE : PROPS
let sectionProps: SectionProps = $props();
const fieldRoot: Field = 'displayAddress';

// STATE : CONTEXT :: FORM
let { form } = sectionProps.form;

let enIsGenAI = $derived($form.displayAddressGen || null);
let zhHantIsGenAI = $derived($form.translations['zh-hant'].displayAddressGen || null);
let zhHansIsGenAI = $derived($form.translations['zh-hans'].displayAddressGen || null);

let defaultMissingTranslations: TranslationStates = {
  'zh-hant': { confirmed: false, translated: false, required: false },
  'zh-hans': { confirmed: false, translated: false, required: false }
};
// STATE : UI
let missingTranslations: TranslationStates = $state(defaultMissingTranslations);

// Check if we can save based on translation state
$effect(() => {
  const hasRequiredTranslations = Object.values(missingTranslations).some(
    (state) => state.required
  );
  if (hasRequiredTranslations) {
    $inspect('setting client error');
    sectionProps.form.setClientError(
      'displayAddress',
      'Required translations are missing'
    );
    $inspect('client errors', sectionProps.form.clientErrors);
  } else {
    $inspect('clearing client error');
    sectionProps.form.clearClientError('displayAddress');
  }
});

let handleConfirmTranslation = (event: Event, lang: LanguageTag) => {
  event.preventDefault();
  missingTranslations[lang as TargetLang].confirmed = true;
  missingTranslations[lang as TargetLang].required = false;
};

let handleTranslateComplete = (event: Event, lang: LanguageTag) => {
  event.preventDefault();
  missingTranslations[lang as TargetLang].translated = true;
  missingTranslations[lang as TargetLang].required = false;
};

let resetMissingTranslations = () => {
  missingTranslations = defaultMissingTranslations;
};

let setMissingTranslations = (result: ReverseGeocodeResult) => {
  console.log('result', result);
  Object.entries(result.translations || {}).forEach(([lang, data]) => {
    if (
      !data?.displayAddress ||
      data?.displayAddress == '' ||
      data?.displayAddress == null
    ) {
      missingTranslations[lang as TargetLang] = {
        confirmed: false,
        translated: false,
        required: true
      };
    }
  });
};

const actions = {
  geocode: async (e: Event) => {
    e.preventDefault();
    // Type Guard
    if (isFeature($form) && isPointGeometry($form.geometry)) {
      const [lng, lat] = $form.geometry.coordinates;
      const result = await reverseGeocode(lng, lat);

      if (result) {
        // Reset missing translations state
        // We don't need english translations as the API returns the english address
        resetMissingTranslations();

        // Check which translations are missing
        setMissingTranslations(result);

        // Update form with reverse geocode results
        form.update(($form) => {
          if (isFeature($form)) {
            $form.displayAddress = result.displayAddress;
            $form.displayAddressGen = true;
            $form.addressProperties = result.addressProperties as AddressProperties;
            $form.addressMeta = {
              ...$form.addressMeta,
              ...result.addressMeta
            };
            Object.entries(result.translations || {}).forEach(([lang, data]) => {
              $form.translations[lang as TargetLang].displayAddress =
                data.displayAddress;
              $form.translations[lang as TargetLang].displayAddressGen =
                data.displayAddressGen;
              $form.translations[lang as TargetLang].addressProperties =
                data.addressProperties;
            });
          }
          return $form;
        });
      }
    }
  }
};

let isFeature = (resource: Resource): resource is Feature => {
  return 'geometry' in resource;
};

let isPointGeometry = (geometry: Geometry): geometry is Point => {
  return geometry.type === 'Point';
};
</script>

<div
  class="select-none rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
  <Header {...sectionProps} {Actions} {actions} {Stats} />
  <div class="grid grid-cols-1 gap-4 p-4 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each languageTags as languageTag}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div
          class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4"
          class:pb-0={!$form.displayAddressGen}>
          <TextField
            {...sectionProps}
            {languageTag}
            {fieldRoot}
            field={sectionProps.fields[fieldRoot]} />
        </div>
        <div>
          {#if languageTag !== sourceLanguageTag && $form[fieldRoot] && missingTranslations[languageTag].required}
            <ConfirmationBar
              {form}
              {languageTag}
              {fieldRoot}
              onConfirm={(e) => handleConfirmTranslation(e, languageTag)}
              onTranslate={(e) => handleTranslateComplete(e, languageTag)} />
          {:else}
            <!-- Translation bar that shows up when displayAddressGen is false -->
            {#if !zhHansIsGenAI || !zhHantIsGenAI || !enIsGenAI}
              <TranslationBar
                {...sectionProps}
                fields={{ displayAddress: sectionProps.fields.displayAddress }}
                {languageTag} />
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
