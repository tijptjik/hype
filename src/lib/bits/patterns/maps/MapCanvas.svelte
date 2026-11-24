<script lang="ts">
// PRESENTATION
import { isMarkerStyleCode } from '#lib/features/markerStyle.js'
import type { ReadonlyURL } from '$app/state'
// SVELTEKIT
import { browser } from '$app/env'
import { page } from '$app/state'
import { goto } from '$app/navigation'
import { onDestroy, untrack } from 'svelte'
import { watch } from 'runed'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// ANIMATION
import { fade } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { bounds as indoorBounds } from '#lib/indoor/model.js'
import { indoorEntryNavigationKey } from '#lib/indoor/mapEntry.js'
import { prefersReducedMotion } from 'svelte/motion'
// BITS COMPONENTS
import { bridgeNativeTooltips } from '#lib/bits/core/tooltip/bridgeNativeTooltips.js'
import Button from '#lib/bits/core/button/Button.svelte'
// LIB
import {
  createMarkerRenderer,
  getUserMarkerStyleVariant,
  USER_MARKER_STYLE_PARAM,
  type MarkerRenderer,
} from '#lib/map/markers.js'
import {
  createAdaptiveMarkerRenderer,
  type AdaptiveMarkerRenderer,
} from '#lib/map/adaptiveMarkers.js'
import {
  type MapMarkerTheme,
  getDefaultMapStyleKey,
  getMapStyleDefinition,
  isMapStyleKey,
} from '#lib/map/styles/index.js'
import { getFeatureViewportQuery } from '#lib/map/featureSpatial.js'
import { installLocationHeading } from '#lib/map/locationHeading.js'
import { installLocationTracking } from '#lib/map/locationTracking.js'
import { getMarkerRetentionBudget } from '#lib/map/markerRetention.js'
import { observeFirstMapFrame } from '#lib/map/firstFrame.js'
import {
  canLoadFeatureViewport,
  installFeatureViewportScheduler,
} from '#lib/map/viewportScheduler.js'
import { featureQueryKey } from '#lib/client/services/featureQuery.js'
import {
  applyMapCanvasBackground,
  resolveRuntimeMapStyle,
} from '#lib/map/styles/runtime.js'
import { createMapController, type MapController } from '#lib/map/controller.js'
import DivisionHighlightLayer from './DivisionHighlightLayer.svelte'
import StationFootprintLayer from './StationFootprintLayer.svelte'
import NavigationRouteLayer from './NavigationRouteLayer.svelte'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import { GeolocateControl, NavigationControl } from 'svelte-maplibre-gl'
// ICONS
import Square3Stack3d from 'virtual:icons/proicons/layers'
// CONTEXT
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'
import { PANEL_WIDTH } from '#lib/constants.js'
// TYPES
import type { Journey } from '#lib/routing/routing.types.js'
import type {
  LngLatLike,
  Map as MaplibreMap,
  MapMouseEvent,
  Point,
  PointLike,
} from 'maplibre-gl'

import * as maplibregl from 'maplibre-gl'
import type { Point as GeoJSONPoint } from 'geojson'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { StyleSpecification } from 'maplibre-gl'
import type { FeatureQueryChannel } from '#lib/context/featureQuery.types.js'

/**
 * Application map adapter. Context and route policy stay at this boundary;
 * `MapSurface` remains a context-free rendering primitive.
 */
type MapCanvasProps = {
  highlightedSegment?: number | null
  journey?: Journey | null
  mapStyleCode?: string | null
  pixelRatio?: number
  antialias?: boolean
  interactive?: boolean
  showControls?: boolean
  onMapReady?: (controller: MapController | null) => void
  /** Fade the first visual frame on the public app's initial entrance. */
  intro?: boolean
  onVisualReady?: () => void
}

type GeolocateControlProps = {
  position: 'bottom-right'
  positionOptions: PositionOptions
  trackUserLocation: boolean
  showUserLocation: boolean
  autoTrigger: boolean
}

type CanvasMarkerRenderer = MarkerRenderer &
  Partial<Pick<AdaptiveMarkerRenderer, 'getFeatureIdAt'>>

let {
  highlightedSegment = null,
  journey = null,
  mapStyleCode = null,
  pixelRatio,
  antialias = true,
  interactive = true,
  showControls = true,
  onMapReady,
  intro = false,
  onVisualReady,
}: MapCanvasProps = $props()

// Keep a late first frame eligible to fade even if the controls used their fallback.
const shouldFadeOnFirstFrame = untrack(() => intro)

// ELEMENTS
let mapContainer: HTMLDivElement
let hasRendered = $state(false)

// CONTEXT
const appCtx = getAppCtx()

const omniCtx = getOmniCtx()
const surfaceLayout = appCtx.view.layout

// STATE
let lastHorizontalOffset = $state(0)

