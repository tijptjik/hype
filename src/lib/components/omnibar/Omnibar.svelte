<script lang="ts">
import { browser } from '$app/environment';
// CONTEXT
import { getOmniContext } from '$lib/context/omni.svelte';
import { getMapContext } from '$lib/context/map.svelte';
// COMPONENTS
import OmniSearchBar from './OmniSearchBar.svelte';
import OmniNavigationBar from './OmniNavigationBar.svelte';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';

// CONTEXT
const omniContext = getOmniContext();
const mapContext = getMapContext();

// STATE
// let hasFocus = $state(false);
// let omnibarRef = $state<HTMLDivElement | null>(null);

// $effect(() => {
//   if (hasFocus === false && omniContext.state.searchTerm !== '') {
//     focusSearchBar();
//   }
// });

// // HANDLERS
// function onFocus() {
//   hasFocus = true;
// }

// function handleClickOutside(event: MouseEvent) {
//   if (omnibarRef && !omnibarRef.contains(event.target as Node)) {
//     omniContext.close();
//   }
// }

// function handleCloseOmnibar() {
//   hasFocus = false;
//   searchTerm = '';
//   const searchInput = document.querySelector(
//     'input[id="omni-search-bar"]'
//   ) as HTMLElement;
//   searchInput?.blur();
// }

// function focusSearchBar() {
//   hasFocus = true;
//   const searchInput = document.querySelector(
//     'input[id="omni-search-bar"]'
//   ) as HTMLElement;
//   searchInput?.focus();
// }

// Calculate total number of visible results
// const totalResults = $derived(
//   (limits.walks || 0) + (limits.neighbourhoods || 0) + (limits.features || 0)
// );

let showSearch = $derived(omniContext.state.mode === 'search');

// Setup and cleanup event listeners
// onMount(() => {
//   document.addEventListener('mousedown', handleClickOutside);
// });

// onDestroy(() => {
//   document.removeEventListener('mousedown', handleClickOutside);
// });

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    omniContext.close();
  }
}

// Calculate offset based on visible panels
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = mapContext.state.panels;
  const leftPanelOpen = maps || stars;
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
