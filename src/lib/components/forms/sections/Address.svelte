<script lang="ts">
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Stats from '$lib/components/forms/stats/Address.svelte';
import Actions from '$lib/components/forms/actions/Address.svelte';
import TextField from '$lib/components/forms/fields/Textarea.svelte';
import GeocodeBar from '$lib/components/forms/bars/Geocode.svelte';
// TYPES
import type { LanguageTag, SectionProps, Field } from '$lib/types';

// CONFIG
const sourceLanguageTag = 'en';
const languageTags: LanguageTag[] = [sourceLanguageTag, 'zh-hant', 'zh-hans'];

// STATE : PROPS
let sectionProps: SectionProps = $props();
const fieldRoot: Field = 'displayAddress';

const actions = {
  geocode: () => {
    console.info('geocode');
  }
};
</script>

<div
  class="z-10 select-none rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
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
