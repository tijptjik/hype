<script lang="ts">
// SVELTE
import { browser } from '$app/environment'
// NAVIGATION
import { goto, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
import { dismissActiveFeatureNavigation, handlePanelParams } from '$lib/navigation'
import { useSession } from '$lib/auth/client'
import { useOmnibarModel } from '$lib/adapters/bars'
import { shouldSkipGlobalKeydown } from '$lib/client/keybindings'
// I18N
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
import { setOmniCtx } from '$lib/context/omni.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// SERVICES
import { startCircularFlight } from '$lib/client/services/geospatial'
import { getActiveMapStyleCode } from '$lib/client/services/map'
import MapCanvas from '$lib/bits/patterns/maps/MapCanvas.svelte'
import Filters from '$lib/components/panels/Filters.svelte'
import Prisms from '$lib/components/panels/Prisms.svelte'
import Stars from '$lib/components/panels/Stars.svelte'
import Hub from '$lib/components/panels/Hub.svelte'
// import Plan from '$lib/components/panels/Plan.svelte'
// import Passport from '$lib/components/panels/Passport.svelte'
// import EventCompanion from '$lib/components/panels/EventCompanion.svelte'
import Settings from '$lib/components/panels/Settings.svelte'
import Profile from '$lib/components/panels/Profile.svelte'
// BITS
import {
  AppLanding,
  AppMapOverlayBar,
  AppMain,
  AppNav,
  AppShell,
  AppSurface,
  Omnibar,
} from '$lib/bits'
// ENUMS
import { PageState } from '$lib/enums'
// TYPES
import type { LayoutData, LayoutProps } from '../(app)/$types'
import type { QueryClient } from '@tanstack/svelte-query'

type AppRootProps = LayoutProps & {
  children: any
  data: LayoutData & {
    queryClient: QueryClient
  }
}

// PROPS
let { children, data }: AppRootProps = $props()
const hub = $derived(data.hub)

// AUTH
const session = useSession()

// NAVIGATION STATE
let navDest = $state('')

// CONTEXT

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx()
const responsiveCtx = getResponsiveCtx()
// Set Hub context in AppCtx
$effect(() => {
  appCtx.setHub(hub)
})

// CONTEXT :: OMNI
const omniCtx = setOmniCtx(appCtx)
const omnibarModel = useOmnibarModel(appCtx, omniCtx, responsiveCtx)
const omnibarProps = $derived(omnibarModel.getOmnibarProps())

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to }) => {
  if (!from || !to) return

  const fromIsAdmin = from.route.id?.startsWith('/admin')
  const toIsAdmin = to.route.id?.startsWith('/admin')

  // Clear feature cache images when switching between admin and user apps
  if (fromIsAdmin !== toIsAdmin) {
    appCtx.clearFeatureCacheImages()
  }
})

// CIRCULAR FLIGHT ANIMATION STATE
let stopCircularFlight: (() => void) | null = $state(null)
const activeMapStyleCode = $derived.by(() => getActiveMapStyleCode(appCtx))
const menuReservedHeight = $derived(responsiveCtx.menuReservedHeight)

// PROFILE PANEL SCROLL POSITION
let profilePanelContainer: HTMLDivElement | undefined = $state()

// EFFECT: Store scroll position when profile panel closes, restore when it opens
$effect(() => {
  const isProfileOpen = appCtx.isPanelOpen(Panel.profile)
  const profileCtx = appCtx.state.panels.profile.ctx as
    | ({ savedScrollPosition?: number } & typeof appCtx.state.panels.profile.ctx)
    | undefined

  if (!isProfileOpen && profilePanelContainer) {
    // Panel is closing - store scroll position
    const scrollTop = profilePanelContainer.scrollTop
    if (scrollTop > 0) {
      // Store in app context for this specific user
      const username = profileCtx?.username
      if (username) {
        profileCtx.savedScrollPosition = scrollTop
      }
    }
  } else if (isProfileOpen && profilePanelContainer) {
    // Panel is opening - restore scroll position
    const savedScrollPosition = profileCtx?.savedScrollPosition ?? 0
    if (savedScrollPosition > 0) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (profilePanelContainer) {
          profilePanelContainer.scrollTop = savedScrollPosition
          // Clear the saved position
          if (profileCtx) {
            profileCtx.savedScrollPosition = 0
          }
        }
      }, 250)
    }
  }
})

