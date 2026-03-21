<script lang="ts">
import { page } from '$app/state'
import { onDestroy, onMount } from 'svelte'
import { watch } from 'runed'
// I18N
import { getLocale, m } from '$lib/i18n'
// ANIMATION
import { fade } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
// LIB
import {
  getUserMarkerStyleVariant,
  updateMarkers,
  USER_MARKER_STYLE_PARAM,
} from '$lib/map/markers'
import { getMapStyleDefinition, isMapStyleKey } from '$lib/map/styles'
// ICONS
import Square3Stack3d from 'virtual:icons/lucide/layers-3'
import Icon from '$lib/components/common/Icon.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type {
  GeolocateControl,
  LngLatLike,
  Map as MaplibreMap,
  Point,
  PointLike,
} from 'maplibre-gl'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { StyleSpecification } from 'maplibre-gl'

type MapCanvasProps = {
  mapStyleCode?: string | null
}

type GeolocateControlWithPrivateFields = GeolocateControl & {
  _updateCamera: () => void
  _geolocateButton: HTMLButtonElement
}

let { mapStyleCode = null }: MapCanvasProps = $props()

// ELEMENTS
let mapContainer: HTMLDivElement

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// STATE
let lastHorizontalOffset = $state(0)
let isAnimating = $state(false)
let activeStyleToken = $state<string | null>(null)
let isTrackingMapUrl = $state(false)
let detachMapUrlTracking: (() => void) | null = null
let styleRequestSerial = 0

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

const syncMapViewToUrl = (): void => {
  if (!appCtx.map || !isTrackingMapUrl || typeof window === 'undefined') {
    return
  }

  const center = appCtx.map.getCenter()
  const url = new URL(window.location.href)

  url.searchParams.set(MAP_TRACKING_PARAM, 'true')
  url.searchParams.set(MAP_LNG_PARAM, formatMapViewNumber(center.lng, 5))
  url.searchParams.set(MAP_LAT_PARAM, formatMapViewNumber(center.lat, 5))
  url.searchParams.set(MAP_ZOOM_PARAM, formatMapViewNumber(appCtx.map.getZoom(), 2))
  url.searchParams.set(
    MAP_BEARING_PARAM,
    formatMapViewNumber(appCtx.map.getBearing(), 1),
  )
  url.searchParams.set(MAP_PITCH_PARAM, formatMapViewNumber(appCtx.map.getPitch(), 1))

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
  const map = appCtx.map

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

  const onMoveEnd = () => syncMapViewToUrl()
  map.on('moveend', onMoveEnd)
  detachMapUrlTracking = () => {
    map.off('moveend', onMoveEnd)
  }
  syncMapViewToUrl()
}

const queueMapResize = (): void => {
  if (!appCtx.map) {
    return
  }

  requestAnimationFrame(() => {
    appCtx.map?.resize()
  })
}

const hideSymbolLayers = (style: StyleSpecification): StyleSpecification => {
  if (!style.layers) {
    return style
  }

  style.layers = style.layers.map(layer =>
    layer.type === 'symbol'
      ? {
          ...layer,
          layout: {
            ...(layer.layout ?? {}),
            visibility: 'none',
          },
        }
      : layer,
  )

  return style
}

const getMapStyleEndpoint = (mapStyleCode: string): string =>
  `/api/mapStyles/${mapStyleCode}`

const resolveRuntimeMapStyle = async (
  endpoint: string,
  noLabels: boolean,
): Promise<StyleSpecification> => {
  const response = await fetch(`${endpoint}?inline=1`)
  if (!response.ok) {
    throw new Error(`Failed to load map style from ${endpoint}`)
  }

  const style = (await response.json()) as StyleSpecification
  return noLabels ? hideSymbolLayers(style) : style
}

const getCurrentMapStyleVariant = (
  map: MaplibreMap | null | undefined,
): string | null => {
  if (!map) {
    return null
  }

  const currentStyle = map.getStyle()

  return (
    (typeof currentStyle?.metadata?.['hype:style-variant'] === 'string'
      ? currentStyle.metadata['hype:style-variant']
      : null) ?? (typeof currentStyle?.name === 'string' ? currentStyle.name : null)
  )
}

