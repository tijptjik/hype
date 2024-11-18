<script lang="ts">
import { getFieldComponent, languageTags } from '$lib';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/Feature.svelte';
import InfoContent from '$lib/components/forms/info/FeatureCore.svelte';
import TranslationBar from '$lib/components/forms/bars/Translation.svelte';
// TYPES
import type { SectionProps, LanguageTag } from '$lib/types';
// DEBUG
import SuperDebug from 'sveltekit-superforms';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields, facet, resource } = sectionProps;
</script>

<div class="z-10 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 @container">
  {#if facet == 'core' && resource == 'feature'}
    <Header {Actions} {InfoContent} {...sectionProps} />
  {:else}
    <Header {...sectionProps} />
  {/if}
  <div class="grid grid-cols-1 gap-4 p-4 @xl:grid-cols-2 @5xl:grid-cols-3">
    {#each languageTags as languageTag}
      <div class="group flex flex-grow flex-col gap-4 rounded-xl bg-base-100">
        <div class="flex flex-col content-start items-start gap-4 px-6 py-2 pb-2 pt-4">
          {#each Object.entries(fields) as [fieldRoot, field]}
            {@const Field = getFieldComponent(field.component)}
            <Field {languageTag} {fieldRoot} {field} {...sectionProps} />
          {/each}
        </div>
        <TranslationBar {languageTag} {...sectionProps} />
      </div>
    {/each}
  </div>
</div>
<!-- <SuperDebug data={$form} /> -->