let isAnimating = $state(false)
let isTrackingMapUrl = $state(false)
let detachMapUrlTracking: (() => void) | null = null
// Keep camera URL writes from superseding an indoor navigation on the retained map.
const pendingMapUrlWrites = new Set<Promise<void>>()
let indoorEntryRevision = 0
let pendingIndoorEntry: number | null = null
let styleRequestSerial = 0
let activeMapInstance: MaplibreMap | undefined = $state(undefined)
let initialStyle = $state<StyleSpecification | null>(null)
let portalRecenterTimeout = 0
let mapResizeFrame = 0
let portalRecenterFrame = 0
let featureCardDescriptionExpanded = $state(false)
let markerRenderer: CanvasMarkerRenderer | null = null
let markerRendererMap: MaplibreMap | undefined
let mapStyleAbortController: AbortController | null = null
const MAP_TRACKING_PARAM = 'mapTracking'
const MAP_LNG_PARAM = 'lng'
const MAP_LAT_PARAM = 'lat'
const MAP_ZOOM_PARAM = 'zoom'
const MAP_BEARING_PARAM = 'bearing'
const MAP_PITCH_PARAM = 'pitch'

const DEFAULT_MAP_VIEW = {
  center: [114.17276, 22.29191] as [number, number],
  bearing: 17.6,
  zoom: 14,
  pitch: 45,
}

const MIN_MAP_ZOOM = 9
const FEATURE_PORTAL_FLY_TO_DELAY_MS = 300
const FEATURE_PORTAL_FLY_TO_DURATION_MS = 2000
const FEATURE_PORTAL_TARGET_ZOOM = 16

const parseNumericSearchParam = (value: string | null): number | null => {
  if (!value) return null

  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : null
}
const getTrackedMapViewFromUrl = (
  url: ReadonlyURL,
): {
  center: [number, number]
  bearing: number
  zoom: number
  pitch: number
} => {
  const lng = parseNumericSearchParam(url.searchParams.get(MAP_LNG_PARAM))
  const lat = parseNumericSearchParam(url.searchParams.get(MAP_LAT_PARAM))
  const zoom = parseNumericSearchParam(url.searchParams.get(MAP_ZOOM_PARAM))
  const bearing = parseNumericSearchParam(url.searchParams.get(MAP_BEARING_PARAM))
  const pitch = parseNumericSearchParam(url.searchParams.get(MAP_PITCH_PARAM))

  return {
    center: lng !== null && lat !== null ? [lng, lat] : DEFAULT_MAP_VIEW.center,
    zoom: Math.max(zoom ?? DEFAULT_MAP_VIEW.zoom, MIN_MAP_ZOOM),
    bearing: bearing ?? DEFAULT_MAP_VIEW.bearing,
    pitch: pitch ?? DEFAULT_MAP_VIEW.pitch,
  }
}

const formatMapViewNumber = (value: number, digits: number): string =>
  value.toFixed(digits).replace(/\.?0+$/, '')
const isMapTrackingEnabled = (url: ReadonlyURL): boolean =>
  url.searchParams.get(MAP_TRACKING_PARAM) === 'true'

const syncMapViewToUrl = (map: MaplibreMap | undefined): void => {
  if (
    !map ||
    !isTrackingMapUrl ||
    pendingIndoorEntry !== null ||
    typeof window === 'undefined' ||
    appCtx.station.active ||
    appCtx.station.returningToMap ||
    /^\/(?:premises|buildings)\//.test(window.location.pathname)
  ) {
    return
  }

  const center = map.getCenter()
  const url = new URL(window.location.href)

  url.searchParams.set(MAP_TRACKING_PARAM, 'true')
  url.searchParams.set(MAP_LNG_PARAM, formatMapViewNumber(center.lng, 5))
  url.searchParams.set(MAP_LAT_PARAM, formatMapViewNumber(center.lat, 5))
  url.searchParams.set(MAP_ZOOM_PARAM, formatMapViewNumber(map.getZoom(), 2))
  url.searchParams.set(MAP_BEARING_PARAM, formatMapViewNumber(map.getBearing(), 1))
  url.searchParams.set(MAP_PITCH_PARAM, formatMapViewNumber(map.getPitch(), 1))
  if (url.href !== window.location.href) {
    const write = goto(url, { shallow: true, replace: true, reset: false }).catch(
      error => console.error('Could not track map camera', error),
    )
    pendingMapUrlWrites.add(write)
    void write.finally(() => pendingMapUrlWrites.delete(write))
  }
}

const clearTrackedMapViewFromUrl = (): void => {
  if (
    typeof window === 'undefined' ||
    /^\/(?:premises|buildings)\//.test(window.location.pathname)
  ) {
    return
  }

  const url = new URL(window.location.href)

  url.searchParams.delete(MAP_LNG_PARAM)
  url.searchParams.delete(MAP_LAT_PARAM)
  url.searchParams.delete(MAP_ZOOM_PARAM)
  url.searchParams.delete(MAP_BEARING_PARAM)
  url.searchParams.delete(MAP_PITCH_PARAM)
  if (url.href !== window.location.href) {
    void goto(url, { shallow: true, replace: true, reset: false })
  }
}