// STATE : DERIVED
const userMarkerStyleVariant = $derived(
  getUserMarkerStyleVariant(page.url.searchParams.get(USER_MARKER_STYLE_PARAM)),
)
const activeLocale = $derived(getLocale())
const resolvedMapStyleCode = $derived(
  mapStyleCode && isMapStyleKey(mapStyleCode) ? mapStyleCode : 'hyper',
)
const resolvedMapStyleEndpoint = $derived(getMapStyleEndpoint(resolvedMapStyleCode))
const resolvedMapStyleVariant = $derived(
  getMapStyleDefinition(resolvedMapStyleCode).label,
)
const activeStyleKey = $derived(
  `${resolvedMapStyleCode}:${activeLocale}:${appCtx.user?.experimental?.noLabelsMode ?? false}`,
)

$effect(() => {
  if (typeof window === 'undefined') {
    return
  }

  console.debug('[MapCanvas] mapStyleCode received', {
    mapStyleCode,
    resolvedMapStyleCode,
    resolvedMapStyleVariant,
    resolvedMapStyleEndpoint,
    activeLocale,
    noLabelsMode: appCtx.user?.experimental?.noLabelsMode ?? false,
  })
})

// WATCHERS
// Watch for changes in features
onMount(async () => {
  // To minimize the payload in Cloudflare, we are manually inserting mapping dependencies here as they
  // are heavy and the max worker size in the free tier is 1 MB

  // Wait for maplibre to be loaded globally
  while (!appCtx.isMaplibreLoaded || !appCtx.maplibre) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  // Wait for the DOM element to be available
  if (!mapContainer) {
    console.error('Map container not available')
    return
  }

  const initialMapView = isMapTrackingEnabled(page.url)
    ? getTrackedMapViewFromUrl(page.url)
    : DEFAULT_MAP_VIEW

  // MAP : Create the map instance
  let initialStyle: StyleSpecification
  try {
    initialStyle = await resolveRuntimeMapStyle(
      resolvedMapStyleEndpoint,
      appCtx.user?.experimental?.noLabelsMode ?? false,
    )
  } catch (error) {
    console.error('Failed to resolve initial map style', error)
    return
  }

  appCtx.map = new appCtx.maplibre.Map({
    container: mapContainer,
    style: initialStyle,
    center: initialMapView.center,
    bearing: initialMapView.bearing,
    zoom: initialMapView.zoom,
    minZoom: MIN_MAP_ZOOM,
    hash: false,
    pitch: initialMapView.pitch,
    attributionControl: false,
    pixelRatio: window.devicePixelRatio,
    canvasContextAttributes: {
      antialias: true,
    },
  })

  activeStyleToken = activeStyleKey
  updateMapUrlTracking()
  queueMapResize()

  appCtx.map.on('load', () => {
    const map = appCtx.map
    if (!map) {
      return
    }

    queueMapResize()

    // CONTROLS : Add the controls to the map
    if (appCtx.user) {
      // Initialize and store the GeolocateControl
      // See https://github.com/mapbox/mapbox-gl-js/issues/13067#issuecomment-1925291846
      const geolocateControl = new appCtx.maplibre.GeolocateControl({
        positionOptions: {
          timeout: 5000,
          enableHighAccuracy: true,
          maximumAge: Infinity,
        },
        trackUserLocation: true,
        showUserHeading: true,
        showUserLocation: true,
      }) as GeolocateControlWithPrivateFields

      // store the original _updateCamera implementation to restore later
      const updateCamera = geolocateControl._updateCamera
      // replace updateCamera method with noop operation, so that we can control
      // the initial flyTo of the user's location.
      geolocateControl._updateCamera = () => {}
      map.addControl(geolocateControl, 'bottom-right')
      map.on('load', () => {
        // after first geolocate...
        geolocateControl.once('geolocate', () => {
          // restore update camera for future use
          geolocateControl._updateCamera = updateCamera
        })
        // trigger to get the dot on the map
        geolocateControl.trigger()
      })

      // Programmatically click on the navigation control
      setTimeout(() => {
        geolocateControl._geolocateButton.click()
      }, 200)

      let hasReceivedFirstFix = false

      // WATCHER : Watch for changes in the user's location
      navigator.geolocation.watchPosition(
        geoLocation => {
          const { latitude, longitude } = geoLocation.coords

          // Hong Kong bounding box check
          const HK_BOUNDS = {
            north: 22.4393278,
            south: 22.1193278,
            east: 114.3228131,
            west: 114.0028131,
          }

          const isInHongKong =
            latitude >= HK_BOUNDS.south &&
            latitude <= HK_BOUNDS.north &&
            longitude >= HK_BOUNDS.west &&
            longitude <= HK_BOUNDS.east

          if (!isInHongKong) {
            // User is outside Hong Kong - disable location tracking
            console.warn(
              'User location outside Hong Kong bounds, disabling location tracking',
            )
            return
          }

          appCtx.state.userLocation = geoLocation

          // Fly to user location on first GPS fix if no active feature
          const isViewingFeature = window.location.pathname.includes('/features/')
          if (!hasReceivedFirstFix && !isViewingFeature && !isTrackingMapUrl) {
            hasReceivedFirstFix = true

            // Calculate horizontal offset for panels already open
            const currentHorizontalOffset = appCtx.getHorizontalOffset()

            if (currentHorizontalOffset !== 0) {
              const originalCenter = { lng: longitude, lat: latitude }
              const centerInPx = map.project(originalCenter)

              // Apply empirically derived adjustment factor for GPS centering
              // This accounts for the difference between panel positioning and GPS fix centering
              const adjustmentFactor = -0.0215
              const pixelAdjustment = currentHorizontalOffset * adjustmentFactor

              const adjustedPoint = new appCtx.maplibre.Point(
                centerInPx.x + pixelAdjustment,
                centerInPx.y,
              )
              const adjustedCenter = map.unproject(adjustedPoint)

              map.flyTo({
                center: [adjustedCenter.lng, adjustedCenter.lat],
                zoom: 19,
                duration: 2500,
              })
            } else {
              // No offset needed, center normally
              map.flyTo({
                center: [longitude, latitude],
                zoom: 19,
                duration: 2500,
              })
            }
          }
        },
        error => {
          // TODO: Add a fallback to the default location
          console.error('Error getting geolocation:', error)
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: Infinity },
      )

      map.addControl(
        new appCtx.maplibre.NavigationControl({
          showZoom: false,
          showCompass: true,
          showPitch: true,
          showRotate: true,
        }),
        'bottom-right',
      )
    }
  })

  // LISTENERS : Add the listeners to the map
  appCtx.map?.on('click', e => {
    e.originalEvent.preventDefault()
    e.originalEvent.stopPropagation()
    const target = e.originalEvent.target as HTMLElement
    if (target.dataset.type === 'marker') {
      const featureId = target.dataset.featureId
      if (!featureId) return

      // If card is already open, disable automatic centering to let FeaturePortal handle animation
      const isCardAlreadyOpen = omniCtx.state.isCardOpen
      omniCtx.handleFeatureSelection(featureId, {
        focus: false, // Don't auto-center as card is already open,
        openCard: true,
        openCardDelay: 0,
        navOptions: {
          paramsToDrop: ['imageId'],
        },
      })
    } else {
      // Priority 1: Close feature card if open
      if (omniCtx.state.isCardOpen) {
        omniCtx.close()
      }
      // Priority 2: Close tray if open in search mode
      else if (omniCtx.state.mode === 'search' && omniCtx.state.isTrayOpen) {
        omniCtx.closeTray()
      }
      // Priority 3: Close panels if open
      else if (appCtx.isLeftPanelOpen() || appCtx.isRightPanelOpen()) {
        appCtx.closeAllPanels()
      }
    }
  })
  // TODO Add Attribution
})

