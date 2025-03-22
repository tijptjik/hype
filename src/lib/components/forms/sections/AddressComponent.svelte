<script lang="ts">
import { languageTags } from '$lib';
// COMPONENTS
import Actions from '$lib/components/forms/actions/ForwardGeocode.svelte';
import Header from '$lib/components/forms/extra/Header.svelte';
import DisplayField from '$lib/components/forms/fields/DisplayField.svelte';
// TYPES
import type {
  Feature,
  LanguageTag,
  SectionProps,
  FormField,
  FormFieldNested
} from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';

// CONFIG
const columnHeaders: Record<LanguageTag, string> = {
  en: 'English',
  'zh-hant': 'Trad. Chinese',
  'zh-hans': 'Simp. Chinese'
};
const columnColors: Record<LanguageTag, string> = {
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
let { form } = sectionProps.form as { form: SuperValidated<Feature> };

// Helper function to check if field is a special geocoder field
function isGeocoderField(field: string): boolean {
  return field.startsWith('google') || field.startsWith('address');
}

// Helper function to safely get address property value
function getAddressPropertyValue(
  field: AddressField,
  lang: LanguageTag
): string | null {
  if (lang == 'en') return $form?.addressProperties?.[field] ?? null;
  return $form?.translations[lang as TargetLang].addressProperties?.[field] ?? null;
}

// Helper function to safely get meta property value
function getMetaPropertyValue(field: MetaField): string | null {
  return $form?.addressMeta?.[field] ?? null;
}

// Helper to check if a value exists and is not empty
function hasValue(value: string | null): boolean {
  return value !== null && value !== undefined && value !== '';
}
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header {...sectionProps} {Actions} title="Address Components" />

  <!-- Address Properties -->
  <div class="grid grid-cols-3 gap-4 rounded-xl p-4">
    {#each languageTags as lang}
      <div class="rounded-xl" style={`background-color: ${columnColors[lang]}`}>
        <h3
          class="text-md mb-4 pt-4 text-center font-medium uppercase text-base-content">
          {columnHeaders[lang]}
        </h3>
        <div class="flex flex-col rounded-b-xl bg-base-100 p-6">
          <div class="flex flex-col gap-[2px]">
            {#each addressFields as fieldKey}
              {@const value = getAddressPropertyValue(fieldKey, lang)}
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
  <div class="m-4 rounded-xl bg-base-100 px-6 py-4 pb-8">
    <h3 class="text-md mb-4 py-2 text-center font-medium uppercase text-base-content">
      Address Metadata
    </h3>
    <div class="grid grid-cols-3 gap-4">
      {#each metaFields as fieldKey}
        {@const value = getMetaPropertyValue(fieldKey)}
        {#if hasValue(value)}
          <DisplayField
            label={fieldKey == 'distanceFromPoint'
              ? 'Marker to Address Distance (m)'
              : fieldKey}
            {value}
            gridCell={true} />
        {/if}
      {/each}
    </div>
  </div>
</div>
