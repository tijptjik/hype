<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import OmniSection from './OmniSection.svelte';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';

// CONTEXT
const omniCtx = getOmniContext();
</script>

<div
  class="flex select-none flex-col divide-y divide-neutral-800 overscroll-none bg-neutral-900 caret-transparent"
  transition:slide={{ duration: 200 }}
  role="listbox"
  tabindex="-1">
  {#if Object.values(omniCtx.searchResults).every((group) => group.length === 0)}
    <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
  {:else}
    {#if omniCtx.searchResults.features.length > 0}
      <OmniSection title={m.omni__title_features()} group="features" />
    {/if}
    {#if omniCtx.searchResults.neighbourhoods.length > 0}
      <OmniSection title={m.omni__title_neighbourhoods()} group="neighbourhoods" />
    {/if}
    {#if omniCtx.searchResults.walks.length > 0}
      <OmniSection title={m.omni__title_walks()} group="walks" />
    {/if}
  {/if}
</div>
