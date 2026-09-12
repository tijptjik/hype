<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
import { onDestroy } from 'svelte'
// MapLibre
import { addAddressMarker } from '$lib/map/markers'
import { getCoordinates } from '$lib/client/services/geospatial'
import { getLocaleKey } from '$lib/i18n'
import {
  applyRuntimeBasemapSource,
  buildCatalogMapStyle,
  getConfiguredBasemapAccessToken,
  listMapStyleCatalog,
} from '$lib/map/styles'
import { createMapController, type MapController } from '$lib/map/controller'
import MapSurface from '$lib/bits/custom/map/MapSurface.svelte'
// ICONS
import ArrowsPointingIn from 'virtual:icons/lucide/shrink'
import ArrowsPointingOut from 'virtual:icons/lucide/expand'
import { Icon } from '$lib/bits'
// TYPES
import * as maplibregl from 'maplibre-gl'
import type {
  LngLatLike,
  Map as MaplibreMap,
  Marker,
  MarkerDragEvent,
} from 'maplibre-gl'
import type { Id, AddressMeta } from '$lib/types'
import type { MapStyleCatalogKey } from '$lib/map/styles/catalog'
type MapProps = {
  coordinates: number[]
  initialCenter?: [number, number] | null
  addressMeta: AddressMeta | null
  mapStyleCode?: string | null
  draggable?: boolean
  toggleFullscreen?: (isFullscreen: boolean) => void
  toggleCollapsed?: (isCollapsed: boolean) => void
  dragEndCallback?: (lngLat: number[]) => void
  onMapReady?: (controller: MapController | null) => void
  initialCollapsed?: boolean
  activeResourceRef?: Id | string | false | null
}

// STATE : PROPS
let mapProps: MapProps = $props()

/**
 * Narrows editor coordinates to the tuple accepted by MapLibre camera APIs.
 *
 * @param coordinates - Candidate longitude/latitude values.
 * @returns A finite coordinate tuple, or `null` for incomplete input.
 */