const updateMapUrlTracking = (): void => {
  const shouldTrackMapUrl = isMapTrackingEnabled(page.url)
  const map = activeMapInstance

  if (!map) {
    isTrackingMapUrl = shouldTrackMapUrl
    return
  }

  if (shouldTrackMapUrl === isTrackingMapUrl) {
    return
  }

  isTrackingMapUrl = shouldTrackMapUrl
  detachMapUrlTracking?.()
  detachMapUrlTracking = null

  if (!shouldTrackMapUrl) {
    clearTrackedMapViewFromUrl()
    return
  }

  const onMoveEnd = () => syncMapViewToUrl(map)
  map.on('moveend', onMoveEnd)
  detachMapUrlTracking = () => {
    map.off('moveend', onMoveEnd)
  }

  untrack(() => syncMapViewToUrl(map))
}

const queueMapResize = (): void => {
  const map = activeMapInstance
  if (!map || mapResizeFrame !== 0) {
    return
  }

  mapResizeFrame = requestAnimationFrame(() => {
    mapResizeFrame = 0
    map.resize()
  })
}

const schedulePortalRecenter = (): void => {
  if (portalRecenterFrame !== 0) {
    return
  }

  portalRecenterFrame = requestAnimationFrame(() => {
    portalRecenterFrame = 0
    recenterActiveFeatureToPortal()
  })
}

function isPointGeometry(
  geometry: FeatureFromCollection['geometry'] | undefined,
): geometry is GeoJSONPoint {
  return geometry?.type === 'Point' && Array.isArray(geometry.coordinates)
}

/**
 * Projects the portal center to where it will land once the card viewport is fully scrolled.
 */
function getProjectedPortalCenter(): { x: number; y: number } | null {
  const portalElement = document.getElementById('feature-card-portal')
  const viewportElement = document.getElementById('feature-card-viewport')

  if (!portalElement) {
    return null
  }

  const portalRect = portalElement.getBoundingClientRect()
  const remainingScrollTop = viewportElement
    ? Math.max(
        viewportElement.scrollHeight -
          viewportElement.clientHeight -
          viewportElement.scrollTop,
        0,
      )
    : 0

  return {
    x: portalRect.left + portalRect.width / 2,
    y: portalRect.top + portalRect.height / 2 - remainingScrollTop,
  }
}

/**
 * Resolves the map offset required to place the active feature under the portal.
 */
function getFeaturePortalOffset(): { xOffset: number; yOffset: number } | null {
  const mapElement = document.getElementById('map')
  const portalCenter = getProjectedPortalCenter()

  if (!mapElement || !portalCenter) {
    return null
  }

  const mapRect = mapElement.getBoundingClientRect()

  return {
    xOffset: portalCenter.x - (mapRect.left + mapRect.width / 2),
    yOffset: portalCenter.y - (mapRect.top + mapRect.height / 2),
  }
}

/**
 * Recenters the active point feature under the feature-card portal.
 *
 * @param duration MapLibre animation duration in milliseconds.
 * @param delay Delay before measuring the settled portal position.
 */
function recenterActiveFeatureToPortal(
  duration: number = FEATURE_PORTAL_FLY_TO_DURATION_MS,
  delay: number = FEATURE_PORTAL_FLY_TO_DELAY_MS,
): void {
  window.clearTimeout(portalRecenterTimeout)

  portalRecenterTimeout = window.setTimeout(() => {
    const map = activeMapInstance
    const activeFeature = appCtx.getActiveFeature()
    const offset = getFeaturePortalOffset()

    if (
      !map ||
      journey ||
      !omniCtx.state.isCardOpen ||
      featureCardDescriptionExpanded ||
      !activeFeature ||
      !isPointGeometry(activeFeature.geometry) ||
      !offset
    ) {
      return
    }

    map.easeTo({
      center: [
        activeFeature.geometry.coordinates[0],
        activeFeature.geometry.coordinates[1],
      ],
      offset: [offset.xOffset, offset.yOffset],
      zoom: Math.max(map.getZoom(), FEATURE_PORTAL_TARGET_ZOOM),
      duration,
    })
  }, delay)
}

// STATE : DERIVED
const userMarkerStyleVariant = $derived(
  getUserMarkerStyleVariant(page.url.searchParams.get(USER_MARKER_STYLE_PARAM)),
)
const activeLocale = $derived(getLocale())
const resolvedMapStyleCode = $derived(
  mapStyleCode && isMapStyleKey(mapStyleCode) ? mapStyleCode : getDefaultMapStyleKey(),
)
// Location contrast follows the visible basemap, independently of feature-marker palettes.
const locationMarkerTone = $derived(
  ['light', 'white', 'grayscale'].includes(
    getMapStyleDefinition(resolvedMapStyleCode).basemapVariant ?? '',
  )
    ? 'light'
    : 'dark',
)
// The chosen map supplies defaults; explicit layer/project palettes remain authoritative.
const activeMarkerTheme = $derived(
  getMapStyleDefinition(resolvedMapStyleCode).markerTheme,
)
const projectMarkerThemes = $derived.by(() => {
  // Pinned projects can be absent from paginated query rows, but remain in the reactive cache.
  return new Map(
    [...appCtx.view.cache.project.values()].flatMap(project =>
      project.mapStyle?.code && isMapStyleKey(project.mapStyle.code)
        ? [
            [
              project.id,
              getMapStyleDefinition(project.mapStyle.code).markerTheme,
            ] as const,
          ]
        : [],
    ),
  )
})
const layerMarkerThemes = $derived.by(() => {
  const palettes = new Map<string, MapMarkerTheme | null>()
  for (const layer of appCtx.view.cache.layer.values()) {
    const metadata = layer.metadata as { mapStyleCode?: unknown } | null
    const code =
      layer.mapStyleCode !== undefined ? layer.mapStyleCode : metadata?.mapStyleCode
    // User Preference skips the project palette; legacy layers inherit it.
    if (code === null) palettes.set(layer.id, null)
    else if (typeof code === 'string' && isMapStyleKey(code)) {
      palettes.set(layer.id, getMapStyleDefinition(code).markerTheme)
    }
  }
  return palettes
})
// Marker settings travel with hierarchy data, independently of the basemap theme.
const projectMarkerStyles = $derived(
  new Map(
    [...appCtx.view.cache.project.values()].map(
      project => [project.id, project.markerStyleCode ?? null] as const,
    ),
  ),
)
const layerMarkerStyles = $derived(
  new Map(
    [...appCtx.view.cache.layer.values()].map(layer => {
      const code =
        layer.markerStyleCode !== undefined
          ? layer.markerStyleCode
          : layer.metadata?.markerStyleCode
      return [layer.id, isMarkerStyleCode(code) ? code : null] as const
    }),
  ),
)
// MAP SURFACE LIFECYCLE
let geolocateControl: import('maplibre-gl').GeolocateControl | undefined =
  $state(undefined)

