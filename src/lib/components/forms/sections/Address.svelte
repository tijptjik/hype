<script lang="ts">
// I18N
import { m } from '$lib/paraglide/messages';
// LIB
import { reverseGeocode } from '$lib/api/external/geocoding';
import { supportedLocales } from '$lib/enums';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Stats from '$lib/components/forms/stats/Address.svelte';
import GeolocateAction from '$lib/components/forms/actions/Address.svelte';
import TextField from '$lib/components/forms/fields/Textarea.svelte';
import ConfirmationBar from '$lib/components/forms/bars/MissingTranslationConfirmation.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// TYPES
import type {
  Locale,
  SectionProps,
  Field,
  TranslationStates,
  Resource,
  Feature,
  ParsedReverseGeocodeResult,
  FeatureForm,
  FieldProps,
  FormFieldDefinition
} from '$lib/types';
import type { Geometry, Point } from 'geojson';

// STATE : PROPS
let sectionProps: SectionProps = $props();
const fieldRootProp: Field = 'displayAddress';

const featureForm = sectionProps.form as unknown as FeatureForm;
const formStore = featureForm.form; // This is Writable<Feature>

let isFeature = (value: Resource | Feature): value is Feature => {
  return 'geometry' in value;
};

let isPointGeometry = (geometry: Geometry | undefined): geometry is Point => {
  return !!geometry && geometry.type === 'Point';
};

let currentFormIsFeature = $derived(isFeature($formStore));
let currentGeometry = $derived(
  currentFormIsFeature ? ($formStore as Feature).geometry : undefined
);
let currentGeometryIsPoint = $derived(isPointGeometry(currentGeometry));

$effect(() => {
  if (!currentFormIsFeature) {
    console.error('Form data must be a Feature type for Address.svelte');
  }
});

let enIsGenAI = $derived(
  currentFormIsFeature
    ? (($formStore as Feature).i18n['en']?.displayAddressGen ?? false)
    : false
);
let zhHantIsGenAI = $derived(
  currentFormIsFeature
    ? (($formStore as Feature).i18n['zh-hant']?.displayAddressGen ?? false)
    : false
);
let zhHansIsGenAI = $derived(
  currentFormIsFeature
    ? (($formStore as Feature).i18n['zh-hans']?.displayAddressGen ?? false)
    : false
);

let defaultMissingTranslations: TranslationStates = {
  en: { confirmed: false, translated: false, required: false },
  'zh-hant': { confirmed: false, translated: false, required: false },
  'zh-hans': { confirmed: false, translated: false, required: false }
};
// STATE : UI
let missingTranslations: TranslationStates = $state(defaultMissingTranslations);

// Check if we can save based on translation state
$effect(() => {
  if (!currentFormIsFeature) return;
  const hasRequiredTranslations = Object.values(missingTranslations).some(
    (state) => state.required
  );
  if (hasRequiredTranslations) {
    featureForm.setClientError?.('displayAddress', m.livid_just_eel_hope());
  } else {
    featureForm.clearClientError?.('displayAddress');
  }
});

let handleConfirmTranslation = (event: Event, locale: Locale) => {
  event.preventDefault();
  missingTranslations[locale].confirmed = true;
  missingTranslations[locale].required = false;
};

let handleTranslateComplete = (event: Event, locale: Locale) => {
  event.preventDefault();
  missingTranslations[locale].translated = true;
  missingTranslations[locale].required = false;
};

let resetMissingTranslations = () => {
  missingTranslations = defaultMissingTranslations;
};

let setMissingTranslations = (result: ParsedReverseGeocodeResult, sourceLocale: Locale) => {
  Object.entries(result.i18n || {}).forEach(([locale, data]) => {
    if (locale === sourceLocale) return;
    if (
      !data?.displayAddress ||
      data?.displayAddress == '' ||
      data?.displayAddress == null
    ) {
      missingTranslations[locale as Locale] = {
        confirmed: false,
        translated: false,
        required: true
      };
    }
  });
};

const actions: Record<'geocode', (...args: any[]) => void> = {
  geocode: async (e: Event) => {
    e.preventDefault();
    if (currentFormIsFeature && currentGeometryIsPoint && currentGeometry) {
      const coordinates = (currentGeometry as Point).coordinates;
      const [lng, lat] = coordinates;
      const result = await reverseGeocode(lng, lat);
      if (result) {
        // Reset missing translations state
        // We don't need english translations as the API returns the english address
        resetMissingTranslations();
        setMissingTranslations(result, 'en');

        formStore.update(($formData) => {
          const featureData = $formData as Feature;
          featureData.addressMeta = {
            ...featureData.addressMeta,
            ...result.addressMeta
          };
          Object.entries(result.i18n || {}).forEach(([localeStr, data]) => {
            const locale = localeStr as Locale;
            featureData.i18n[locale].displayAddress = data.displayAddress;
            featureData.i18n[locale].displayAddressGen = data.displayAddressGen;
            featureData.i18n[locale].addressProperties = data.addressProperties;
          });
          return featureData;
        });
      }
    }
  }
};
</script>

<div
  class="select-none rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
  <Header {...sectionProps}>
    <Stats form={featureForm} />
    {#snippet actionContent()}
      <GeolocateAction form={featureForm} {actions} />
    {/snippet}
  </Header>
  <div class="grid grid-cols-1 gap-4 p-4 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each supportedLocales as locale}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div
          class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4"
          class:pb-0={currentFormIsFeature &&
            !(($formStore as Feature).i18n[locale]?.displayAddressGen ?? false)}>
          <TextField
            {...sectionProps}
            {locale}
            fieldRoot={fieldRootProp}
            field={sectionProps.fields[fieldRootProp] as FormFieldDefinition} />
        </div>
        <div>
          {#if currentFormIsFeature && ($formStore as Feature).i18n[locale]?.displayAddress && missingTranslations[locale].required}
            <ConfirmationBar
              {...sectionProps}
              {locale}
              fieldRoot={fieldRootProp}
              onConfirm={(e) => handleConfirmTranslation(e, locale)}
              onTranslate={(e) => handleTranslateComplete(e, locale)} />
          {:else if currentFormIsFeature && (!zhHansIsGenAI || !zhHantIsGenAI || !enIsGenAI)}
            <TranslationBar
              {...sectionProps}
              fields={{
                [fieldRootProp]: sectionProps.fields[
                  fieldRootProp
                ] as FormFieldDefinition
              }}
              targetLocales={locale} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