onDestroy(() => {
  detachMapUrlTracking?.()
  detachMapUrlTracking = null
})

watch(
  () => [appCtx.featuresVisible, appCtx.map, userMarkerStyleVariant],
  () => {
    if (!isAnimating && appCtx.maplibre && appCtx.isMaplibreLoaded) {
      updateMarkers(
        appCtx,
        appCtx.getVisibleFeatures() as FeatureFromCollection[],
        appCtx.maplibre,
        userMarkerStyleVariant,
      )
    }
  },
)

$effect(() => {
  const map = appCtx.map
  const currentMapStyleVariant = getCurrentMapStyleVariant(map)
  const shouldApplyStyle =
    Boolean(map) &&
    (activeStyleToken !== activeStyleKey ||
      currentMapStyleVariant !== resolvedMapStyleVariant)

  if (!shouldApplyStyle || !map) {
    if (typeof window !== 'undefined') {
      console.debug('[MapCanvas] style update skipped', {
        hasMap: Boolean(map),
        activeStyleToken,
        activeStyleKey,
        currentMapStyleVariant,
        resolvedMapStyleVariant,
      })
    }
    return
  }

  activeStyleToken = activeStyleKey

  const currentSerial = ++styleRequestSerial

  void resolveRuntimeMapStyle(
    resolvedMapStyleEndpoint,
    appCtx.user?.experimental?.noLabelsMode ?? false,
  )
    .then(style => {
      if (styleRequestSerial !== currentSerial) {
        return
      }

      console.debug('[MapCanvas] applying map style', {
        currentMapStyleVariant,
        nextMapStyleVariant: resolvedMapStyleVariant,
        resolvedMapStyleEndpoint,
      })
      map.setStyle(style)
    })
    .catch(error => {
      console.error('Failed to update map style', error)
    })
})

