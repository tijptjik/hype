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

// NAVIGATION

// Redirect to / if user is not authenticated
if (!session) {
  goto(i18n.resolveRoute('/'));
}

// // NAVIGATION HANDLING -- beforeNavigate
// beforeNavigate((nav) => {
//   console.log('beforeNavigate', nav.to);
//   // Handle refresh or same-page navigation
//   if (nav.to?.route.id === ADMIN_PATH) {
//     console.log('admin');
//     return;
//   }
//   if (
//     nav.to === null ||
//     nav.to?.route.id === $page.route.id ||
//     omniContext.pageState === PageState.NoTransition
//   ) {
//     navDest = '';
//     return;
//   }

//   // Update state for transition
//   if (omniContext.pageState === PageState.NeedTransition) {
//     omniContext.pageState = PageState.Transitioning;
//   }

//   // Cache destination and cancel navigation during transition
//   if (omniContext.pageState === PageState.Transitioning) {
//     navDest = nav.to?.route.id || '/';
//     nav.cancel();
//   }
// });

// NAVIGATION HANDLING -- State Change Effect
$effect(() => {
  if (browser && omniContext.pageState === PageState.ReadyToNav && navDest) {
    goto(navDest.replace('(app)', '')).then(() => {
      omniContext.pageState = PageState.NoTransition;
    });
  }
});
</script>

<div class="flex h-screen w-full flex-col">
  {#if session}
    <main class="relative flex w-full flex-1 flex-col gap-4 overflow-hidden">
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
    <main class="relative flex w-full flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {/if}
</div>