let detachLocationHeading: (() => void) | undefined
let detachLocationTracking: (() => void) | undefined
let geolocationFixStarted = false
let geolocationLoadMap: MaplibreMap | null = null
let geolocationLoadHandler: (() => void) | null = null
let mapListenersAttached = false
let mapClickHandler: ((event: MapMouseEvent) => void) | null = null

const setupMap = (map: MaplibreMap): void => {
  activeMapInstance = map
  if (initialStyle) applyMapCanvasBackground(mapContainer, initialStyle, map)
  if (!markerRenderer || markerRendererMap !== map) {
    markerRenderer?.clear()
    markerRenderer = appCtx.view.isAdmin()
      ? createMarkerRenderer(map, maplibregl)
      : createAdaptiveMarkerRenderer(
          map,
          maplibregl,
          () => window.matchMedia('(pointer: coarse)').matches,
        )
    markerRendererMap = map
  }
  updateMapUrlTracking()
  queueMapResize()

  const onClick = (event: MapMouseEvent): void => {
    event.originalEvent.preventDefault()
    event.originalEvent.stopPropagation()
    const target = event.originalEvent.target as HTMLElement
    const markerElement = target.closest<HTMLElement>(
      '[data-type="marker"][data-feature-id]',
    )
    if (!markerElement && target.closest('[data-type="marker"]')) return
    // Native detail wins hit testing; individual canvas points remain tappable underneath.
    const featureId =
      markerElement?.dataset.featureId ?? markerRenderer?.getFeatureIdAt?.(event.point)
    if (featureId) {
      const isCardAlreadyOpen = omniCtx.state.isCardOpen
      if (!isCardAlreadyOpen) {
        if (markerElement) omniCtx.prepareCardTransitionFromMarker(markerElement)
        else omniCtx.resetCardTransition()
      }
      omniCtx.handleFeatureSelection(featureId, {
        focus: false,
        openCard: true,
        openCardDelay: 0,
        navOptions: { paramsToDrop: ['imageId'] },
      })
      return
    }
    const indoorLayers = [
      'hype-station-footprint-fill',
      'hype-station-footprint-label',
    ].filter(id => map.getLayer(id))
    const indoorFeature = indoorLayers.length
      ? map.queryRenderedFeatures(event.point, { layers: indoorLayers })[0]
      : undefined
    if (typeof indoorFeature?.properties?.stationCode === 'string') {
      const code = indoorFeature.properties.stationCode
      const revision = ++indoorEntryRevision
      const originUrl = indoorEntryNavigationKey(window.location.href)
      pendingIndoorEntry = revision
      const extent = indoorBounds(indoorFeature)
      const entryBearing = map.getBearing()
      const entryPitch = map.getPitch()
      const duration = prefersReducedMotion.current ? 0 : 1500
      // Load in parallel with the approach; retain the outdoor map until both are ready.
      const ready = appCtx.station.prepareFromMap(code)
      map.fitBounds(
        [
          [extent[0], extent[1]],
          [extent[2], extent[3]],
        ],
        {
          padding: 80,
          maxZoom: 20,
          duration,
          bearing: entryBearing,
          pitch: entryPitch,
        },
      )
      void Promise.all([
        ready,
        new Promise(resolve => setTimeout(resolve, duration)),
        ...pendingMapUrlWrites,
      ])
        .then(() => {
          // The approach updates tracked camera parameters; only navigation cancels entry.
          if (
            revision !== indoorEntryRevision ||
            indoorEntryNavigationKey(window.location.href) !== originUrl
          )
            return
          // End any remaining animation frame while camera URL writes are still suspended.
          map.stop()
          // SVG rotates source coordinates; MapLibre rotates the camera in the opposite direction.
          appCtx.station.entryPose = {
            bearing: -map.getBearing(),
            tilt: map.getPitch(),
          }
          appCtx.station.enterFromMap = true
          return appCtx.station.open(code)
        })
        .catch(async error => {
          console.error('Could not prepare indoor map', error)
          // Failed preparation must also wait for older camera writes before navigating.
          await Promise.all(pendingMapUrlWrites)
          // Fall back to the normal indoor loading/error UI so a failed prefetch is retryable.
          if (
            revision === indoorEntryRevision &&
            indoorEntryNavigationKey(window.location.href) === originUrl
          )
            return appCtx.station.open(code)
        })
        .finally(() => {
          if (pendingIndoorEntry === revision) pendingIndoorEntry = null
        })
      return
    }

    if (omniCtx.state.isCardOpen) omniCtx.close()
    else if (omniCtx.state.mode === 'search' && omniCtx.state.isTrayOpen)
      omniCtx.closeTray()
    else if (
      surfaceLayout.panels.isLeftPanelOpen() ||
      surfaceLayout.panels.isRightPanelOpen()
    ) {
      appCtx.view.panels.closeAllPanels()
    }
  }
  if (!mapListenersAttached) {
    mapListenersAttached = true
    mapClickHandler = onClick
    map.on('click', onClick)
  }

  if (appCtx.view.user && showControls && typeof navigator !== 'undefined') {
    // Share MapLibre's fix between the orb and camera, with a guarded one-time startup center.
    const configureGeolocation = (): void => {
      if (!geolocateControl || geolocationFixStarted) return
      const control = geolocateControl
      geolocationFixStarted = true
      detachLocationHeading = installLocationHeading(control)
      detachLocationTracking = installLocationTracking(control, map, {
        onPosition: position => {
          appCtx.view.state.userLocation = position
        },
        canAutoCenter: () =>
          !appCtx.station.active &&
          !appCtx.station.returningToMap &&
          !window.location.pathname.includes('/features/') &&
          !isTrackingMapUrl,
        onInitialFix: ({ coords: { latitude, longitude } }) => {
          const offset = surfaceLayout.getAppMainOffsetX()
          const point = map.project({ lng: longitude, lat: latitude })
          const center = map.unproject([point.x + offset * -0.0215, point.y])
          map.flyTo({ center, zoom: 17, duration: 2500 })
        },
      })
    }

    if (map.loaded()) {
      configureGeolocation()
    } else if (geolocationLoadMap !== map) {
      geolocationLoadMap = map
      geolocationLoadHandler = () => {
        geolocationLoadMap = null
        geolocationLoadHandler = null
        configureGeolocation()
      }

      map.once('load', geolocationLoadHandler)
    }
  }
}

