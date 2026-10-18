// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. NAVIGATION PANEL
// - locate
// - useNavigationPanelModel
// - getNavigationPanelModel
// ---

// SVELTE
import { getContext, onDestroy, setContext } from 'svelte'
// API
import { calculateJourney, warmRouting } from '#lib/api/routing.remote.js'
// SERVICES
import { NavigationRouting } from '#lib/client/services/navigationRouting.svelte.js'
import { developmentOrigin } from '#lib/routing/developmentOrigin.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { RoutingPoint } from '#lib/routing/routing.types.js'

const navigationContext = Symbol('navigation-routing')

/**
 * Resolves the development mock or requests a single browser location after navigation intent.
 * @returns Browser coordinates or an actionable permission/timeout error.
 */
function locate(): Promise<RoutingPoint> {
  if (developmentOrigin) {
    return Promise.resolve({ lat: developmentOrigin.lat, lon: developmentOrigin.lon })
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          'Location is unavailable in this browser. Use a browser with location access over HTTPS.',
        ),
      )
      return
    }
    navigator.geolocation.getCurrentPosition(
      position =>
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      failure =>
        reject(
          new Error(
            failure.code === 1
              ? 'Location permission was denied. Allow location access in your browser, then try again.'
              : failure.code === 3
                ? 'Finding your location timed out. Please try again.'
                : 'Your current location could not be found. Check location services and try again.',
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    )
  })
}

/**
 * Creates the public layout's controlled navigation panel and card intent capability.
 * @param app - Owning public surface with canonical panel arbitration.
 * @param onOpen - Layout-owned intent to dismiss the feature card and reveal the map.
 * @returns Transient navigation state and commands for the controlled panel.
 */
export function useNavigationPanelModel(
  app: AppCtx,
  onOpen: () => void,
): NavigationRouting {
  const model = new NavigationRouting({
    locate,
    warmup: () => warmRouting({}),
    route: request => calculateJourney(request),
    openPanel: () => {
      onOpen()
      if (!app.view.panels.isPanelOpen(Panel.navigation))
        app.view.panels.togglePanel(Panel.navigation)
    },
    closePanel: () => app.view.panels.closePanel(Panel.navigation),
  })
  setContext(navigationContext, model)
  // Explicit close/arbitration invalidates work; View map deliberately retains the journey.
  $effect(() => {
    if (!app.view.panels.isPanelOpen(Panel.navigation) && !model.showingMap)
      model.cancel()
  })
  onDestroy(() => model.cancel())
  return model
}

/** Reads the optional navigation capability supplied by the public app layout. @returns The owning navigation model, if present. */
export function getNavigationPanelModel(): NavigationRouting | undefined {
  return getContext<NavigationRouting | undefined>(navigationContext)
}
