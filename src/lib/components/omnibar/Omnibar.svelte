<script lang="ts">
import { browser } from '$app/environment';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import OmniSearchBar from './OmniSearchBar.svelte';
import OmniNavigationBar from './OmniNavigationBar.svelte';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';

// CONTEXT
const omniCtx = getOmniContext();
const appCtx = getAppCtx();

let showSearch = $derived(omniCtx.state.mode === 'search');

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    omniCtx.close();
  }
}

// Calculate offset based on visible panels
let horizontalOffset = $derived(() => {
  const { filters, prisms, stars, settings } = appCtx.state.isPanelOpen;
  const leftPanelOpen = prisms || stars;
  const rightPanelOpen = filters || settings;

  if (browser && window.innerWidth < MOBILE_MAX_WIDTH) return 0;
  return (leftPanelOpen ? 210 : 0) - (rightPanelOpen ? 210 : 0);
});
</script>

<div
  class="relative z-40 mt-0 flex-shrink-0 flex-grow-0 select-none px-0 caret-transparent duration-300 w-120:mt-2 w-192:mt-6 w-192:px-4 w-320:mt-10 w-320:px-9"
  style="transform: translateX({horizontalOffset()}px)"
  onkeydown={handleEscape}>
  <div class="mx-auto min-w-[320px] max-w-[480px]">
    <div
      class="grid grid-cols-1 grid-rows-1 rounded-none transition-[height] duration-300 w-120:rounded-lg">
      {#if showSearch}
        <OmniSearchBar />
      {:else}
        <OmniNavigationBar />
      {/if}
    </div>
  </div>
</div>