const getCoordinateTuple = (coordinates: number[]): [number, number] | null => {
  const longitude = coordinates[0]
  const latitude = coordinates[1]
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

let isFullscreen = $state(false)
let isCollapsed = $state(false)
let hasInitialisedCollapse = false

$effect(() => {
  if (hasInitialisedCollapse) return
  hasInitialisedCollapse = true
  isCollapsed = mapProps.initialCollapsed ?? false
})

// STATE : MAP
let feature = $state<Marker | null>(null)
let featureMap: MaplibreMap | undefined
let isMapLoaded = $state(false)
let hasSyncedViewport = $state(false)
let lastCoordinateKey = $state('')
let activeMapInstance = $state<MaplibreMap | undefined>(undefined)
let map = $derived(activeMapInstance)

// STATE : DERIVED
let markedAddressLngLat: [number, number] | null = $state(null)
let addressLngLat: [number, number] | null = $derived(
  getCoordinates(mapProps.addressMeta as LngLatLike),
)
const coordinateTuple = $derived(getCoordinateTuple(mapProps.coordinates))
const activeLocale = $derived(getLocaleKey())
const resolvedMapStyleCode = $derived(mapProps.mapStyleCode?.trim() || 'hyperAdmin')
const resolvedMapStyleKey = $derived.by(() => {
  const catalogEntry = listMapStyleCatalog().find(
    mapStyle => mapStyle.key === resolvedMapStyleCode,
  )

  return (catalogEntry?.key ?? 'hyperAdmin') as MapStyleCatalogKey
})
const resolvedMapStyle = $derived(
  applyRuntimeBasemapSource(
    buildCatalogMapStyle(resolvedMapStyleKey, { locale: activeLocale }),
    getConfiguredBasemapAccessToken(),
  ),
)

// STATE : UI
let addressMarker: ReturnType<typeof addAddressMarker> | null = $state(null)
let addressMarkerMap: MaplibreMap | undefined
let featureMarkerId: Id | null = $state(null)

const handleMapLoad = (): void => {
  isMapLoaded = true
}

$effect(() => {
  const mapInstance = map
  isMapLoaded = mapInstance?.loaded() ?? false
})

$effect(() => {
  const mapInstance = map
  const controller = mapInstance
    ? createMapController(() => activeMapInstance ?? null)
    : null
  mapProps.onMapReady?.(controller)
  return () => {
    mapProps.onMapReady?.(null)
  }
})

$effect(() => {
  if (!map) {
    feature?.remove()
    feature = null
    featureMap = undefined
    return
  }
  if (!coordinateTuple) {
    feature?.remove()
    feature = null
    featureMap = undefined
    return
  }
  if (feature && featureMap !== map) {
    feature.remove()
    feature = null
    featureMap = undefined
  }
  if (feature) return
  feature = new maplibregl.Marker({
    color: '#F04D7F',
    clickTolerance: 24,
    draggable: mapProps.draggable ?? true,
  })
    .setLngLat(coordinateTuple)
    .addTo(map)
  featureMap = map
  feature.on('dragend', handleDragEnd)
})

onDestroy(() => {
  if (addressMarker) {
    addressMarker.remove()
    addressMarker = null
  }
  addressMarkerMap = undefined

  if (feature) {
    feature.remove()
    feature = null
  }
  featureMap = undefined

  activeMapInstance = undefined
})

// EFFECTS :: ON UPDATE
$effect(() => {
  if (map && coordinateTuple && feature) {
    feature.setDraggable(mapProps.draggable ?? true)
    const coordinateKey = coordinateTuple.join(',')
    if (!hasSyncedViewport) {
      hasSyncedViewport = true
      lastCoordinateKey = coordinateKey
      // Keep the initial viewport on the user's location when provided.
      if (mapProps.initialCenter) {
        feature.setLngLat(coordinateTuple)
        return
      }
    }
    if (lastCoordinateKey === coordinateKey) {
      feature.setLngLat(coordinateTuple)
      return
    }
    lastCoordinateKey = coordinateKey
    map.flyTo({
      center: coordinateTuple,
      zoom: 20,
    })
    feature.setLngLat(coordinateTuple)
  }
})

// EVENTS
const handleDragEnd = (e: MarkerDragEvent): void => {
  mapProps.dragEndCallback?.(e.target?.getLngLat().toArray())
}

const isSameCoordinates = (
  lngLat1: LngLatLike | null,
  lngLat2: LngLatLike | null,
): boolean => {
  if (!lngLat1 || !lngLat2) return false
  if (Array.isArray(lngLat1) && Array.isArray(lngLat2)) {
    return lngLat1[0] === lngLat2[0] && lngLat1[1] === lngLat2[1]
  }
  if ('lon' in lngLat1 && 'lon' in lngLat2) {
    return lngLat1.lon === lngLat2.lon && lngLat1.lat === lngLat2.lat
  } else if ('lng' in lngLat1 && 'lng' in lngLat2) {
    return lngLat1.lng === lngLat2.lng && lngLat1.lat === lngLat2.lat
  }
  return false
}

// Handle address marker updates
$effect(() => {
  if (addressMarker && addressMarkerMap !== map) {
    addressMarker.remove()
    addressMarker = null
    addressMarkerMap = undefined
    markedAddressLngLat = null
  }

  if (map && addressLngLat && !isSameCoordinates(addressLngLat, markedAddressLngLat)) {
    // Remove existing marker if it exists
    if (addressMarker) {
      addressMarker.remove()
    }
    // Add new marker
    addressMarker = addAddressMarker(maplibregl, map, addressLngLat)
    addressMarkerMap = map
    markedAddressLngLat = addressLngLat
  }
  if (mapProps.activeResourceRef && mapProps.activeResourceRef !== featureMarkerId) {
    featureMarkerId = mapProps.activeResourceRef
    if (addressMarker) {
      addressMarker.remove()
      addressMarker = null
      addressMarkerMap = undefined
      markedAddressLngLat = null
    }
  }
})
</script>

<!-- ENHANCEMENT - show the canonical image on top of the marker, so that we
 can remove the canonical image box and leave more space for the properties -->
<div class="relative h-full w-full">
  <div
    class="{isCollapsed
      ? 'absolute w-full justify-center'
      : 'absolute right-4 '} top-4 z-10 flex flex-row gap-2"
  >
    {#if mapProps.toggleCollapsed}
      <button
        type="button"
        class="btn btn-circle btn-sm bg-base-100 opacity-80 hover:opacity-100 {isFullscreen
          ? 'hidden'
          : ''} "
        transition:fade={{ duration: 300 }}
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          isCollapsed = !isCollapsed;
          mapProps.toggleCollapsed?.(isCollapsed);
        }}
      >
        <div class="swap">
          <input
            name="collapsed"
            type="checkbox"
            checked={isCollapsed}
            onchange={() => {
              isCollapsed = !isCollapsed;
              mapProps.toggleCollapsed?.(isCollapsed);
            }}
          >
          <Icon src={ArrowsPointingOut} class="swap-on h-5 w-5" />
          <Icon src={ArrowsPointingIn} class="swap-off h-5 w-5" />
        </div>
      </button>
    {/if}
    {#if mapProps.toggleFullscreen}
      <button
        type="button"
        class="btn btn-circle btn-sm bg-base-100 opacity-80 hover:opacity-100 {isCollapsed
          ? 'hidden'
          : ''}"
        transition:fade={{ duration: 300 }}
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          isFullscreen = !isFullscreen;
          mapProps.toggleFullscreen?.(isFullscreen);
        }}
      >
        <div class="swap">
          <input
            name="fullscreen"
            type="checkbox"
            checked={isFullscreen}
            onchange={() => {
              isFullscreen = !isFullscreen;
              mapProps.toggleFullscreen?.(isFullscreen);
            }}
          >
          <Icon src={ArrowsPointingIn} class="swap-on h-5 w-5" />
          <Icon src={ArrowsPointingOut} class="swap-off h-5 w-5" />
        </div>
      </button>
    {/if}
  </div>
  <!-- Loading Spinner -->
  {#if !isMapLoaded}
    <div
      class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300"
    >
      <div class="loading loading-ring loading-lg text-primary"></div>
    </div>
  {/if}

  <!-- Map Container -->
  <div
    class="map h-full w-full grow rounded-lg bg-base-300"
    class:opacity-0={!isMapLoaded}
    class:opacity-100={isMapLoaded}
    data-testid="map"
  >
    <MapSurface
      bind:map={activeMapInstance}
      class="h-full w-full"
      style={resolvedMapStyle}
      center={mapProps.initialCenter ?? coordinateTuple ?? [0, 0]}
      zoom={20}
      attributionControl={false}
      hash={false}
      canvasContextAttributes={{ antialias: true }}
      onload={handleMapLoad}
    />
  </div>
</div>

<style>
.map {
  transition: opacity 0.3s ease-in-out;
}

/* This will be used by the parent container */
:global(.map-container) {
  transition: flex-basis 0.3s ease-in-out;
}

:global(.map-container.fullscreen) {
  flex-basis: 100%;
}

:global(.content-container) {
  transition:
    flex-basis 0.3s ease-in-out,
    opacity 0.2s ease-in-out;
}

:global(.content-container.hidden) {
  flex-basis: 0%;
  opacity: 0;
  overflow: hidden;
}
</style>