$effect(() => {
  const map = activeMapInstance
  const controller = map ? createMapController(() => activeMapInstance ?? null) : null
  onMapReady?.(controller)
  return () => {
    onMapReady?.(null)
  }
})

// Prepare the world camera behind the indoor surface and reveal it only after rendering.
$effect(() => {
  const map = activeMapInstance
  const station = appCtx.station
  const view = station.worldView
  if (!map || !station.returningToMap || !view) return
  // MapLibre callbacks must not become dependencies of this camera effect.
  return untrack(() => {
    map.stop()
    map.jumpTo({
      center: view.center,
      zoom: view.zoom,
      bearing: view.bearing,
      pitch: view.pitch,
    })
    const ready = () => {
      station.returnMapReady = true
    }
    map.once('idle', ready)
    map.triggerRepaint()
    return () => {
      map.off('idle', ready)
    }
  })
})

$effect(() => {
  const map = activeMapInstance
  if (!map || hasRendered) return
  return observeFirstMapFrame(map, () => {
    hasRendered = true
    onVisualReady?.()
  })
})

$effect(() => {
  const map = activeMapInstance
  if (map) setupMap(map)
  return () => {
    if (map && mapListenersAttached) {
      mapListenersAttached = false
      if (mapClickHandler) map.off('click', mapClickHandler)
      mapClickHandler = null
    }
  }
})

$effect(() => {
  if (activeMapInstance && geolocateControl) {
    // The control is created by svelte-maplibre-gl after the map context is ready.
    setupMap(activeMapInstance)
  }
})

$effect(() => {
  const map = activeMapInstance

  if (!map || !initialStyle) return

  applyMapCanvasBackground(mapContainer, initialStyle, map)
})

$effect(() => {
  const serial = ++styleRequestSerial
  mapStyleAbortController?.abort()
  const abortController = new AbortController()
  mapStyleAbortController = abortController
  void resolveRuntimeMapStyle(resolvedMapStyleCode, {
    locale: activeLocale,
    noLabels:
      (appCtx.view.user as { experimental?: { noLabelsMode?: boolean } } | null)
        ?.experimental?.noLabelsMode ?? false,
    signal: abortController.signal,
  })
    .then(style => {
      if (serial === styleRequestSerial && !abortController.signal.aborted) {
        initialStyle = style
      }
    })
    .catch(error => {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to resolve map style', error)
      }
    })

  return () => abortController.abort()
})