$effect(() => {
  updateMapUrlTracking()
})

// STATE : DERIVED
let horizontalOffset = $derived(appCtx.getHorizontalOffset())

// Ensure that the center of the map is in the center of the viewport,
// even after a panel is triggered.
$effect(() => {
  const map = appCtx.map

  if (horizontalOffset !== lastHorizontalOffset && map && !isAnimating) {
    isAnimating = true
    const coordinates = map.getCenter()
    const centerInPx: Point = map.project(coordinates)
    const newPoint: PointLike = new appCtx.maplibre.Point(
      centerInPx.x +
        (horizontalOffset === 0 ? lastHorizontalOffset : -horizontalOffset),
      centerInPx.y,
    )
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
  class="map absolute! inset-0! overflow-hidden caret-transparent"
  data-testid="map"
  bind:this={mapContainer}
>
  {#if appCtx.user && appCtx.map && appCtx.state.resources.layer.length > 0 && !appCtx.state.prisms.layer.length && !appCtx.isPanelOpen(Panel.prisms)}
    <div
      class="pointer-events-none absolute inset-0 z-50 mx-auto flex cursor-pointer items-center justify-center bg-black/70 text-center caret-transparent"
      in:fade={{ duration: 800, delay: 3000, easing: cubicInOut }}
      out:fade={{ duration: 300, easing: cubicInOut }}
      onclick={() => appCtx.openPanel(Panel.prisms, false)}
    >
      <div
        class="group pointer-events-auto flex max-w-xs flex-col items-center gap-8 rounded-lg border-2 border-[#4987E2] bg-black p-8 px-8 font-mono shadow-[0_0_15px_rgba(0,0,255,0.5)]"
      >
        <p class="text-lg text-base-content">{m.map__no_markers_without_layers()}</p>
        <button
          type="button"
          class="group-hover:inset-shadow-lg btn btn-outline border-[#4987E2] bg-black font-bold uppercase text-[#4987E2] ring-primary transition-all duration-300 group-hover:border-primary/70 group-hover:text-primary/70 group-hover:shadow-primary/70 group-hover:ring-2"
        >
          <Icon
            src={Square3Stack3d}
            class="transition-all duration-300 group-hover:scale-125 group-hover:text-primary"
          />
          {m.map__select_layer()}
        </button>
      </div>
    </div>
  {/if}
</div>
