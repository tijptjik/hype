<script lang="ts">
// SVELTE
import { browser } from '$app/environment';
// NAVIGATION
import { goto } from '$app/navigation';
// CONTEXT
import { getMapCtx, setMapCtx } from '$lib/context/map.svelte';
import { setOmniContext, PageState, getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Menu from '$lib/components/layout/Menu.svelte';
import Map from '$lib/components/common/StandaloneMap.svelte';
import Omnibar from '$lib/components/omnibar/Omnibar.svelte';
import Filters from '$lib/components/panels/Filters.svelte';
import Maps from '$lib/components/panels/Maps.svelte';
import Stars from '$lib/components/panels/Stars.svelte';
import Settings from '$lib/components/panels/Settings.svelte';
import LayerSelectionModal from '$lib/components/modals/LayerSelectionModal.svelte';
import GeoLocationModal from '$lib/components/modals/GeoLocationModal.svelte';
import NewFeatureCard from '$lib/components/modals/NewFeatureCard.svelte';
// TYPES
import type { LayoutData } from '../(app)/$types';
import type { QueryClient } from '@tanstack/svelte-query';
import type { UserLayer } from '$lib/types';
// STYLES
import '$lib/styles/scrollbar.css';

// NAVIGATION STATE
let navDest = $state('');

// PROPS
let { children, data } = $props();

// Extract session data from layout data
const { session, queryClient } = data as LayoutData & {
  queryClient: QueryClient;
};

// CONTEXT - Set Map Context
setMapCtx(
  queryClient,
  session?.user
);

// CONTEXT - Set Omni Context
setOmniContext(getMapCtx());

// CONTEXT - Get Map & Omni Context
const omniCtx = getOmniContext();
const mapCtx = getMapCtx();

// Set user data in map context to make it reactive
mapCtx.setUser(session?.user ?? null);

mapCtx.registerKeydownHandlers();

// Compute map container classes based on visible panels
// let mapContainerClasses = $derived(() => {
//   const { filters, maps, stars, settings } = mapCtx.state.panels;
//   const leftPanelOpen = filters || maps;
//   const rightPanelOpen = stars || settings;

//   return {
//     'ml-[480px]': leftPanelOpen && !browser?.innerWidth < MOBILE_MAX_WIDTH,
//     'mr-[480px]': rightPanelOpen && !browser?.innerWidth < MOBILE_MAX_WIDTH
//   };
// });

// NAVIGATION HANDLING -- State Change Effect
$effect(() => {
  if (browser && omniCtx.pageState === PageState.ReadyToNav && navDest) {
    goto(navDest.replace('(app)', '')).then(() => {
      omniCtx.pageState = PageState.NoTransition;
    });
  }
});
</script>

<div class="flex h-dvh flex-col justify-around overflow-hidden">
  {#if session}
    <main
      class="relative top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      <!-- Panels -->
      {#if mapCtx.state.panels.filters}
        <Filters />
      {/if}
      {#if mapCtx.state.panels.maps}
        <Maps />
      {/if}
      {#if mapCtx.state.panels.stars}
        <Stars />
      {/if}
      {#if mapCtx.state.panels.settings}
        <Settings />
      {/if}
      <!-- Map Container -->
      <div class="relative flex h-full flex-1 flex-col">
        <Map />
        <Omnibar />
        {@render children()}
        <LayerSelectionModal />
        <GeoLocationModal />
        <NewFeatureCard />
      </div>
    </main>
    <Menu />
  {:else}
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {/if}
</div>
