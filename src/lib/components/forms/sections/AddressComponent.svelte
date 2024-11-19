<script lang="ts">
import { languageTags } from '$lib';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import DisplayField from '$lib/components/forms/fields/DisplayField.svelte';
// TYPES
import type {
  Feature,
  HumanLang,
  SectionProps,
  FormField,
  FormFieldNested
} from '$lib/types';

// CONFIG
const columnHeaders: Record<HumanLang, string> = {
  en: 'English',
  'zh-hant': 'Trad. Chinese',
  'zh-hans': 'Simp. Chinese'
};
const columnColors: Record<HumanLang, string> = {
  en: '#E63A65',
  'zh-hant': '#C52F73',
  'zh-hans': '#A62481'
};
const fieldRoot: Field = 'addressProperties';

// STATE : PROPS
let sectionProps: SectionProps & { fields: FormField & FormFieldNested } = $props();
let { resource, entity, fields } = sectionProps;
const { form } = getForm<Feature>(resource, entity);

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

  <div class="grid grid-cols-3 gap-4 p-4 rounded-xl">
    {#each languageTags as lang}
      <div class="rounded-xl" style={`background-color: ${columnColors[lang]}`}>
        <h3 class="mb-4 text-center text-md font-medium text-base-content pt-4 uppercase">
          {columnHeaders[lang]}
        </h3>
        <div class="flex flex-col rounded-b-xl bg-base-100 p-6">
          <div class="flex flex-col gap-[2px]">
            {#each sectionProps.fields[fieldRoot as keyof FormFieldNested].coreValues as fieldKey, index}
              {#if shouldAddGap(index, sectionProps.fields[fieldRoot as keyof FormFieldNested].coreValues)}
                <div class="h-6"></div>
              {/if}

              {#if ['addressGeocoder', 'addressReverseGen', 'addressForwardGen'].includes(fieldKey)}
                {#if fieldKey === 'addressGeocoder'}
                  <div class="flex flex-row justify-between">
                    <DisplayField label="Geocoder" value={$form[fieldRoot][fieldKey]} />
                    <DisplayField
                      label="Direction"
                      value={$form[fieldRoot].addressReverseGen
                        ? 'Reverse'
                        : $form[fieldRoot].addressForwardGen
                          ? 'Forward'
                          : 'Unknown'}
                      justify="end" />
                  </div>
                {/if}
              {:else}
                <DisplayField label={fieldKey} value={$form[fieldRoot][fieldKey]} />
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>
