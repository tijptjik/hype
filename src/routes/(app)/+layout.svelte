<script lang="ts">
// SVELTE
import { browser } from '$app/environment';
// NAVIGATION
import { goto, beforeNavigate } from '$app/navigation';
import { page } from '$app/state';
import { handlePanelParams } from '$lib/navigation';
// AUTH
import { useSession } from '$lib/auth/client';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
import { setOmniCtx } from '$lib/context/omni.svelte';
// ENUMS
import { Panel } from '$lib/enums';
// SERVICES
import { startCircularFlight } from '$lib/client/services/geospatial';
// COMPONENTS
import Menu from '$lib/components/layout/Menu.svelte';
import Map from '$lib/components/common/StandaloneMap.svelte';
import Mapbar from '$lib/components/mapbar/Root.svelte';
import Omnibar from '$lib/components/omnibar/Omnibar.svelte';
import Filters from '$lib/components/panels/Filters.svelte';
import Prisms from '$lib/components/panels/Prisms.svelte';
import Hub from '$lib/components/panels/Hub.svelte';
import Stars from '$lib/components/panels/Stars.svelte';
import Settings from '$lib/components/panels/Settings.svelte';
import Profile from '$lib/components/panels/Profile.svelte';
import LayerSelectionModal from '$lib/components/modals/LayerSelectionModal.svelte';
import GeoLocationModal from '$lib/components/modals/GeoLocationModal.svelte';
import NewFeatureCard from '$lib/components/modals/NewFeatureCard.svelte';
// ENUMS
import { PageState } from '$lib/enums';
// TYPES
import type { LayoutData, LayoutProps } from '../(app)/$types';
import type { QueryClient } from '@tanstack/svelte-query';
// STYLES
import '$lib/styles/scrollbar.css';

type AppRootProps = LayoutProps & {
  children: any;
  data: LayoutData & {
    queryClient: QueryClient;
  };
};

// PROPS
let { children, data }: AppRootProps = $props();
let { hub } = data;

// AUTH
const session = useSession();

// NAVIGATION STATE
let navDest = $state('');

// CONTEXT

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx();
// Set Hub context in AppCtx
appCtx.setHub(hub);

// CONTEXT :: OMNI
const omniCtx = setOmniCtx(appCtx);

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to }) => {
  if (!from || !to) return;

  const fromIsAdmin = from.route.id?.startsWith('/admin');
  const toIsAdmin = to.route.id?.startsWith('/admin');

  // Clear feature cache images when switching between admin and user apps
  if (fromIsAdmin !== toIsAdmin) {
    appCtx.clearFeatureCacheImages();
  }
});

// CIRCULAR FLIGHT ANIMATION STATE
let stopCircularFlight: (() => void) | null = $state(null);

// PROFILE PANEL SCROLL POSITION
let profilePanelContainer: HTMLDivElement | undefined = $state();

// EFFECT: Store scroll position when profile panel closes, restore when it opens
$effect(() => {
  const isProfileOpen = appCtx.isPanelOpen(Panel.profile);

  if (!isProfileOpen && profilePanelContainer) {
    // Panel is closing - store scroll position
    const scrollTop = profilePanelContainer.scrollTop;
    if (scrollTop > 0) {
      // Store in app context for this specific user
      const username = appCtx.state.panels.profile.ctx?.username;
      if (username) {
        (appCtx.state.panels.profile.ctx as any).savedScrollPosition = scrollTop;
      }
    }
  } else if (isProfileOpen && profilePanelContainer) {
    // Panel is opening - restore scroll position
    const savedScrollPosition = (appCtx.state.panels.profile.ctx as any)
      ?.savedScrollPosition;
    if (savedScrollPosition > 0) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (profilePanelContainer) {
          profilePanelContainer.scrollTop = savedScrollPosition;
          // Clear the saved position
          (appCtx.state.panels.profile.ctx as any).savedScrollPosition = 0;
        }
      }, 250);
    }
  }
});

// NAVIGATION HANDLING -- State Change Effect
$effect(() => {
  if (browser && omniCtx && omniCtx.pageState === PageState.ReadyToNav && navDest) {
    goto(navDest.replace('(app)', '')).then(() => {
      omniCtx.pageState = PageState.NoTransition;
    });
  }
});

// INITIAL URL SYNC - Only run once on page load
let hasRunInitialSync = $state(false);

$effect(() => {
  if (!browser || !appCtx.isInitialised || hasRunInitialSync) {
    return;
  }

  // Handle panel parameters from initial URL
  handlePanelParams(appCtx, page.url.searchParams);
  hasRunInitialSync = true; // Prevent future runs
});

// BROWSER NAVIGATION HANDLING - Listen for popstate events
$effect(() => {
  if (!browser) return;

  const handleBrowserNavigation = () => {
    // Parse current URL and sync panel state
    const searchParams = new URLSearchParams(window.location.search);

    // Close all current panels first (don't update URL - we're responding to URL change)
    appCtx.closeAllPanels(false);

    // Handle panel parameters from URL
    handlePanelParams(appCtx, searchParams);
  };

  // Listen specifically for browser back/forward navigation
  window.addEventListener('popstate', handleBrowserNavigation);

  return () => {
    window.removeEventListener('popstate', handleBrowserNavigation);
  };
});

// TODO sync map center and flight starting position.
// CIRCULAR FLIGHT ANIMATION
$effect(() => {
  if (!$session.isPending) {
    if (!$session.data) {
      // User is not authenticated - start circular flight animation
      if (!stopCircularFlight) {
        setTimeout(() => {
          const cleanup = startCircularFlight(appCtx, [114.17276, 22.29191], 5);
          if (cleanup) {
            stopCircularFlight = cleanup;
          }
        }, 1000);
      }
    } else {
      // User is authenticated - stop circular flight animation
      if (stopCircularFlight) {
        stopCircularFlight();
        stopCircularFlight = null;
      }
    }
  }
});
</script>

<div class="flex h-dvh flex-col justify-around overflow-hidden">
  {#if !$session.isPending && $session.data && appCtx.isInitialised}
    <main
      class="relative top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      <!-- Panels -->
      <Prisms />
      <Hub {hub} />
      <Filters />
      <Stars />
      <Settings />
      <Profile bind:panelContainer={profilePanelContainer} />
      <!-- Map Container -->
      <div class="relative flex h-full flex-1 flex-col">
        <Omnibar />
        <Map />
        {@render children()}
        <Mapbar />
        {#if omniCtx.isNewFeatureMode}
          <LayerSelectionModal />
          <GeoLocationModal />
          <NewFeatureCard />
        {/if}
      </div>
    </main>
    <Menu {hub} />
  {:else if !$session.isPending && !$session.data}
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <Map />
    </main>
  {:else}
    <!-- Loading state while session is pending -->
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      <div class="flex h-full items-center justify-center">
        <div class="loading loading-ring loading-lg text-primary"></div>
      </div>
    </main>
  {/if}
</div>
