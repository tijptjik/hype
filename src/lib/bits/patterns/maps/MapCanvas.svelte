<script lang="ts">
// SVELTEKIT
import { browser } from '$app/environment'
import { page } from '$app/state'
import { onDestroy, untrack } from 'svelte'
import { watch } from 'runed'
// I18N
import { getLocale, m } from '$lib/i18n'
// ANIMATION
import { fade } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
// BITS COMPONENTS
import { Button } from '$lib/bits'
// LIB
import {
  createMarkerRenderer,
  getUserMarkerStyleVariant,
  USER_MARKER_STYLE_PARAM,
  type MarkerRenderer,
} from '$lib/map/markers'
import {
  getDefaultMapStyleKey,
  getMapStyleDefinition,
  isMapStyleKey,
} from '$lib/map/styles'
import { getFeatureViewportQuery } from '$lib/map/featureSpatial'
import { getMarkerRetentionBudget } from '$lib/map/markerRetention'
import { featureQueryKey } from '$lib/client/services/featureQuery'
import {
  applyMapCanvasBackground,
  resolveRuntimeMapStyle,
} from '$lib/map/styles/runtime'
import { createMapController, type MapController } from '$lib/map/controller'
import MapSurface from '$lib/bits/custom/map/MapSurface.svelte'
import { GeolocateControl, NavigationControl } from 'svelte-maplibre-gl'
// ICONS
import Square3Stack3d from 'virtual:icons/proicons/layers'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type {
  LngLatLike,
  Map as MaplibreMap,
  MapMouseEvent,
  Point,
  PointLike,
} from 'maplibre-gl'
import * as maplibregl from 'maplibre-gl'
import type { Point as GeoJSONPoint } from 'geojson'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { StyleSpecification } from 'maplibre-gl'
import type { FeatureQueryChannel } from '$lib/context/featureQuery.types'

/**
 * Application map adapter. Context and route policy stay at this boundary;
 * `MapSurface` remains a context-free rendering primitive.
 */
type MapCanvasProps = {
  mapStyleCode?: string | null
  pixelRatio?: number
  antialias?: boolean
  interactive?: boolean
  showControls?: boolean
  onMapReady?: (controller: MapController | null) => void
  bindAppMap?: boolean
}

type GeolocateControlWithPrivateFields = import('maplibre-gl').GeolocateControl & {
  _updateCamera: () => void
  _geolocateButton: HTMLButtonElement
}

type GeolocateControlProps = {
  position: 'bottom-right'
  positionOptions: PositionOptions
  trackUserLocation: boolean
  showUserHeading: boolean
  showUserLocation: boolean
  autoTrigger: boolean
}

let {
  mapStyleCode = null,
  pixelRatio,
  antialias = true,
  interactive = true,
  showControls = true,
  onMapReady,
  bindAppMap = true,
}: MapCanvasProps = $props()

// ELEMENTS
let mapContainer: HTMLDivElement

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

// STATE
let lastHorizontalOffset = $state(0)
let isAnimating = $state(false)
let isTrackingMapUrl = $state(false)
let detachMapUrlTracking: (() => void) | null = null
let styleRequestSerial = 0
let activeMapInstance: MaplibreMap | undefined = $state(undefined)
let initialStyle = $state<StyleSpecification | null>(null)
let portalRecenterTimeout = 0
let mapResizeFrame = 0
let portalRecenterFrame = 0
let geolocationWatchId: number | null = null
let featureCardDescriptionExpanded = $state(false)
let markerRenderer: MarkerRenderer | null = null
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
  url: URL,
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

const isMapTrackingEnabled = (url: URL): boolean =>
  url.searchParams.get(MAP_TRACKING_PARAM) === 'true'

