<script lang="ts">
// SVELTE
import { browser } from '$app/environment';
import { watch } from 'runed';
import { watchOnce } from 'runed';

// NAVIGATION
import { goto } from '$app/navigation';
// AUTH
import { useSession } from '$lib/auth/client';
// CONTEXT
import { getAppCtx, setAppCtx } from '$lib/context/app.svelte';
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
let { children, data } : AppRootProps = $props();
const { queryClient } = data;

// AUTH
const session = useSession();

// NAVIGATION STATE
let navDest = $state('');

// CONTEXT

// CONTEXT :: APP
// Always set up map context, but only fetch data when authenticated
const appCtx = setAppCtx(
  queryClient,
  $session.data?.user as SessionUser | null
);

// CONTEXT :: OMNI
const omniCtx = setOmniContext(appCtx);

// Re-initialize data when user becomes authenticated
watch(
  () => $session.data?.user,
  () => {
    if ($session.data?.user) {
      appCtx.setUser($session.data.user as unknown as SessionUser);
      appCtx.reinitializeWithAuth();
      appCtx.registerKeydownHandlers();
    } else if (!$session.data?.user && appCtx.user?.id) {
      appCtx.setUser(null);
  }
});

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
  {#if $session.data}
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
  {:else}
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {/if}
</div>
