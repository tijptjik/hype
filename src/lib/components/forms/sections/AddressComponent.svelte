<script lang="ts">
import { languageTags } from '$lib';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import DisplayField from '$lib/components/forms/fields/DisplayField.svelte';
// TYPES
import type {
  Feature,
  LanguageTag,
  SectionProps,
  FormField,
  FormFieldNested,
  Field,
  AddressProperties,
  AddressMeta
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
let { fields } = sectionProps;

// STATE : CONTEXT :: FORM
let { form } = sectionProps.form as { form: SuperValidated<Feature> };

// Helper function to check if field is a special geocoder field
function isGeocoderField(field: string): boolean {
  return field.startsWith('google') || field.startsWith('address');
}

// Helper function to should add gap before field
function shouldAddGap(currentIndex: number, fields: string[]): boolean {
  if (currentIndex === 0) return false;
  const prevField = fields[currentIndex - 1];
  const currentField = fields[currentIndex];
  return !isGeocoderField(prevField) && isGeocoderField(currentField);
}
</script>

<div
  class="z-10 rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0 @container">
  <Header {...sectionProps} title="Address Components" />

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
              {#if form.addressProperties?.[fieldKey as AddressField]}
                <DisplayField
                  label={fieldKey}
                  value={form.addressProperties[fieldKey as AddressField]} />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Address Metadata -->
  <div class="mt-4 rounded-xl bg-base-100 p-4">
    <h3 class="text-md mb-4 text-center font-medium uppercase text-base-content">
      Address Metadata
    </h3>
    <div class="flex flex-col gap-[2px]">
      {#each metaFields as fieldKey}
        {#if form.addressMeta?.[fieldKey]}
          <DisplayField label={fieldKey} value={form.addressMeta[fieldKey]} />
        {/if}
      {/each}
    </div>
  </div>
</div>
