<script lang="ts">
// SVELTE
import { browser } from '$app/environment';
// NAVIGATION
import { goto } from '$app/navigation';
// AUTH
import { useSession } from '$lib/auth/client';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { setOmniContext, PageState } from '$lib/context/omni.svelte';
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
import type { LayoutData, LayoutProps } from '../(app)/$types';
import type { QueryClient } from '@tanstack/svelte-query';
import type { SessionUser } from '$lib/types';
// STYLES
import '$lib/styles/scrollbar.css';

type AppRootProps = LayoutProps & {
  children: any;
  data: LayoutData & {
    queryClient: QueryClient;
  };
};

// PROPS
let { children }: AppRootProps = $props();

// AUTH
const session = useSession();

// NAVIGATION STATE
let navDest = $state('');

// CONTEXT

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx();

// Initialize AppCtx if not already initialized
if (!appCtx.isInitialised) {
  const currentUser = $session.data?.user;
  if (currentUser) {
    appCtx.setUser(currentUser as SessionUser);
    appCtx.init(currentUser.id);
  } else {
    appCtx.init(null);
  }
}

// CONTEXT :: OMNI
const omniCtx = setOmniContext(appCtx);



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
  {#if !$session.isPending && $session.data}
    <main
      class="relative top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      <!-- Panels -->
      {#if appCtx.state.panels.filters}
        <Filters />
      {/if}
      {#if appCtx.state.panels.maps}
        <Maps />
      {/if}
      {#if appCtx.state.panels.stars}
        <Stars />
      {/if}
      {#if appCtx.state.panels.settings}
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
  {:else if !$session.isPending && !$session.data}
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {:else}
    <!-- Loading state while session is pending -->
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      <div class="flex h-full items-center justify-center">
        <div class="loading loading-spinner loading-lg text-primary"></div>
      </div>
    </main>
  {/if}
</div>
