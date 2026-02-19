<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import OmniSection from './OmniSection.svelte'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
// ENUMS
import { OmniCollection } from '$lib/enums'

// CONTEXT
const omniCtx = getOmniCtx()
</script>

<div
  class="flex select-none flex-col divide-y divide-neutral-800 overscroll-none bg-neutral-900 caret-transparent"
  transition:slide={{ duration: 200 }}
  role="listbox"
  tabindex="-1"
>
  {#if Object.values(omniCtx.searchResults).every((group) => group.length === 0)}
    <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
  {:else}
    {#if omniCtx.searchResults.feature.length > 0}
      <OmniSection collectionType={OmniCollection.feature} />
    {/if}
    {#if omniCtx.searchResults.neighbourhood.length > 0}
      <OmniSection collectionType={OmniCollection.neighbourhood} />
    {/if}
    {#if omniCtx.searchResults.walk.length > 0}
      <OmniSection collectionType={OmniCollection.walk} />
    {/if}
  {/if}
</div>