onDestroy(() => {
  if (!browser) return
  indoorEntryRevision++
  pendingIndoorEntry = null

  detachMapUrlTracking?.()
  detachMapUrlTracking = null
  if (mapResizeFrame !== 0) {
    cancelAnimationFrame(mapResizeFrame)
    mapResizeFrame = 0
  }
  if (portalRecenterFrame !== 0) {
    cancelAnimationFrame(portalRecenterFrame)
    portalRecenterFrame = 0
  }
  window.clearTimeout(portalRecenterTimeout)
  if (geolocationLoadMap && geolocationLoadHandler) {
    geolocationLoadMap.off('load', geolocationLoadHandler)
  }
  geolocationLoadMap = null
  geolocationLoadHandler = null
  detachLocationTracking?.()
  detachLocationTracking = undefined
  detachLocationHeading?.()
  detachLocationHeading = undefined
  markerRenderer?.clear()
  markerRenderer = null
  markerRendererMap = undefined
  activeMapInstance = undefined
  geolocateControl = undefined
  geolocationFixStarted = false
  mapListenersAttached = false
})

$effect(() => {
  const handleDescriptionExpandedChange = (event: Event): void => {
    const customEvent = event as CustomEvent<{ expanded?: boolean }>

    featureCardDescriptionExpanded = Boolean(customEvent.detail?.expanded)

    if (featureCardDescriptionExpanded) {
      window.clearTimeout(portalRecenterTimeout)

      return
    }

    recenterActiveFeatureToPortal()
  }

  window.addEventListener(
    'FeatureCard.descriptionExpandedChange',
    handleDescriptionExpandedChange as EventListener,
  )

  return () => {
    window.removeEventListener(
      'FeatureCard.descriptionExpandedChange',
      handleDescriptionExpandedChange as EventListener,
    )
  }
})

// Reveal cached markers throughout movement; discover new rows at rest or during held pans.
$effect(() => {
  const map = activeMapInstance
  if (!map) return
  const updateViewport = (): void => {
    const bounds = map.getBounds()
    appCtx.view.featureViewport = getFeatureViewportQuery(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      map.getZoom(),
    )
  }
  const stopViewportScheduler = installFeatureViewportScheduler(map, {
    publish: updateViewport,
    isLoading: () => appCtx.view.resources.featureQueries.map.loading,
    updateCamera: force => markerRenderer?.updateCamera(force),
  })
  return () => {
    stopViewportScheduler()
    appCtx.view.featureViewport = undefined
  }
})

// The same property/list flags are composed with spatial scope before fetching a bounded map page.
$effect(() => {
  const input = appCtx.view.filters.featureQueryInput({
    spatial: appCtx.view.featureViewport,
    includeCounts: false,
  })
  if (!activeMapInstance || appCtx.view.isAdmin() || !appCtx.view.isInitialised) return
  if (!input.prisms?.layer?.length) {
    untrack(() => appCtx.view.resources.featureQueries.map.clear())
    appCtx.view.queries.featureLoadState = 'complete'
    return
  }

  const timer = setTimeout(() => {
    // A flight or pinch may begin during the debounce; its endpoint will publish again.
    if (!activeMapInstance || !canLoadFeatureViewport(activeMapInstance)) return
    void appCtx.view.queries.loadFeatureQuery('map', input).catch(error => {
      console.error('[Map features] Query failed:', error)
    })
  }, 120)

  return () => clearTimeout(timer)
})

// Neighbourhood counts describe the filtered collection independently of the current camera.
$effect(() => {
  const input = appCtx.view.filters.featureQueryInput({
    limit: 1,
    filters: { divisionIds: [], excludeDivisionIds: [] },
  })
  if (appCtx.view.isAdmin() || !appCtx.view.isInitialised) return
  if (!input.prisms?.layer?.length) {
    untrack(() => appCtx.view.resources.featureQueries.facets.clear())
    return
  }

  const timer = setTimeout(() => {
    void appCtx.view.queries.loadFeatureQuery('facets', input).catch(error => {
      console.error('[Feature counts] Query failed:', error)
    })
  }, 120)

  return () => clearTimeout(timer)
})

$effect(() => {
  const input = appCtx.view.filters.featureQueryInput({
    limit: 1,
    filters: { divisionIds: [], excludeDivisionIds: [] },
  })
  const query = appCtx.view.resources.featureQueries.facets
  const hasLayers = Boolean(input.prisms?.layer?.length)
  const pending = hasLayers && (!query.isCurrent(input) || query.loading)
  const counts = query.facets?.divisions ?? null

  // Retain rows through the debounce and request; publish only the settled counts.
  untrack(() => {
    appCtx.view.divisionCtx.countsLoading = pending
    if (!hasLayers) appCtx.view.divisionCtx.setDivisionCounts(null)
    else if (!pending) appCtx.view.divisionCtx.setDivisionCounts(counts)
  })
})

// Reuse the normal collection freshness window when returning to the map tab.
$effect(() => {
  const onFocus = (): void => {
    for (const [channel, query] of Object.entries(
      appCtx.view.resources.featureQueries,
    )) {
      void query
        .revalidate()
        .then(() =>
          appCtx.view.queries.retainFeatureQueryRows(channel as FeatureQueryChannel),
        )
    }
  }

  window.addEventListener('focus', onFocus)

  return () => window.removeEventListener('focus', onFocus)
})

