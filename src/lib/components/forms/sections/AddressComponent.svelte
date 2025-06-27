<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import ForwardGeocodeActions from '$lib/components/forms/actions/ForwardGeocode.svelte';
import Header from '$lib/components/forms/extra/Header.svelte';
import DisplayField from '$lib/components/forms/fields/Display.svelte';
// ENUMS
import { supportedLocales } from '$lib/enums';
// TYPES
import type {
  Locale,
  SectionProps,
  FormField,
  FormFieldNested,
  FeatureForm
} from '$lib/types';

// CONFIG
const columnHeaders: Record<Locale, string> = {
  en: 'English',
  'zh-hant': 'Trad. Chinese',
  'zh-hans': 'Simp. Chinese'
};
const columnColors: Record<Locale, string> = {
  en: '#E63A65',
  'zh-hant': '#C52F73',
  'zh-hans': '#A62481'
};

// Fields sorted from smallest to largest unit
const addressFields = [
  'unitPortion',
  'unitNumber',
  'unitType',
  'floorNumber',
  'floorType',
  'buildingName',
  'buildingNumberFrom',
  'buildingNumberTo',
  'blockNumber',
  'blockType',
  'blockTypeBeforeNumber',
  'phaseNumber',
  'phaseName',
  'estateName',
  'streetNumber',
  'streetName',
  'intersection',
  'neighbourhood',
  'subDistrict',
  'district',
  'region',
  'country'
] as const;

type AddressField = (typeof addressFields)[number];

// Meta fields sorted by category
const metaFields = [
  // Identifiers
  'geoAddressCode',
  'googlePlaceId',
  'plusCode',
  // Metrics
  'distanceFromPoint',
  'confidenceForwardGeocoder',
  // Geocoding
  'addressForwardGeocoder',
  'addressReverseGeocoder',
  'addressReverseGen',
  'addressForwardGen'
] as const;

type MetaField = (typeof metaFields)[number];

// STATE : PROPS
let sectionProps: SectionProps & { fields: FormField & FormFieldNested } = $props();

// STATE : CONTEXT :: FORM
// For $formStore reactivity and type safety
const formStore = (sectionProps.form as unknown as FeatureForm).form;

// Helper function to check if field is a special geocoder field
function isGeocoderField(field: string): boolean {
  return field.startsWith('google') || field.startsWith('address');
}

// Helper function to safely get address property value
function getAddressPropertyValue(field: AddressField, locale: Locale): string | null {
  return $formStore?.i18n?.[locale]?.addressProperties?.[field] ?? null;
}

// Helper function to safely get meta property value
function getMetaPropertyValue(field: MetaField): string | null {
  const value = $formStore?.addressMeta?.[field];
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

// Helper to check if a value exists and is not empty
function hasValue(value: string | null): boolean {
  return value !== null && value !== undefined && value !== '';
}
</script>

<div class="z-10 rounded-2xl p-0 @container">
  <Header {...sectionProps} title={m.aware_cozy_impala_dine()}>
    {#snippet actionContent()}
      <ForwardGeocodeActions form={sectionProps.form as unknown as FeatureForm} />
    {/snippet}
  </Header>

  <!-- Address Properties -->
  <div class="grid grid-cols-3 gap-4 rounded-xl pt-2">
    {#each supportedLocales as locale}
      <div
        class="overflow-hidden rounded-xl border-b-3 shadow-xl"
        style={`background-color: ${columnColors[locale]}; border-color: ${columnColors[locale]}`}>
        <h3
          class="text-md mb-4 pt-4 text-center font-medium uppercase text-base-content">
          {columnHeaders[locale]}
        </h3>
        <div
          class="bg-grain flex h-full flex-col rounded-b-xl border-x-3 border-[{columnColors[
            locale
          ]}] bg-glass-300"
          style={`border-color: ${columnColors[locale]}`}>
          <div class="flex flex-col gap-[2px]">
            {#each addressFields as fieldKey}
              {@const value = getAddressPropertyValue(fieldKey, locale)}
              {#if hasValue(value)}
                <DisplayField label={fieldKey} {value} />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Address Metadata -->
  <div class="mt-4 py-4 pb-8">
    <Header {...sectionProps} title={m.cozy_misty_ray_walk()} />
    <div class="grid grid-cols-3 gap-4">
      {#each metaFields as fieldKey}
        {@const value = getMetaPropertyValue(fieldKey)}
        {#if hasValue(value)}
          <div class="rounded-xl border-3 border-primary shadow-xl">
            <DisplayField
              label={fieldKey == 'distanceFromPoint'
                ? m.slimy_nice_sheep_hint()
                : fieldKey}
              {value}
              gridCell={true} />
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
