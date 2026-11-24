<script lang="ts">
// ADAPTERS
import { useProfilePanelModel } from '#lib/adapters/panels/useProfilePanelModel.svelte.js'
import { useSavedFeatureListModel } from '#lib/adapters/panels/useSavedFeatureListModel.svelte.js'
import { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import { usePanelShellModel } from '#lib/adapters/panels/usePanelShellModel.svelte.js'
import { useSettingsPanelModel } from '#lib/adapters/panels/useSettingsPanelModel.svelte.js'
import { useNavigationPanelModel } from '#lib/adapters/panels/useNavigationPanelModel.svelte.js'
import { getThemeModel } from '#lib/themes/theme.svelte.js'
// SVELTE
import { browser } from '$app/env'
import { untrack, type Snippet } from 'svelte'
// NAVIGATION
import { goto, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
import {
  dismissActiveFeatureNavigation,
  handlePanelParams,
} from '#lib/navigation/index.js'
import { useSession } from '#lib/auth/client.js'
import { requestAccountUpgrade } from '#lib/auth/upgrade.js'
import { useOmnibarModel } from '#lib/adapters/bars/index.js'
import {
  createHubSubscriptionModelParams,
  toHubUserStateFlags,
  useHubSubscriptionModel,
} from '#lib/adapters/hub/index.js'
import {
  dismissHubSubscriptionPrompt,
  joinHubSubscription,
} from '#lib/client/services/hubSubscription.js'
import { shouldSkipGlobalKeydown } from '#lib/client/keybindings.js'
import { toast } from 'svelte-sonner'
// ANALYTICS
import { ProductUsageObserver } from '#lib/analytics/clientProductUsage.js'
// COMPONENTS
import DeferredPanel from '#lib/bits/patterns/panels/DeferredPanel.svelte'
import AppSurface from '#lib/bits/patterns/layout/app/components/AppSurface.svelte'
import LoadScreen from '#lib/bits/custom/loading/LoadScreen.svelte'
// I18N
import { m } from '#lib/i18n.js'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setOmniCtx } from '#lib/context/omni.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// SERVICES
import {
  getActiveMapStyleCode,
  getActiveMapStyleIdentity,
} from '#lib/client/services/map.js'
import MapCanvas from '#lib/bits/patterns/maps/LazyMapCanvas.svelte'
import MapLoading from '#lib/bits/patterns/maps/MapLoading.svelte'
import { useResourcePanelModel } from '#lib/adapters/panels/useResourcePanelModel.svelte.js'
// import Plan from '#lib/bits/patterns/planPanel/PlanPanel.svelte'
// import Passport from '#lib/bits/patterns/passportPanel/PassportPanel.svelte'
// import EventCompanion from '#lib/bits/patterns/eventCompanionPanel/EventCompanionPanel.svelte'
// BITS
import AppHubSubscriptionOverlay from '#lib/bits/patterns/layout/app/components/AppHubSubscriptionOverlay.svelte'
import AppMapOverlayBar from '#lib/bits/patterns/layout/app/components/AppMapOverlayBar.svelte'
import AppMain from '#lib/bits/patterns/layout/app/components/AppMain.svelte'
import AppNav from '#lib/bits/patterns/layout/app/components/AppNav.svelte'
import AppShell from '#lib/bits/patterns/layout/app/components/AppShell.svelte'
import Omnibar from '#lib/bits/patterns/bars/omnibar/Omnibar.svelte'
// ENUMS
import { PageState } from '#lib/enums.js'
// BITS COMPONENTS
import { publicPanelModules } from '#lib/bits/patterns/panels/publicPanelModules.js'
// TYPES
import type { LayoutData, LayoutProps } from '../(app)/$types'

import type { HubUserStateFlags } from '#lib/api/services/hub.types.js'

type AppRootProps = LayoutProps & { children: Snippet; data: LayoutData & {} }

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

const usageObserver = new ProductUsageObserver()
$effect(() => {
  if (!hub?.id) return
  const snapshot = {
    hubId: hub.id,
    featureId: appCtx.getActiveFeature()?.id ?? null,
    layers: [...appCtx.view.scope.prisms.layer],
    projects: [...appCtx.view.scope.prisms.project],
  }
  untrack(() => usageObserver.sync(snapshot))
})

const settingsModel = useSettingsPanelModel(appCtx.view, getThemeModel())
const filtersShell = usePanelShellModel(appCtx.view, Panel.filters)
const starsShell = usePanelShellModel(appCtx.view, Panel.stars)
const hubShell = usePanelShellModel(appCtx.view, Panel.hub)
const profileShell = usePanelShellModel(appCtx.view, Panel.profile)
const navigationShell = usePanelShellModel(appCtx.view, Panel.navigation)
const navigationModel = useNavigationPanelModel(appCtx, () => omniCtx.closeCard())
const responsiveCtx = getResponsiveCtx()
const surfaceLayout = appCtx.view.layout
// Decide from the URL before the asynchronous indoor catalogue resolves.
const isIndoorRoute = $derived(
  /^\/(?:premises|buildings)\/[a-z0-9-]+(?:\/places\/[^/]+)?\/?$/.test(
    page.url.pathname,
  ),
)
let hasRequestedOverworld = $state(false)
// Retain the outdoor camera after its first use, including subsequent indoor visits.
$effect(() => {
  if (!isIndoorRoute || appCtx.station.returningToMap) {
    hasRequestedOverworld = true
    // Download the renderer while identity and layer defaults resolve. LazyMapCanvas owns retry.
    void import('#lib/bits/patterns/maps/MapCanvas.svelte').catch(() => {})
  }
})
let hasPaintedMap = $state(false)
// Mount controls once both the viewport and the available map area have real dimensions.
const controlsReady = $derived(
  responsiveCtx.visibleWindowWidth > 0 &&
    responsiveCtx.visibleWindowHeight > 0 &&
    surfaceLayout.main.width > 0 &&
    surfaceLayout.main.height > 0,
)
// Account-scoped contents need their context even when the controls are already interactive.
const dataReady = $derived(
  Boolean($session.data && !$session.isPending && appCtx.view.isInitialised),
)

// Reapply the opening guard on viewport resize while preserving the newest panel.
$effect(() => {
  const width = responsiveCtx.window.width
  untrack(() => {
    for (const panel of appCtx.view.panels.getPanelsToCloseForViewport(width)) {
      appCtx.view.panels.closePanel(panel)
    }
  })
})

// Set Hub context in AppCtx
$effect(() => {
  appCtx.view.setHub(hub)
})

// CONTEXT :: OMNI
const omniCtx = setOmniCtx(appCtx)

// Returning home (including browser history) clears public selection without navigating again.
$effect(() => {
  if (page.url.pathname === '/') untrack(() => omniCtx.resetToSearch(false))
})
const profileModel = useProfilePanelModel(appCtx.view, omniCtx)
const starsModel = {
  wishlist: useSavedFeatureListModel(
    appCtx.view,
    omniCtx,
    'wishlist',
    () => dataReady && starsShell.open,
  ),
  visited: useSavedFeatureListModel(
    appCtx.view,
    omniCtx,
    'visited',
    () => dataReady && starsShell.open,
  ),
  get isGuestAccount() {
    return $session.data?.user?.isAnonymous === true
  },
}

const filtersModel = useFilterPanelModel(
  appCtx.view,
  omniCtx,
  appCtx.zoomToFilteredFeatures,
  () => dataReady && filtersShell.open,
)
const prismsModel = useResourcePanelModel(appCtx.view, 'prisms', undefined, omniCtx)
const omnibarModel = useOmnibarModel(
  appCtx,
  omniCtx,
  responsiveCtx,
  appCtx.getMapCenter,
)
const subscriptionOffsetX = $derived(surfaceLayout.getAppMainOffsetX())

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
    userPreferences: appCtx.view.getUserPreferences(),
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
beforeNavigate(({ from, to, shallow }) => {
  if (shallow) return
  if (!from || !to) return

  const fromIsAdmin = from.route.id?.startsWith('/admin')
  const toIsAdmin = to.route.id?.startsWith('/admin')

  // Clear feature cache images when switching between admin and user apps
  if (fromIsAdmin !== toIsAdmin) {
    appCtx.view.clearFeatureCacheImages()
  }
})

const activeMapStyleContext = $derived.by(() => ({
  identity: getActiveMapStyleIdentity(appCtx),
  style: getActiveMapStyleCode(appCtx),
}))
$effect(() => {
  const context = activeMapStyleContext
  untrack(() => settingsModel.onActiveMapContext(context.identity, context.style))
})
const activeMapStyleCode = $derived(settingsModel.resolvedMapTheme)
const MAP_GESTURE_SURFACE_SELECTOR = '[data-map-gesture-surface="true"]'

// PROFILE PANEL SCROLL POSITION
let profilePanelContainer: HTMLDivElement | undefined = $state()

// EFFECT: Store scroll position when profile panel closes, restore when it opens
$effect(() => {
  const isProfileOpen = appCtx.view.panels.isPanelOpen(Panel.profile)
  const profileCtx = appCtx.view.panels.state.profile.ctx as
    | ({ savedScrollPosition?: number } & typeof appCtx.view.panels.state.profile.ctx)
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
  if (!browser || !controlsReady || hasRunInitialSync) {
    return
  }

  // Handle panel parameters from initial URL
  handlePanelParams(appCtx.view.panels, page.url.searchParams)

  hasRunInitialSync = true // Prevent future runs
})

// BROWSER NAVIGATION HANDLING - Listen for popstate events
$effect(() => {
  if (!browser) return

  const handleBrowserNavigation = () => {
    // Parse current URL and sync panel state
    const searchParams = new URLSearchParams(window.location.search)

    // Close all current panels first (don't update URL - we're responding to URL change)
    appCtx.view.panels.closeAllPanels(false)

    // Handle panel parameters from URL
    handlePanelParams(appCtx.view.panels, searchParams)
  }

  // Listen specifically for browser back/forward navigation
  window.addEventListener('popstate', handleBrowserNavigation)

  return () => {
    window.removeEventListener('popstate', handleBrowserNavigation)
  }
})

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return
  }

  if (shouldSkipGlobalKeydown(document.activeElement)) {
    return
  }

  if (Object.values(appCtx.view.panels.state).some(panel => panel.isOpen)) {
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
  if ($session.data?.user?.isAnonymous === true) {
    requestAccountUpgrade('subscription', page.url.href)
    return
  }

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
  if ($session.data?.user?.isAnonymous === true) {
    requestAccountUpgrade('subscription', page.url.href)
    return
  }
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

<svelte:window onkeydown={handleWindowKeydown}></svelte:window>

<AppShell>
  {#if !appCtx.view.publicationPreview || dataReady}
    <AppSurface intro={controlsReady ? 'complete' : undefined}>
      {#if hasRequestedOverworld && dataReady}
        <MapCanvas
          intro={!hasPaintedMap}
          onVisualReady={() => {
            hasPaintedMap = true
          }}
          highlightedSegment={navigationModel.highlightedSegment}
          journey={navigationModel.state.phase === 'ready'
            ? navigationModel.state.journey
            : null}
          mapStyleCode={activeMapStyleCode}
          onMapReady={controller => {
            appCtx.mapController = controller
          }}
        />
      {/if}
      <!-- Retain the indoor controller after first entry so it can finish a return to the world map. -->
      <DeferredPanel
        active={dataReady && (isIndoorRoute || appCtx.station.active)}
        load={() => import('#lib/bits/patterns/station/StationSurface.svelte')}
      >
        {#snippet pending()}
          <MapLoading />
        {/snippet}
        {#snippet children(StationSurface)}
          <StationSurface />
        {/snippet}
      </DeferredPanel>
      <!-- Panels -->
      {#if appCtx.station.active}
        <DeferredPanel
          active={prismsModel.open}
          ready={dataReady}
          load={publicPanelModules.station}
        >
          {#snippet children(StationPanel)}
            <StationPanel model={prismsModel} />
          {/snippet}
        </DeferredPanel>
      {:else}
        <DeferredPanel
          active={prismsModel.open}
          ready={dataReady}
          load={publicPanelModules.prisms}
        >
          {#snippet children(ResourcePanel)}
            <ResourcePanel model={prismsModel} />
          {/snippet}
        </DeferredPanel>
      {/if}
      <DeferredPanel
        active={starsShell.open}
        ready={dataReady}
        load={publicPanelModules.stars}
      >
        {#snippet children(Stars)}
          <Stars shell={starsShell} model={starsModel} />
        {/snippet}
      </DeferredPanel>
      <DeferredPanel
        active={hubShell.open}
        ready={dataReady}
        load={publicPanelModules.hub}
      >
        {#snippet children(Hub)}
          <Hub
            shell={hubShell}
            preferences={appCtx.view.getUserPreferences()}
            {hub}
            showSubscription={subscriptionVisibility.showHubPanelSubscription}
            subscriptionProps={hubPanelSubscriptionProps}
            {privacyPolicyDialogProps}
            {termsOfServiceDialogProps}
          />
        {/snippet}
      </DeferredPanel>
      <DeferredPanel
        active={filtersShell.open}
        ready={dataReady}
        load={publicPanelModules.filters}
      >
        {#snippet children(Filters)}
          <Filters shell={filtersShell} model={filtersModel} />
        {/snippet}
      </DeferredPanel>
      <DeferredPanel
        active={navigationShell.open}
        ready={dataReady}
        load={() => import('#lib/bits/patterns/navigationPanel/NavigationPanel.svelte')}
      >
        {#snippet children(NavigationPanel)}
          <NavigationPanel shell={navigationShell} model={navigationModel} />
        {/snippet}
      </DeferredPanel>
      <!-- <Plan /> -->
      <!-- <Passport /> -->
      <!-- <EventCompanion /> -->
      <DeferredPanel
        active={settingsModel.open}
        ready={dataReady}
        load={publicPanelModules.settings}
      >
        {#snippet children(SettingsPanel)}
          <SettingsPanel model={settingsModel} />
        {/snippet}
      </DeferredPanel>
      <DeferredPanel
        active={profileShell.open && Boolean(profileModel.username)}
        ready={dataReady}
        load={() => import('#lib/bits/patterns/profilePanel/ProfilePanel.svelte')}
      >
        {#snippet children(ProfilePanel)}
          <ProfilePanel
            model={profileModel}
            shell={profileShell}
            bind:panelContainer={profilePanelContainer}
          />
        {/snippet}
      </DeferredPanel>
      <AppMain>
        {#if controlsReady}
          {#if navigationModel.showingMap && navigationModel.state.phase === 'ready'}
            <div
              class="border-border bg-panel pointer-events-auto absolute bottom-40 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-xl border p-2 shadow-lg"
            >
              <button
                type="button"
                class="bg-primary text-primary-content rounded-lg px-4 py-3 text-sm font-medium whitespace-nowrap"
                onclick={() => navigationModel.showDirections()}
              >
                Show directions
              </button>
              <button
                type="button"
                class="hover:bg-base-content/10 rounded-lg px-3 py-3 text-sm whitespace-nowrap"
                onclick={() => navigationModel.close()}
              >
                End route
              </button>
            </div>
          {/if}
          <AppHubSubscriptionOverlay
            class="z-50"
            isVisible={dataReady &&
              (subscriptionVisibility.showHubSubscriptionOverlay ||
                isHubSubscriptionOverlayOpen)}
            offsetX={subscriptionOffsetX}
            subscriptionOverlayProps={hubSubscriptionOverlayProps}
            {privacyPolicyDialogProps}
            {termsOfServiceDialogProps}
          />
          <Omnibar {...omnibarProps}>
            {#snippet below()}
              {#if appCtx.view.publicationPreview}
                <aside
                  aria-label={m.publication_preview__title()}
                  class="border-error/40 bg-panel text-error pointer-events-auto mx-auto mt-3 flex w-fit max-w-full items-center gap-3 rounded-full border px-3 py-1.5 text-xs shadow-lg"
                >
                  <span class="min-w-0 leading-relaxed"
                    >{m.publication_preview__banner()}</span
                  >
                  <a
                    href={appCtx.publicationPreviewExitUrl}
                    data-sveltekit-reload
                    class="bg-error/15 text-error hover:bg-error/25 focus-visible:outline-error shrink-0 rounded-full px-3 py-1.5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    >{m.publication_preview__exit()}</a
                  >
                </aside>
              {/if}
            {/snippet}
          </Omnibar>
          {#if dataReady}
            {@render children()}
          {/if}
          <AppMapOverlayBar />
          <AppNav
            {hub}
            getMapCenter={appCtx.getMapCenter}
            subscriptionItem={{
              isVisible: subscriptionVisibility.showAppMenuSubscriptionItem,
              label: appMenuSubscriptionItemProps.label ?? 'Subscribe',
              onSelect:
                appMenuSubscriptionItemProps.onSelect ??
                handleOpenHubSubscriptionOverlay,
            }}
          />
        {/if}
      </AppMain>
    </AppSurface>
  {:else}
    <LoadScreen
      label={m.publication_preview__preparing()}
      hubCode={page.data.hub?.code}
    />
  {/if}
</AppShell>