watch(
  () => [
    appCtx.featuresVisible,
    appCtx.view.featureViewport,
    featureQueryKey(appCtx.view.filters.featureQueryInput()),
    activeMapInstance,
    userMarkerStyleVariant,
    activeMarkerTheme,
    projectMarkerThemes,
    projectMarkerStyles,
    layerMarkerStyles,
    layerMarkerThemes,
    appCtx.selection.featureId,
    appCtx.selection.collection?.items.map(item => item.id).join(','),
  ],
  () => {
    if (markerRenderer) {
      markerRenderer.sync(appCtx.getVisibleFeatures() as FeatureFromCollection[], {
        retention: appCtx.view.isAdmin()
          ? undefined
          : {
              scope: featureQueryKey(appCtx.view.filters.featureQueryInput()),
              budget: getMarkerRetentionBudget(navigator),
            },
        markerStyle: userMarkerStyleVariant,
        markerTheme: activeMarkerTheme,
        markerThemesByProjectId: projectMarkerThemes,
        markerStylesByProjectId: projectMarkerStyles,
        markerStylesByLayerId: layerMarkerStyles,
        markerThemesByLayerId: layerMarkerThemes,
        selectedId: appCtx.selection.featureId,
        highlightedIds: new Set(
          appCtx.selection.collection?.items.map(item => item.id) ?? [],
        ),
      })
    }
  },
)

$effect(() => {
  updateMapUrlTracking()
})

$effect(() => {
  const map = activeMapInstance
  const activeFeatureId = appCtx.getActiveFeature()?.id ?? null
  const isCardOpen = omniCtx.state.isCardOpen

  if (!map || !activeFeatureId || !isCardOpen || featureCardDescriptionExpanded) {
    return
  }

  const featureCardElement = document.getElementById('feature-card')
  const featureCardViewport = document.getElementById('feature-card-viewport')
  const featureCardPortal = document.getElementById('feature-card-portal')

  if (!featureCardElement) {
    schedulePortalRecenter()
    return
  }

  const observer = new ResizeObserver(() => {
    schedulePortalRecenter()
  })

  observer.observe(featureCardElement)

  if (featureCardViewport) observer.observe(featureCardViewport)
  if (featureCardPortal) observer.observe(featureCardPortal)

  const handleScrollEnd = (): void => {
    schedulePortalRecenter()
  }

  /**
   * Recenters after gallery resizing moves the portal without resizing it.
   * @param event Completed card transition.
   * @returns Nothing.
   */
  const handleGalleryTransitionEnd = (event: TransitionEvent): void => {
    if (
      event.propertyName === 'height' &&
      event.target instanceof HTMLElement &&
      event.target.hasAttribute('data-feature-card-gallery')
    ) {
      schedulePortalRecenter()
    }
  }

  document.addEventListener('containerscrollend', handleScrollEnd)
  featureCardElement.addEventListener('transitionend', handleGalleryTransitionEnd)
  schedulePortalRecenter()

  return () => {
    observer.disconnect()
    document.removeEventListener('containerscrollend', handleScrollEnd)
    featureCardElement.removeEventListener('transitionend', handleGalleryTransitionEnd)
  }
})

// STATE : DERIVED
let horizontalOffset = $derived(surfaceLayout.getAppMainOffsetX())

// Ensure that the center of the map is in the center of the viewport,
// even after a panel is triggered.
$effect(() => {
  const map = activeMapInstance

  // The route fit accounts for panel padding; do not also pan the camera for it.
  if (journey) {
    lastHorizontalOffset = horizontalOffset
    return
  }
  if (horizontalOffset !== lastHorizontalOffset && map && !isAnimating) {
    isAnimating = true
    const coordinates = map.getCenter()
    const centerInPx: Point = map.project(coordinates)
    const newPoint: PointLike = [
      centerInPx.x +
        (horizontalOffset === 0 ? lastHorizontalOffset : -horizontalOffset),
      centerInPx.y,
    ]

    const newCenter: LngLatLike = map.unproject(newPoint)

    lastHorizontalOffset = horizontalOffset

    // Set up one-time event listener for when animation completes
    const onMoveEnd = () => {
      isAnimating = false
      map.off('moveend', onMoveEnd)
    }

    map.on('moveend', onMoveEnd)

    // Start the animation
    map.easeTo({
      center: newCenter,
      duration: 300,
    })

    // Fallback timeout in case moveend doesn't fire
    setTimeout(() => {
      isAnimating = false
      map.off('moveend', onMoveEnd)
    }, 500)
  }
})
</script>

<div
  id="map"
  inert={appCtx.station.active}
  aria-hidden={appCtx.station.active}
  class="map absolute! inset-0 overflow-hidden caret-transparent {shouldFadeOnFirstFrame
    ? 'transition-opacity delay-400 duration-300 ease-out motion-reduce:transition-none motion-reduce:delay-0'
    : ''}"
  style:opacity={shouldFadeOnFirstFrame && !hasRendered ? 0 : undefined}
  data-map-visual-ready={hasRendered}
  data-map-gesture-surface="true"
  data-testid="map"
  data-location-marker-tone={locationMarkerTone}
  data-navigation-active={journey ? 'true' : undefined}
  bind:this={mapContainer}
  use:bridgeNativeTooltips