// NAVIGATION HANDLING -- State Change Effect
$effect(() => {
  if (browser && omniCtx && omniCtx.pageState === PageState.ReadyToNav && navDest) {
    goto(navDest.replace('(app)', '')).then(() => {
      omniCtx.pageState = PageState.NoTransition
    })
  }
})

// INITIAL URL SYNC - Only run once on page load
let hasRunInitialSync = $state(false)

$effect(() => {
  if (!browser || !appCtx.isInitialised || hasRunInitialSync) {
    return
  }

  // Handle panel parameters from initial URL
  handlePanelParams(appCtx, page.url.searchParams)
  hasRunInitialSync = true // Prevent future runs
})

// BROWSER NAVIGATION HANDLING - Listen for popstate events
$effect(() => {
  if (!browser) return

  const handleBrowserNavigation = () => {
    // Parse current URL and sync panel state
    const searchParams = new URLSearchParams(window.location.search)

    // Close all current panels first (don't update URL - we're responding to URL change)
    appCtx.closeAllPanels(false)

    // Handle panel parameters from URL
    handlePanelParams(appCtx, searchParams)
  }

  // Listen specifically for browser back/forward navigation
  window.addEventListener('popstate', handleBrowserNavigation)

  return () => {
    window.removeEventListener('popstate', handleBrowserNavigation)
  }
})

// TODO sync map center and flight starting position.
// CIRCULAR FLIGHT ANIMATION
$effect(() => {
  if (!$session.isPending) {
    if (!$session.data) {
      // User is not authenticated - start circular flight animation
      if (!stopCircularFlight) {
        setTimeout(() => {
          const cleanup = startCircularFlight(appCtx, [114.17276, 22.29191], 5)
          if (cleanup) {
            stopCircularFlight = cleanup
          }
        }, 1000)
      }
    } else {
      // User is authenticated - stop circular flight animation
      if (stopCircularFlight) {
        stopCircularFlight()
        stopCircularFlight = null
      }
    }
  }
})

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return
  }

  if (shouldSkipGlobalKeydown(document.activeElement)) {
    return
  }

  if (Object.values(appCtx.state.panels).some(panel => panel.isOpen)) {
    return
  }

  const didDismiss = dismissActiveFeatureNavigation({
    hasActiveFeature: Boolean(appCtx.getActiveFeature()),
    isCardOpen: omniCtx.state.isCardOpen,
    closeCard: () => omniCtx.closeCard(),
    resetActiveFeature: () => appCtx.resetActiveFeature(),
    resetToSearch: () => omniCtx.resetToSearch(),
    setIntentionallyClosing: value => {
      omniCtx.isIntentionallyClosing = value
    },
  })

  if (!didDismiss) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<AppShell>
  {#if !$session.isPending && $session.data && appCtx.isInitialised}
    <AppSurface>
      <MapCanvas mapStyleCode={activeMapStyleCode} bottomInset={menuReservedHeight} />
      <!-- Panels -->
      <Prisms />
      <Stars />
      <Hub {hub} />
      <Filters />
      <!-- <Plan /> -->
      <!-- <Passport /> -->
      <!-- <EventCompanion /> -->
      <Settings />
      <Profile bind:panelContainer={profilePanelContainer} />
      <AppMain>
        <Omnibar {...omnibarProps} />
        {@render children()}
        <AppMapOverlayBar />
        <AppNav {hub} />
      </AppMain>
    </AppSurface>
  {:else if !$session.isPending && !$session.data}
    <AppLanding> {@render children()} </AppLanding>
  {/if}
</AppShell>
