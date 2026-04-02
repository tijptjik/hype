<script lang="ts">
// COMPONENTS
import OmnibarSection from './OmnibarSection.svelte'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
// ENUMS
import { OmniCollection } from '$lib/enums'
// I18N
import { m } from '$lib/i18n'

const omniCtx = getOmniCtx()
</script>

<div
  class="z-50 flex min-h-0 select-none flex-col divide-y divide-neutral-800 overscroll-contain bg-neutral-900 caret-transparent"
  role="listbox"
  tabindex="-1"
>
  {#if Object.values(omniCtx.searchResults).every(group => group.length === 0)}
    <div class="p-4 text-center text-base-content/60">{m.omni__no_results()}</div>
  {:else}
    {#if omniCtx.searchResults.feature.length > 0}
      <OmnibarSection collectionType={OmniCollection.feature} />
    {/if}
    {#if omniCtx.searchResults.neighbourhood.length > 0}
      <OmnibarSection collectionType={OmniCollection.neighbourhood} />
    {/if}
    {#if omniCtx.searchResults.walk.length > 0}
      <OmnibarSection collectionType={OmniCollection.walk} />
    {/if}
  {/if}
</div>