>
  {#if activeMapInstance}
    <StationFootprintLayer
      map={activeMapInstance}
      showMtrStations={appCtx.showMtrStations}
      showComplexInteriorMaps={appCtx.showComplexInteriorMaps}
      showBuildingInteriorMaps={appCtx.showBuildingInteriorMaps}
      theme={getMapStyleDefinition(resolvedMapStyleCode).markerTheme}
    />
    {#if journey}
      <NavigationRouteLayer
        map={activeMapInstance}
        geometry={journey.geometry}
        highlightedGeometry={highlightedSegment === null
          ? null
          : (journey.segments[highlightedSegment]?.geometry ?? null)}
        theme={getMapStyleDefinition(resolvedMapStyleCode).markerTheme}
        padding={{
          top: 100,
          bottom: 120,
          left:
            !surfaceLayout.responsive.isMobile && appCtx.view.panels.isLeftPanelOpen()
              ? PANEL_WIDTH + 48
              : 48,
          right:
            !surfaceLayout.responsive.isMobile && appCtx.view.panels.isRightPanelOpen()
              ? PANEL_WIDTH + 48
              : 48,
        }}
      />
    {/if}
    <DivisionHighlightLayer
      map={activeMapInstance}
      client={appCtx.view.resources}
      selectedIds={[
        ...appCtx.view.divisionCtx.getFilteredDivisions(),
        ...(appCtx.selection.collection?.type === 'neighbourhood'
          ? [appCtx.selection.collection.id]
          : []),
      ]}
      hoveredId={appCtx.view.divisionCtx.hoveredId}
      theme={getMapStyleDefinition(resolvedMapStyleCode).markerTheme}
    />
  {/if}
  {#if initialStyle}
    <MapSurface
      bind:map={activeMapInstance}
      class="absolute inset-0"
      style={initialStyle}
      center={(isMapTrackingEnabled(page.url)
        ? getTrackedMapViewFromUrl(page.url)
        : DEFAULT_MAP_VIEW
      ).center}
      bearing={(isMapTrackingEnabled(page.url)
        ? getTrackedMapViewFromUrl(page.url)
        : DEFAULT_MAP_VIEW
      ).bearing}
      zoom={(isMapTrackingEnabled(page.url)
        ? getTrackedMapViewFromUrl(page.url)
        : DEFAULT_MAP_VIEW
      ).zoom}
      pitch={(isMapTrackingEnabled(page.url)
        ? getTrackedMapViewFromUrl(page.url)
        : DEFAULT_MAP_VIEW
      ).pitch}
      minZoom={MIN_MAP_ZOOM}
      maxPitch={75}
      hash={false}
      attributionControl={false}
      {interactive}
      pixelRatio={pixelRatio ?? (browser ? window.devicePixelRatio : 1)}
      canvasContextAttributes={{ antialias }}
    >
      {#if showControls && appCtx.view.user}
        <GeolocateControl
          bind:control={geolocateControl}
          {...{
            position: 'bottom-right',
            positionOptions: {
              timeout: 5000,
              enableHighAccuracy: true,
              maximumAge: 0,
            },
            trackUserLocation: true,
            showUserLocation: true,
            autoTrigger: false,
          } satisfies GeolocateControlProps}
        />
        <NavigationControl
          position="bottom-right"
          showZoom={false}
          showCompass={true}
        />
      {/if}
    </MapSurface>
  {/if}
  {#if showControls &&
    !appCtx.station.active &&
    appCtx.view.user &&
    activeMapInstance &&
    appCtx.view.queries.rows.layer.length > 0 &&
    !appCtx.view.scope.prisms.layer.length &&
    !appCtx.view.panels.isPanelOpen(Panel.prisms)}
    <!-- biome-ignore lint/a11y/useSemanticElements: composite prompt contains a nested button, so this cannot be a native button. -->
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      role="button"
      tabindex="0"
      onclick={() => appCtx.view.panels.openPanel(Panel.prisms, false)}
      onkeydown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          appCtx.view.panels.openPanel(Panel.prisms, false)
        }
      }}
    >
      <div
        class="group pointer-events-auto flex max-w-xs flex-col items-center gap-8 rounded-lg border-2 border-[#4987E2] bg-black p-8 px-8 font-mono shadow-[0_0_15px_rgba(0,0,255,0.5)]"
      >
        <p class="text-base-content text-lg">{m.map__no_markers_without_layers()}</p>
        <Button
          text={m.map__select_layer()}
          style="outline"
          iconComponent={Square3Stack3d}
          class="ring-primary group-hover:shadow-primary/70 group-hover:inset-shadow-lg bg-black font-bold uppercase transition-all duration-300 [--btn-color:#4987E2] [--btn-hover-border:color-mix(in_oklab,var(--color-primary)_70%,transparent)] [--btn-hover-fg:color-mix(in_oklab,var(--color-primary)_70%,transparent)] [--btn-outline-fg:#4987E2] group-hover:ring-2"
          iconClasses="transition-all duration-300 group-hover:scale-125 group-hover:text-primary"
        />
      </div>
    </div>
  {/if}
</div>
