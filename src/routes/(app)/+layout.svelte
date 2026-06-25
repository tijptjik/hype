<script lang="ts">
// SVELTE
import { browser } from '$app/environment'
import type { Snippet } from 'svelte'
// NAVIGATION
import { goto, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
import { dismissActiveFeatureNavigation, handlePanelParams } from '$lib/navigation'
import { useSession } from '$lib/auth/client'
import { useOmnibarModel } from '$lib/adapters/bars'
import {
  createHubSubscriptionModelParams,
  toHubUserStateFlags,
  useHubSubscriptionModel,
} from '$lib/adapters/hub'
import {
  dismissHubSubscriptionPrompt,
  joinHubSubscription,
} from '$lib/client/services/hubSubscription'
import { shouldSkipGlobalKeydown } from '$lib/client/keybindings'
import { toast } from 'svelte-sonner'
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
  AppHubSubscriptionOverlay,
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
import type { HubUserStateFlags } from '$lib/types'

type AppRootProps = LayoutProps & {
  children: Snippet
  data: LayoutData & {
    queryClient: QueryClient
  }
}

// PROPS
let { children, data }: AppRootProps = $props()
const hub = $derived(data.hub)
const hubI18n = $derived(
  (hub?.i18n ?? {}) as Record<string, Record<string, string | null | undefined>>,
)

// AUTH
const session = useSession()
const initialHubUserState = $derived(data.hubUserState ?? null)
const isHubSubscriptionConfigured = $derived(
  Boolean(
    hub?.isSubscriptionAvailable &&
      hub?.subscriptionId?.trim() &&
      hub?.subscriptionService,
  ),
)

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
const subscriptionOffsetX = $derived(responsiveCtx.getAppMainOffsetX())

let hubUserState = $state<HubUserStateFlags>({
  subscriptionPromptDismissed: false,
  subscriptionMember: false,
  hasAgreedToTerms: false,
})
let isSubscriptionBusy = $state(false)
let isHubSubscriptionOverlayOpen = $state(false)

$effect(() => {
  hubUserState = toHubUserStateFlags(initialHubUserState)
})

$effect(() => {
  if (!isHubSubscriptionConfigured || hubUserState.subscriptionMember) {
    isHubSubscriptionOverlayOpen = false
  }
})

const subscriptionModel = useHubSubscriptionModel(() => ({
  ...createHubSubscriptionModelParams({
    hubCode: hub?.code,
    hubI18n,
    isSubscriptionConfigured: isHubSubscriptionConfigured,
    subscriptionPlacement: hub?.subscriptionPlacement,
    userState: hubUserState,
    features: appCtx.getVisibleFeatures(),
    userPreferences: appCtx.getUserPreferences(),
    isLoading: isSubscriptionBusy,
    onSelect: handleOpenHubSubscriptionOverlay,
    onJoin: handleJoinSubscription,
    onDismiss: handleDismissSubscriptionPrompt,
  }),
}))
const subscriptionVisibility = $derived(subscriptionModel.getVisibility())
const omnibarProps = $derived(omnibarModel.getOmnibarProps())
const hubPanelSubscriptionProps = $derived(
  subscriptionModel.getHubPanelSubscriptionProps(),
)
const hubSubscriptionOverlayProps = $derived(
  subscriptionModel.getHubSubscriptionOverlayProps(),
)
const appMenuSubscriptionItemProps = $derived(
  subscriptionModel.getAppMenuSubscriptionItemProps(),
)
const privacyPolicyDialogProps = $derived(
  subscriptionModel.getPrivacyPolicyDialogProps(),
)
const termsOfServiceDialogProps = $derived(
  subscriptionModel.getTermsOfServiceDialogProps(),
)

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
const MAP_GESTURE_SURFACE_SELECTOR = '[data-map-gesture-surface="true"]'

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
      const timeoutId = setTimeout(() => {
        if (profilePanelContainer) {
          profilePanelContainer.scrollTop = savedScrollPosition
          // Clear the saved position
          if (profileCtx) {
            profileCtx.savedScrollPosition = 0
          }
        }
      }, 250)

      return () => {
        clearTimeout(timeoutId)
      }
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

/**
 * Attempts to subscribe the current user to the active hub updates.
 *
 * @returns Nothing.
 */
async function handleJoinSubscription(): Promise<void> {
  if (!hub?.id || isSubscriptionBusy) return

  isSubscriptionBusy = true

  try {
    const result = await joinHubSubscription({
      hubId: hub.id,
      hasAgreedToTerms: true,
    })

    if (result?.data?.subscriptionMember) {
      hubUserState = {
        ...hubUserState,
        subscriptionMember: true,
        subscriptionPromptDismissed: true,
        hasAgreedToTerms: true,
      }
      isHubSubscriptionOverlayOpen = false
      toast.success('Subscription confirmed')
      return
    }

    if (result?.data?.redirectUrl && browser) {
      window.location.assign(result.data.redirectUrl)
      return
    }

    toast.error('Subscription could not be completed')
  } catch (error) {
    toast.error(
      error instanceof Error && error.message.length
        ? error.message
        : 'Something went wrong',
    )
  } finally {
    isSubscriptionBusy = false
  }
}

/**
 * Persists dismissal of the active hub subscription prompt for the current user.
 *
 * @returns Nothing.
 */
async function handleDismissSubscriptionPrompt(): Promise<void> {
  if (!hub?.id || isSubscriptionBusy) return

  isSubscriptionBusy = true

  try {
    await dismissHubSubscriptionPrompt({
      hubId: hub.id,
    })

    hubUserState = {
      ...hubUserState,
      subscriptionPromptDismissed: true,
    }
    isHubSubscriptionOverlayOpen = false
  } catch (error) {
    toast.error(
      error instanceof Error && error.message.length
        ? error.message
        : 'Something went wrong',
    )
  } finally {
    isSubscriptionBusy = false
  }
}

function handleOpenHubSubscriptionOverlay(): void {
  isHubSubscriptionOverlayOpen = true
}

/**
 * Returns whether the event target lives inside the map subtree that is allowed
 * to consume pinch gestures.
 *
 * @param target Native event target to inspect.
 * @returns `true` when the target is inside the map gesture surface.
 */
function isMapGestureSurfaceTarget(target: EventTarget | null): boolean {
  if (target instanceof Element) {
    return Boolean(target.closest(MAP_GESTURE_SURFACE_SELECTOR))
  }

  if (target instanceof Node) {
    return Boolean(target.parentElement?.closest(MAP_GESTURE_SURFACE_SELECTOR))
  }

  return false
}

/**
 * Prevents multi-touch browser zoom everywhere except the map canvas subtree.
 *
 * @param event Native touch event emitted during a potential pinch interaction.
 * @returns Nothing.
 */
function handleDocumentTouchZoomBoundary(event: TouchEvent): void {
  if (event.touches.length < 2 || isMapGestureSurfaceTarget(event.target)) {
    return
  }

  event.preventDefault()
}

/**
 * Prevents Safari gesture zoom events everywhere except the map canvas subtree.
 *
 * @param event Native WebKit gesture event.
 * @returns Nothing.
 */
function handleDocumentGestureZoomBoundary(event: Event): void {
  if (isMapGestureSurfaceTarget(event.target)) {
    return
  }

  event.preventDefault()
}

// Keep pinch zoom reserved for the map so the rest of the app surface cannot scale.
$effect(() => {
  if (!browser) return

  document.addEventListener('touchstart', handleDocumentTouchZoomBoundary, {
    passive: false,
    capture: true,
  })
  document.addEventListener('touchmove', handleDocumentTouchZoomBoundary, {
    passive: false,
    capture: true,
  })
  document.addEventListener('gesturestart', handleDocumentGestureZoomBoundary, {
    passive: false,
    capture: true,
  })
  document.addEventListener('gesturechange', handleDocumentGestureZoomBoundary, {
    passive: false,
    capture: true,
  })

  return () => {
    document.removeEventListener('touchstart', handleDocumentTouchZoomBoundary, {
      capture: true,
    })
    document.removeEventListener('touchmove', handleDocumentTouchZoomBoundary, {
      capture: true,
    })
    document.removeEventListener('gesturestart', handleDocumentGestureZoomBoundary, {
      capture: true,
    })
    document.removeEventListener('gesturechange', handleDocumentGestureZoomBoundary, {
      capture: true,
    })
  }
})
</script>

<!-- biome-ignore lint/a11y/noStaticElementInteractions: Svelte special element handles global keyboard shortcuts. -->
<svelte:window onkeydown={handleWindowKeydown} />

<AppShell>
  {#if !$session.isPending && $session.data && appCtx.isInitialised}
    <AppSurface>
      <MapCanvas mapStyleCode={activeMapStyleCode} bottomInset={menuReservedHeight} />
      <!-- Panels -->
      <Prisms />
      <Stars />
      <Hub
        {hub}
        showSubscription={subscriptionVisibility.showHubPanelSubscription}
        subscriptionProps={hubPanelSubscriptionProps}
        {privacyPolicyDialogProps}
        {termsOfServiceDialogProps}
      />
      <Filters />
      <!-- <Plan /> -->
      <!-- <Passport /> -->
      <!-- <EventCompanion /> -->
      <Settings />
      <Profile bind:panelContainer={profilePanelContainer} />
      <AppMain>
        <AppHubSubscriptionOverlay
          class="z-50"
          isVisible={subscriptionVisibility.showHubSubscriptionOverlay ||
            isHubSubscriptionOverlayOpen}
          offsetX={subscriptionOffsetX}
          subscriptionOverlayProps={hubSubscriptionOverlayProps}
          {privacyPolicyDialogProps}
          {termsOfServiceDialogProps}
        />
        <Omnibar {...omnibarProps} />
        {@render children()}
        <AppMapOverlayBar />
        <AppNav
          {hub}
          subscriptionItem={{
            isVisible: subscriptionVisibility.showAppMenuSubscriptionItem,
            label: appMenuSubscriptionItemProps.label ?? 'Subscribe',
            onSelect: appMenuSubscriptionItemProps.onSelect ?? handleOpenHubSubscriptionOverlay,
          }}
        />
      </AppMain>
    </AppSurface>
  {:else if !$session.isPending && !$session.data}
    <AppLanding> {@render children()} </AppLanding>
  {/if}
</AppShell>