const syncMapViewToUrl = (map: MaplibreMap | undefined): void => {
  if (!map || !isTrackingMapUrl || typeof window === 'undefined') {
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

  window.history.replaceState(window.history.state, '', url.toString())
}

const clearTrackedMapViewFromUrl = (): void => {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)

  url.searchParams.delete(MAP_LNG_PARAM)
  url.searchParams.delete(MAP_LAT_PARAM)
  url.searchParams.delete(MAP_ZOOM_PARAM)
  url.searchParams.delete(MAP_BEARING_PARAM)
  url.searchParams.delete(MAP_PITCH_PARAM)

  window.history.replaceState(window.history.state, '', url.toString())
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
  syncMapViewToUrl(map)
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
const projectMarkerThemes = $derived.by(() => {
  const fallbackTheme = getMapStyleDefinition(getDefaultMapStyleKey()).markerTheme

  return new Map(
    appCtx.state.resources.project.map(project => [
      project.id,
      project.mapStyle?.code && isMapStyleKey(project.mapStyle.code)
        ? getMapStyleDefinition(project.mapStyle.code).markerTheme
        : fallbackTheme,
    ]),
  )
})
// MAP SURFACE LIFECYCLE
let geolocateControl: GeolocateControlWithPrivateFields | undefined = $state(undefined)
let geolocationFixStarted = false
let geolocationLoadMap: MaplibreMap | null = null
let geolocationLoadHandler: (() => void) | null = null
let mapListenersAttached = false
let mapClickHandler: ((event: MapMouseEvent) => void) | null = null

const setupMap = (map: MaplibreMap): void => {
  activeMapInstance = map
  if (bindAppMap) appCtx.map = map
  if (initialStyle) applyMapCanvasBackground(mapContainer, initialStyle, map)
  if (!markerRenderer || markerRendererMap !== map) {
    markerRenderer?.clear()
    markerRenderer = createMarkerRenderer(map, maplibregl, (featureId, element) => {
      if (element) appCtx.markerElements.set(featureId, element)
      else appCtx.markerElements.delete(featureId)
    })
    markerRendererMap = map
  }
  updateMapUrlTracking()
  queueMapResize()

  const onClick = (event: MapMouseEvent): void => {
    event.originalEvent.preventDefault()
    event.originalEvent.stopPropagation()
    const target = event.originalEvent.target as HTMLElement
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId
      if (!featureId) return
      const isCardAlreadyOpen = omniCtx.state.isCardOpen
      if (!isCardAlreadyOpen) {
        omniCtx.prepareCardTransitionFromMarker(
          featureId,
          target.closest('[data-feature-id]') as HTMLElement | null,
        )
      }
      omniCtx.handleFeatureSelection(featureId, {
        focus: false,
        openCard: true,
        openCardDelay: 0,
        navOptions: { paramsToDrop: ['imageId'] },
      })
      return
    }
    if (omniCtx.state.isCardOpen) omniCtx.close()
    else if (omniCtx.state.mode === 'search' && omniCtx.state.isTrayOpen)
      omniCtx.closeTray()
    else if (responsiveCtx.isLeftPanelOpen() || responsiveCtx.isRightPanelOpen()) {
      appCtx.closeAllPanels()
    }
  }
  if (!mapListenersAttached) {
    mapListenersAttached = true
    mapClickHandler = onClick
    map.on('click', onClick)
  }

  if (appCtx.user && showControls && typeof navigator !== 'undefined') {
    // Keep the established first-fix policy and private-control workaround intact.
    const configureGeolocation = (): void => {
      if (!geolocateControl || geolocationFixStarted) return
      const control = geolocateControl
      geolocationFixStarted = true
      const updateCamera = control._updateCamera
      control._updateCamera = () => {}
      control.once('geolocate', () => {
        control._updateCamera = updateCamera
      })
      control.trigger()
      window.setTimeout(() => control._geolocateButton.click(), 200)
      let hasReceivedFirstFix = false
      geolocationWatchId = navigator.geolocation.watchPosition(
        geoLocation => {
          const { latitude, longitude } = geoLocation.coords
          const inHongKong =
            latitude >= 22.1193278 &&
            latitude <= 22.4393278 &&
            longitude >= 114.0028131 &&
            longitude <= 114.3228131
          if (!inHongKong) {
            console.warn(
              'User location outside Hong Kong bounds, disabling location tracking',
            )
            return
          }
          appCtx.state.userLocation = geoLocation
          const isViewingFeature = window.location.pathname.includes('/features/')
          if (!hasReceivedFirstFix && !isViewingFeature && !isTrackingMapUrl) {
            hasReceivedFirstFix = true
            const offset = responsiveCtx.getAppMainOffsetX()
            if (offset !== 0) {
              const point = map.project({ lng: longitude, lat: latitude })
              const adjustment = offset * -0.0215
              const adjusted = map.unproject([point.x + adjustment, point.y])
              map.flyTo({
                center: [adjusted.lng, adjusted.lat],
                zoom: 19,
                duration: 2500,
              })
            } else
              map.flyTo({ center: [longitude, latitude], zoom: 19, duration: 2500 })
          }
        },
        error => console.error('Error getting geolocation:', error),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity },
      )
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
      (appCtx.user as { experimental?: { noLabelsMode?: boolean } } | null)
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
  if (geolocationWatchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(geolocationWatchId)
    geolocationWatchId = null
  }
  if (geolocationLoadMap && geolocationLoadHandler) {
    geolocationLoadMap.off('load', geolocationLoadHandler)
  }
  geolocationLoadMap = null
  geolocationLoadHandler = null
  markerRenderer?.clear()
  markerRenderer = null
  markerRendererMap = undefined
  appCtx.markerElements.clear()
  if (bindAppMap && activeMapInstance && appCtx.map === activeMapInstance) {
    appCtx.map = undefined
  }
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

// Reveal cached markers on movement and refresh visible cells at a bounded cadence.
$effect(() => {
  const map = activeMapInstance
  if (!map) return
  const updateViewport = (): void => {
    const bounds = map.getBounds()
    appCtx.featureViewport = getFeatureViewportQuery(
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      map.getZoom(),
    )
  }
  let movementTimer: ReturnType<typeof setTimeout> | undefined
  const onMove = (): void => {
    markerRenderer?.updateCamera()
    if (movementTimer !== undefined) return
    movementTimer = setTimeout(() => {
      movementTimer = undefined
      updateViewport()
    }, 300)
  }
  const onMoveEnd = (): void => {
    clearTimeout(movementTimer)
    movementTimer = undefined
    markerRenderer?.updateCamera()
    updateViewport()
  }
  map.on('move', onMove)
  map.on('moveend', onMoveEnd)
  map.on('resize', updateViewport)
  updateViewport()
  return () => {
    clearTimeout(movementTimer)
    map.off('move', onMove)
    map.off('moveend', onMoveEnd)
    map.off('resize', updateViewport)
    appCtx.featureViewport = undefined
  }
})

// The same property/list flags are composed with spatial scope before fetching a bounded map page.
$effect(() => {
  const input = appCtx.featureQueryInput({
    spatial: appCtx.featureViewport,
    includeCounts: false,
  })
  if (!activeMapInstance || appCtx.isAdmin() || !appCtx.isInitialised) return
  if (!input.prisms?.layer?.length) {
    untrack(() => appCtx.cacheCtx.featureQueries.map.clear())
    appCtx.featureLoadState = 'complete'
    return
  }
  const timer = setTimeout(() => {
    void appCtx.loadFeatureQuery('map', input).catch(error => {
      console.error('[Map features] Query failed:', error)
    })
  }, 120)
  return () => clearTimeout(timer)
})

// Neighbourhood counts describe the filtered collection independently of the current camera.
$effect(() => {
  const input = appCtx.featureQueryInput({
    limit: 1,
    filters: { divisionIds: [], excludeDivisionIds: [] },
  })
  if (appCtx.isAdmin() || !appCtx.isInitialised) return
  if (!input.prisms?.layer?.length) {
    untrack(() => appCtx.cacheCtx.featureQueries.facets.clear())
    return
  }
  const timer = setTimeout(() => {
    void appCtx.loadFeatureQuery('facets', input).catch(error => {
      console.error('[Feature counts] Query failed:', error)
    })
  }, 120)
  return () => clearTimeout(timer)
})

$effect(() => {
  const counts = appCtx.cacheCtx.featureQueries.facets.facets?.divisions ?? null
  untrack(() => appCtx.placeCtx.setNeighbourhoodCounts(counts))
})

// Reuse the normal collection freshness window when returning to the map tab.
$effect(() => {
  const onFocus = (): void => {
    for (const [channel, query] of Object.entries(appCtx.cacheCtx.featureQueries)) {
      void query
        .revalidate()
        .then(() => appCtx.retainFeatureQueryRows(channel as FeatureQueryChannel))
    }
  }
  window.addEventListener('focus', onFocus)
  return () => window.removeEventListener('focus', onFocus)
})

watch(
  () => [
    appCtx.featuresVisible,
    appCtx.featureViewport,
    featureQueryKey(appCtx.featureQueryInput()),
    activeMapInstance,
    userMarkerStyleVariant,
    projectMarkerThemes,
    appCtx.state.active.feature?.id ?? null,
    appCtx.state.active.collection?.items.map(item => item.id).join(','),
    isAnimating,
  ],
  () => {
    if (markerRenderer) {
      markerRenderer.sync(appCtx.getVisibleFeatures() as FeatureFromCollection[], {
        retention: appCtx.isAdmin()
          ? undefined
          : {
              scope: featureQueryKey(appCtx.featureQueryInput()),
              budget: getMarkerRetentionBudget(navigator),
            },
        markerStyle: userMarkerStyleVariant,
        markerThemesByProjectId: projectMarkerThemes,
        selectedId: appCtx.state.active.feature?.id ?? null,
        highlightedIds: new Set(
          appCtx.state.active.collection?.items.map(item => item.id) ?? [],
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

  document.addEventListener('containerscrollend', handleScrollEnd)

  schedulePortalRecenter()

  return () => {
    observer.disconnect()
    document.removeEventListener('containerscrollend', handleScrollEnd)
  }
})

// STATE : DERIVED
let horizontalOffset = $derived(responsiveCtx.getAppMainOffsetX())

// Ensure that the center of the map is in the center of the viewport,
// even after a panel is triggered.
$effect(() => {
  const map = activeMapInstance

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
  class="map absolute! inset-0 overflow-hidden caret-transparent"
  data-map-gesture-surface="true"
  data-testid="map"
  bind:this={mapContainer}
>
  {#if initialStyle}
    <MapSurface
      bind:map={activeMapInstance}
      class="absolute inset-0"
      style={initialStyle}
      center={(isMapTrackingEnabled(page.url) ? getTrackedMapViewFromUrl(page.url) : DEFAULT_MAP_VIEW).center}
      bearing={(isMapTrackingEnabled(page.url) ? getTrackedMapViewFromUrl(page.url) : DEFAULT_MAP_VIEW).bearing}
      zoom={(isMapTrackingEnabled(page.url) ? getTrackedMapViewFromUrl(page.url) : DEFAULT_MAP_VIEW).zoom}
      pitch={(isMapTrackingEnabled(page.url) ? getTrackedMapViewFromUrl(page.url) : DEFAULT_MAP_VIEW).pitch}
      minZoom={MIN_MAP_ZOOM}
      hash={false}
      attributionControl={false}
      {interactive}
      pixelRatio={pixelRatio ?? (browser ? window.devicePixelRatio : 1)}
      canvasContextAttributes={{ antialias }}
    >
      {#if showControls && appCtx.user}
        <GeolocateControl
          bind:control={geolocateControl}
          {...({
            position: 'bottom-right',
            positionOptions: { timeout: 5000, enableHighAccuracy: true, maximumAge: Infinity },
            trackUserLocation: true,
            showUserHeading: true,
            showUserLocation: true,
            autoTrigger: false,
          } satisfies GeolocateControlProps)}
        />
        <NavigationControl
          position="bottom-right"
          showZoom={false}
          showCompass={true}
        />
      {/if}
    </MapSurface>
  {/if}
  {#if showControls && appCtx.user && activeMapInstance && appCtx.state.resources.layer.length > 0 && !appCtx.state.prisms.layer.length && !appCtx.isPanelOpen(Panel.prisms)}
    <!-- biome-ignore lint/a11y/useSemanticElements: composite prompt contains a nested button, so this cannot be a native button. -->
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      role="button"
      tabindex="0"
      onclick={() => appCtx.openPanel(Panel.prisms, false)}
      onkeydown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          appCtx.openPanel(Panel.prisms, false)
        }
      }}
    >
      <div
        class="group pointer-events-auto flex max-w-xs flex-col items-center gap-8 rounded-lg border-2 border-[#4987E2] bg-black p-8 px-8 font-mono shadow-[0_0_15px_rgba(0,0,255,0.5)]"
      >
        <p class="text-lg text-base-content">{m.map__no_markers_without_layers()}</p>
        <Button
          text={m.map__select_layer()}
          style="outline"
          iconComponent={Square3Stack3d}
          class="[--btn-color:#4987E2] [--btn-outline-fg:#4987E2] [--btn-hover-border:color-mix(in_oklab,var(--color-primary)_70%,transparent)] [--btn-hover-fg:color-mix(in_oklab,var(--color-primary)_70%,transparent)] bg-black font-bold uppercase ring-primary transition-all duration-300 group-hover:ring-2 group-hover:shadow-primary/70 group-hover:inset-shadow-lg"
          iconClasses="transition-all duration-300 group-hover:scale-125 group-hover:text-primary"
        />
      </div>
    </div>
  {/if}
</div>
