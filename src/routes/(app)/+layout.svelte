<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { browser } from '$app/environment'
// NAVIGATION
import { goto, beforeNavigate } from '$app/navigation'
import { page } from '$app/state'
import { handlePanelParams } from '$lib/navigation'
// AUTH
import { canAccessAdminPanel } from '$lib/api/services/authz'
import { useSession } from '$lib/auth/client'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { setOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature'
import { startCircularFlight } from '$lib/client/services/geospatial'
import { getActiveMapStyleCode } from '$lib/client/services/map'
import MapCanvas from '$lib/bits/patterns/maps/MapCanvas.svelte'
import Omnibar from '$lib/components/omnibar/Omnibar.svelte'
import Filters from '$lib/components/panels/Filters.svelte'
import Prisms from '$lib/components/panels/Prisms.svelte'
import Stars from '$lib/components/panels/Stars.svelte'
import Hub from '$lib/components/panels/Hub.svelte'
// import Plan from '$lib/components/panels/Plan.svelte'
// import Passport from '$lib/components/panels/Passport.svelte'
// import EventCompanion from '$lib/components/panels/EventCompanion.svelte'
import Settings from '$lib/components/panels/Settings.svelte'
import Profile from '$lib/components/panels/Profile.svelte'
import LayerSelectionModal from '$lib/components/modals/LayerSelectionModal.svelte'
import GeoLocationModal from '$lib/components/modals/GeoLocationModal.svelte'
import NewFeatureCard from '$lib/components/modals/NewFeatureCard.svelte'
// BITS
import { AppMenu, Button, Icon, OverlayBar } from '$lib/bits'
import { isCompactAppMenuViewport } from '$lib/bits/patterns/bars/appMenu/appMenu.constants'
import FunnelIcon from 'virtual:icons/lucide/filter'
import InformationCircleIcon from 'virtual:icons/lucide/info'
import MapIcon from 'virtual:icons/lucide/map'
import MonitorIcon from 'virtual:icons/lucide/monitor'
import PlusCircleIcon from 'virtual:icons/lucide/circle-plus'
import SettingsIcon from 'virtual:icons/lucide/settings'
import StarIcon from 'virtual:icons/lucide/star'
import SwatchIcon from 'virtual:icons/lucide/swatch-book'
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
let { hub } = data

// AUTH
const session = useSession()

// NAVIGATION STATE
let navDest = $state('')

// CONTEXT

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx()
// Set Hub context in AppCtx
appCtx.setHub(hub)

// CONTEXT :: OMNI
const omniCtx = setOmniCtx(appCtx)
const responsiveCtx = getResponsiveCtx()

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
let showAdminMenu = $derived.by(() =>
  canAccessAdminPanel({
    superAdmin: $session?.data?.user?.superAdmin,
    userRoles: $session?.data?.user?.roles ?? [],
  }),
)
let menuItems = $derived(
  hub.isCore
    ? [
        { value: Panel.prisms, icon: MapIcon, label: m.maps__title() },
        { value: Panel.filters, icon: FunnelIcon, label: m.menu_filters() },
        { value: Panel.stars, icon: StarIcon, label: m.menu_stars() },
        { value: Panel.settings, icon: SettingsIcon, label: m.menu_settings() },
      ]
    : [
        { value: Panel.hub, icon: InformationCircleIcon, label: m.menu_about() },
        { value: Panel.filters, icon: FunnelIcon, label: m.menu_filters() },
        { value: Panel.stars, icon: StarIcon, label: m.menu_stars() },
        { value: Panel.settings, icon: SettingsIcon, label: m.menu_settings() },
      ],
)
let trailingMenuItems = $derived(
  showAdminMenu
    ? [
        {
          value: Panel.admin,
          icon: MonitorIcon,
          label: m.menu_admin(),
          tone: 'secondary' as const,
        },
      ]
    : [],
)
const activeMapStyleCode = $derived.by(() => getActiveMapStyleCode(appCtx))
const isAddButtonVisible = $derived(
  !omniCtx.state.isTrayOpen &&
    !appCtx.isTransitioning &&
    !appCtx.getActiveFeature() &&
    !omniCtx.isNewFeatureMode &&
    appCtx.isMobile,
)
const isCardToggleVisible = $derived(
  !omniCtx.isCardOpen &&
    !appCtx.isTransitioning &&
    appCtx.getActiveFeature() &&
    !omniCtx.isNewFeatureMode,
)
const isCompactAppMenu = $derived(
  isCompactAppMenuViewport(responsiveCtx.window.width, responsiveCtx.window.height),
)
const offsetDueToPanels = $derived(appCtx.getHorizontalOffset())
let appMenuEffectiveBottomOffset = $state(0)
const overlayBarCenterBottomOffset = $derived(appMenuEffectiveBottomOffset + 24)

// PROFILE PANEL SCROLL POSITION
let profilePanelContainer: HTMLDivElement | undefined = $state()

// EFFECT: Store scroll position when profile panel closes, restore when it opens
$effect(() => {
  const isProfileOpen = appCtx.isPanelOpen(Panel.profile)

  if (!isProfileOpen && profilePanelContainer) {
    // Panel is closing - store scroll position
    const scrollTop = profilePanelContainer.scrollTop
    if (scrollTop > 0) {
      // Store in app context for this specific user
      const username = appCtx.state.panels.profile.ctx?.username
      if (username) {
        appCtx.state.panels.profile.ctx.savedScrollPosition = scrollTop
      }
    }
  } else if (isProfileOpen && profilePanelContainer) {
    // Panel is opening - restore scroll position
    const savedScrollPosition = appCtx.state.panels.profile.ctx?.savedScrollPosition
    if (savedScrollPosition > 0) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (profilePanelContainer) {
          profilePanelContainer.scrollTop = savedScrollPosition
          // Clear the saved position
          appCtx.state.panels.profile.ctx.savedScrollPosition = 0
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

async function handleAddFeature(event: Event): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  await initAddNewFeature(appCtx, omniCtx, event)
}

function handleOpenCard(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  omniCtx.openCard()
}

function handleMenuSelect(item: { value: Panel }): void {
  if (item.value === Panel.admin) {
    const currentPath = page.url.pathname

    if (currentPath.startsWith('/features/')) {
      goto(`/admin${currentPath}`)
      return
    }

    goto('/admin/tasks')
    return
  }

  appCtx.togglePanel(item.value)
}
</script>

<div class="flex h-dvh flex-col justify-around overflow-hidden">
  {#if !$session.isPending && $session.data && appCtx.isInitialised}
    <main
      class={[
        'relative top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden transition-[padding] duration-260 ease-[ease]',
        isCompactAppMenu ? 'pb-14' : 'pb-19',
        'md:pb-0',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
      <!-- Map Container -->
      <div class="relative flex h-full flex-1 flex-col">
        <Omnibar />
        <MapCanvas mapStyleCode={activeMapStyleCode} />
        {@render children()}
        {#snippet addFeatureIcon()}
          <Icon
            src={PlusCircleIcon}
            size="3xl"
            strokeWidth={1.5}
            class="transition-transform bg-black rounded-full duration-300 group-hover:rotate-90"
          />
        {/snippet}

        {#snippet openCardIcon()}
          <Icon src={SwatchIcon} size="lg" strokeWidth={2} />
        {/snippet}

        <OverlayBar
          class="transition-transform duration-500 ease-in-out"
          style={`transform: translateX(${offsetDueToPanels}px);`}
          centerStyle={`transform: translateY(-${overlayBarCenterBottomOffset}px);`}
        >
          {#snippet left()}
            {#if isAddButtonVisible}
              <Button
                text={m.whole_house_cougar_hurl()}
                icon={addFeatureIcon}
                modifier="circle"
                style="ghost"
                size="xl"
                transition={fade}
                transitionOpts={{ duration: 300, delay: 150 }}
                class="group z-30 text-white shadow-lg"
                attrs={{ title: m.whole_house_cougar_hurl() }}
                onClick={handleAddFeature}
              />
            {/if}
          {/snippet}

          {#snippet center()}
            {#if isCardToggleVisible}
              <Button
                text={m.mapbar__show_card()}
                icon={openCardIcon}
                color="dark"
                style="soft"
                transition={fade}
                transitionOpts={{ duration: 150, delay: 150 }}
                class="z-130 border border-white/10 bg-black/70 shadow-lg backdrop-blur-sm hover:text-primary"
                attrs={{ title: m.mapbar__show_card() }}
                onClick={handleOpenCard}
              />
            {/if}
          {/snippet}
        </OverlayBar>
        {#if omniCtx.isNewFeatureMode}
          <LayerSelectionModal />
          <GeoLocationModal />
          <NewFeatureCard />
        {/if}
      </div>
    </main>
    <AppMenu
      items={menuItems}
      trailingItems={trailingMenuItems}
      offsetX={offsetDueToPanels}
      bind:effectiveBottomOffset={appMenuEffectiveBottomOffset}
      onSelect={handleMenuSelect}
    />
  {:else if !$session.isPending && !$session.data}
    <main class="top-0 flex h-full w-dvw flex-1 flex-col gap-4 overflow-hidden">
      {@render children()}
      <MapCanvas mapStyleCode={"ghostery"} />
    </main>
  {/if}
</div>
