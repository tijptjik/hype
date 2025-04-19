<script lang="ts">
// SVELTE
import { page } from '$app/stores';
import { browser } from '$app/environment';
// LIB
import { ADMIN_PATH, MOBILE_MAX_WIDTH } from '$lib/index';
// I18N
import { i18n } from '$lib/i18n';
// NAVIGATION
import { beforeNavigate, goto } from '$app/navigation';
// CONTEXT
import { getMapContext, setMapContext } from '$lib/context/map.svelte';
import { setOmniContext, PageState, getOmniContext } from '$lib/context/omni.svelte';
// COMPONENTS
import Menu from '$lib/components/layout/Menu.svelte';
import Map from '$lib/components/common/StandaloneMap.svelte';
import Omnibar from '$lib/components/omnibar/Omnibar.svelte';
import Filters from '$lib/components/panels/Filters.svelte';
import Maps from '$lib/components/panels/Maps.svelte';
import Stars from '$lib/components/panels/Stars.svelte';
import Settings from '$lib/components/panels/Settings.svelte';
// TYPES
import type { LayoutData } from '../(app)/$types';
import type { QueryClient } from '@tanstack/svelte-query';
// STYLES
import '$lib/styles/scrollbar.css';

// NAVIGATION STATE
let pageState = $state(PageState.NoTransition);
let navDest = $state('');

// PROPS
let { children } = $props();

// CONTEXT
const { session, queryClient } = $page.data as LayoutData & {
  queryClient: QueryClient;
};

// CONTEXT - Set Map Context
setMapContext(
  queryClient,
  session?.user?.id ?? '',
  session?.user?.userLayers?.map((layer) => layer.layerId) ?? []
);

// CONTEXT - Set Omni Context
setOmniContext(getMapContext());

// CONTEXT - Get Map & Omni Context
const omniContext = getOmniContext();
const mapContext = getMapContext();

// Compute map container classes based on visible panels
let mapContainerClasses = $derived(() => {
  const { filters, maps, stars, settings } = mapContext.state.panels;
  const leftPanelOpen = filters || maps;
  const rightPanelOpen = stars || settings;

  return {
    'ml-[480px]': leftPanelOpen && !browser?.innerWidth < MOBILE_MAX_WIDTH,
    'mr-[480px]': rightPanelOpen && !browser?.innerWidth < MOBILE_MAX_WIDTH
  };
});

// NAVIGATION HANDLING -- State Change Effect
$effect(() => {
  if (browser && omniContext.pageState === PageState.ReadyToNav && navDest) {
    goto(navDest.replace('(app)', '')).then(() => {
      omniContext.pageState = PageState.NoTransition;
    });
  }
});
</script>

<div class="flex flex-col">
  {#if session}
    <main class="fixed top-0 flex h-full w-full flex-1 flex-col gap-4 overflow-hidden">
      <!-- Panels -->
      {#if mapContext.state.panels.filters}
        <Filters />
      {/if}
      {#if mapContext.state.panels.maps}
        <Maps />
      {/if}
      {#if mapContext.state.panels.stars}
        <Stars />
      {/if}
      {#if mapContext.state.panels.settings}
        <Settings />
      {/if}

      <!-- Map Container -->
      <div
        class="relative flex-1 transition-[margin] duration-300"
        class:mapContainerClasses>
        <Map />
        <Omnibar />
        {@render children()}
      </div>
    </main>
    <Menu />
  {:else}
    <main class="fixed top-0 flex h-full w-full flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {/if}
</div>
