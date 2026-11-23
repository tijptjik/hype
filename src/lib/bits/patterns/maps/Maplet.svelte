<script lang="ts">
// SEARCH PRESENTATION
import { locationSearchColor } from '#lib/locations/searchPresentation.js'
// SVELTE
import { fade } from 'svelte/transition'
import { onDestroy, untrack } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// MapLibre
import { addAddressMarker } from '#lib/map/markers.js'
import { getCoordinates } from '#lib/client/services/geospatial.js'
import { getLocaleKey, m } from '#lib/i18n.js'
import {
  applyRuntimeBasemapSource,
  buildCatalogMapStyle,
  getConfiguredBasemapAccessToken,
  listMapStyleCatalog,
} from '#lib/map/styles/index.js'
import { resolveMapStyleSpriteUrls } from '#lib/map/styles/runtime.js'
import { freezeMapForResize, holdMapSizeDuringFlight } from '#lib/map/resizeSnapshot.js'
import { createMapController, type MapController } from '#lib/map/controller.js'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import MapLoading from './MapLoading.svelte'
import StationFootprintLayer from './StationFootprintLayer.svelte'
import { VISUAL_TRANSITION_MS } from '#lib/bits/custom/main/visualTransition.js'
// REVIEW
import { locationMoveDistance } from '#lib/locations/reviewPresentation.js'
// ICONS
import ArrowsPointingIn from 'virtual:icons/proicons/full-screen-minimize'
import ArrowsPointingOut from 'virtual:icons/proicons/full-screen-maximize'
import Icon from '#lib/bits/custom/icon/Icon.svelte'
// TYPES
import * as maplibregl from 'maplibre-gl'
import type {
  LngLatLike,
  Map as MaplibreMap,
  Marker,
  MarkerDragEvent,
} from 'maplibre-gl'
import type { Id } from '#lib/types.js'
import type { AddressMeta } from '#lib/utils/address.types.js'
import type { MapStyleCatalogKey } from '#lib/map/styles/catalog.js'
type MapProps = {
  comparison?: { before: [number, number]; after: [number, number] } | null
  pinControls?: import('svelte').Snippet
  pinHighlightRequest?: number
  showMarker?: boolean
  locationCandidates?: import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
  onLocationCandidateSelect?: (id: string) => void
  freezeForResize?: boolean
  coordinates: number[]
  /** Waits for the gallery to publish its decoded image before moving the pin and camera. */
  coordinateTransitionPending?: boolean
  premisesMapId?: string
  initialZoom?: number
  initialCenter?: [number, number] | null
  addressMeta: AddressMeta | null
  mapStyleCode?: string | null
  draggable?: boolean
  /** Prevents camera panning and marker dragging while pin notices need attention. */
  draggingLocked?: boolean
  toggleFullscreen?: (isFullscreen: boolean) => void
  toggleCollapsed?: (isCollapsed: boolean) => void
  dragEndCallback?: (lngLat: number[]) => void
  onMapReady?: (controller: MapController | null) => void
  initialCollapsed?: boolean
  activeResourceRef?: Id | string | false | null
}

// STATE : PROPS
let mapProps: MapProps = $props()
let pinIsDragging = $state(false)
let pinControlPosition = $state<{ x: number; y: number } | null>(null)
// Keep the suggestion anchored below the geographic pin during camera moves and resizing.
$effect(() => {
  const map = activeMapInstance
  const coordinates = getCoordinateTuple(mapProps.coordinates)
  if (!map || !coordinates || !mapProps.pinControls) {
    pinControlPosition = null
    return
  }
  const position = (): void => {
    const point = map.project(coordinates)
    pinControlPosition = { x: point.x, y: point.y + 34 }
  }
  position()
  map.on('move', position)
  map.on('resize', position)
  return () => {
    map.off('move', position)
    map.off('resize', position)
  }
})

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

// Seed the renderer once; reactive center props jump before our coordinate-change flight.
const initialCamera = untrack((): { center: [number, number]; zoom: number } => ({
  center: mapProps.initialCenter ??
    getCoordinateTuple(mapProps.coordinates) ?? [114.17, 22.3],
  zoom: mapProps.initialZoom ?? 20,
}))

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
let pendingViewport = $state.raw<{ center: [number, number]; zoom: number } | null>(
  null,
)
let activeMapInstance = $state<MaplibreMap | undefined>(undefined)
let resizeContainer = $state<HTMLDivElement>()
let containerResizing = $state(false)
let map = $derived(activeMapInstance)
$effect(() => {
  if (!resizeContainer || !activeMapInstance) return
  let width = resizeContainer.clientWidth,
    height = resizeContainer.clientHeight
  let timer: ReturnType<typeof setTimeout> | undefined
  // Also cover width changes from adjacent panels and responsive layout changes.
  const observer = new ResizeObserver(() => {
    if (
      !resizeContainer ||
      (width === resizeContainer.clientWidth && height === resizeContainer.clientHeight)
    )
      return
    width = resizeContainer.clientWidth
    height = resizeContainer.clientHeight
    // Keep rendering the flight while the surrounding gallery changes width.
    if (pendingViewport) {
      clearTimeout(timer)
      containerResizing = false
      return
    }
    containerResizing = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      containerResizing = false
    }, 300)
  })
  observer.observe(resizeContainer)
  return () => {
    observer.disconnect()
    clearTimeout(timer)
  }
})
const shouldFreeze = $derived(
  Boolean(mapProps.freezeForResize || (containerResizing && !pendingViewport)),
)

let movementLine = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(
  null,
)
let comparisonMapUnavailable = $state(false)
// Review overlays follow this map camera and stay visible even when basemap tiles are unavailable.
$effect(() => {
  const target = activeMapInstance
  const comparison = mapProps.comparison
  if (!target || !comparison) return
  const markers: maplibregl.Marker[] = []
  const projectLine = (): void => {
    const before = target.project(comparison.before),
      after = target.project(comparison.after)
    movementLine = { x1: before.x, y1: before.y, x2: after.x, y2: after.y }
  }
  const unavailable = (): void => {
    comparisonMapUnavailable = true
  }
  for (const [point, label, tone] of [
    [comparison.before, m.location_map_old(), 'bg-panel text-foreground'],
    [comparison.after, m.location_map_new(), 'bg-warning text-black'],
  ] as const) {
    const element = document.createElement('div')
    element.className = `rounded-full border-2 border-white px-3 py-1 text-xs font-bold shadow-lg ${tone}`
    element.textContent = label
    element.dataset.reviewMarker = label
    markers.push(
      new maplibregl.Marker({
        element,
        anchor: label === m.location_map_old() ? 'bottom-right' : 'top-left',
      })
        .setLngLat(point)
        .addTo(target),
    )
  }
  target.on('move', projectLine)
  target.on('resize', projectLine)
  target.on('error', unavailable)
  target.fitBounds(
    new maplibregl.LngLatBounds(comparison.before, comparison.before).extend(
      comparison.after,
    ),
    { padding: 90, maxZoom: 18, duration: 0 },
  )
  projectLine()
  return () => {
    target.off('move', projectLine)
    target.off('resize', projectLine)
    target.off('error', unavailable)
    markers.forEach(marker => {
      marker.remove()
    })
  }
})

// Numbered discovery markers are transient UI; removing results removes their map objects.
// Keep marker elements stable while rows are hovered or focused; hover never selects.
const candidateMarkers = new Map<string, maplibregl.Marker>()
let candidateMap: MaplibreMap | undefined
$effect(() => {
  const target = activeMapInstance
  const candidates = mapProps.locationCandidates ?? []
  if (candidateMap !== target) {
    for (const marker of candidateMarkers.values()) marker.remove()
    candidateMarkers.clear()
    candidateMap = target
  }
  const ids = new Set(candidates.map(candidate => candidate.id))
  for (const [id, marker] of candidateMarkers) {
    if (!ids.has(id)) {
      marker.remove()
      candidateMarkers.delete(id)
    }
  }
  if (!target) return
  let entranceIndex = 0
  for (const candidate of candidates) {
    let marker = candidateMarkers.get(candidate.id)
    if (!marker) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className =
        'flex size-9 items-center justify-center rounded-full border-2 border-white text-white font-bold shadow-lg hover:ring-4 hover:ring-[var(--search-color)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--search-color)]'
      button.dataset.locationCandidate = candidate.id
      button.onclick = () => mapProps.onLocationCandidateSelect?.(candidate.id)
      // Fade a separate shell so MapLibre positioning and visibility remain independent.
      const shell = document.createElement('div')
      shell.append(button)
      marker = new maplibregl.Marker({ element: shell })
        .setLngLat(candidate.coordinates)
        .addTo(target)
      marker.on('dragstart', () => {
        pinIsDragging = true
      })
      marker.on('dragend', () => {
        pinIsDragging = false
        const position = marker?.getLngLat()
        if (position) {
          // Resolve the current edit callback; marker instances outlive review state changes.
          const current = mapProps.locationCandidates?.find(
            row => row.id === candidate.id,
          )
          if (current?.onReposition) current.onReposition(position.toArray())
          else if (!current?.previewOnly) mapProps.dragEndCallback?.(position.toArray())
        }
      })
      candidateMarkers.set(candidate.id, marker)
      if (!prefersReducedMotion.current && !candidate.hidden) {
        shell.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 240,
          delay: Math.min(entranceIndex++ * 30, 600),
          easing: 'ease-out',
          fill: 'backwards',
        })
      }
    }
    marker.setDraggable(
      Boolean(
        !mapProps.draggingLocked &&
          (candidate.onReposition ||
            (candidate.selected && !candidate.previewOnly && mapProps.draggable)),
      ),
    )
    marker.setLngLat(
      candidate.selected && !candidate.previewOnly
        ? (getCoordinateTuple(mapProps.coordinates) ?? candidate.coordinates)
        : candidate.coordinates,
    )
    const shell = marker.getElement()
    const button = shell.firstElementChild
    if (!(button instanceof HTMLButtonElement)) continue
    button.style.setProperty(
      '--search-color',
      candidate.color ?? locationSearchColor(candidate.kind),
    )
    button.style.backgroundColor =
      candidate.color ?? locationSearchColor(candidate.kind)
    // Keep every preview mounted while a selection fades the other choices away.
    button.style.transition = prefersReducedMotion.current
      ? 'none'
      : 'opacity 250ms ease'
    // MapLibre writes inline opacity during camera moves; keep UI visibility authoritative.
    button.classList.toggle('opacity-0!', Boolean(candidate.hidden))
    button.classList.toggle('opacity-100!', !candidate.hidden)
    button.style.pointerEvents = candidate.hidden ? 'none' : ''
    button.tabIndex = -1
    button.setAttribute('aria-hidden', String(Boolean(candidate.hidden)))
    button.replaceChildren()
    if (candidate.number) button.textContent = String(candidate.number)
    else {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      icon.setAttribute('viewBox', '0 0 24 24')
      icon.setAttribute('width', '20')
      icon.setAttribute('height', '20')
      icon.setAttribute('fill', 'none')
      icon.setAttribute('stroke', 'currentColor')
      icon.setAttribute('stroke-width', '2')
      icon.setAttribute('aria-hidden', 'true')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute(
        'd',
        'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
      )
      icon.append(path)
      button.append(icon)
    }
    button.setAttribute(
      'aria-label',
      candidate.number ? `${candidate.number}. ${candidate.label}` : candidate.label,
    )
    button.setAttribute('aria-pressed', String(Boolean(candidate.selected)))
    button.style.width = candidate.compact ? '28px' : ''
    button.style.height = candidate.compact ? '28px' : ''
    button.style.fontSize = candidate.compact ? '12px' : ''
    button.dataset.highlighted = String(Boolean(candidate.highlighted))
    const emphasized = Boolean(
      candidate.highlighted ||
        (candidate.selected && !candidate.fitGroup?.startsWith('association:')),
    )
    button.classList.toggle('ring-4', emphasized)
    button.classList.toggle('ring-[var(--search-color)]/40', emphasized)
    shell.style.zIndex = candidate.highlighted ? '2' : candidate.selected ? '1' : '0'
    button.style.outline = emphasized ? '4px solid var(--search-color)' : ''
    button.style.outlineOffset = emphasized ? '3px' : ''
    button.style.filter = emphasized ? 'brightness(1.15)' : ''
  }
})
// Highlight the marker without animating MapLibre's positioning transform.
$effect(() => {
  if (!mapProps.pinHighlightRequest || !feature) return
  const element = feature.getElement()
  element.setAttribute('aria-label', m.feature_find_pin_help())
  const animation = element.animate(
    [
      { filter: 'drop-shadow(0 0 0 transparent)', offset: 0 },
      { filter: 'drop-shadow(0 0 10px #F04D7F) brightness(1.7)', offset: 0.2 },
      { filter: 'drop-shadow(0 0 10px #F04D7F) brightness(1.7)', offset: 0.5 },
      { filter: 'drop-shadow(0 0 0 transparent)' },
    ],
    { duration: prefersReducedMotion.current ? 0 : 380, iterations: 3 },
  )
  return () => animation.cancel()
})

onDestroy(() => {
  for (const marker of candidateMarkers.values()) marker.remove()
  candidateMarkers.clear()
})
// Camera fitting depends on membership and coordinates, never hover or focus highlights.
const candidateFitKey = $derived(
  (mapProps.locationCandidates ?? [])
    .filter(candidate => !candidate.hidden)
    .map(
      candidate =>
        `${candidate.fitGroup ?? ''}:${candidate.id}:${candidate.coordinates.join(',')}:${Boolean(candidate.onReposition)}`,
    )
    .join('|'),
)
let editingCandidateIds = ''
$effect(() => {
  const target = activeMapInstance
  const key = candidateFitKey
  if (!target || !key) return
  const candidates = untrack(() =>
    (mapProps.locationCandidates ?? []).filter(candidate => !candidate.hidden),
  )
  const review = candidates.some(candidate =>
    candidate.fitGroup?.startsWith('association:'),
  )
  // Explicit pin editing retains the user's camera while draft coordinates change.
  const ids = candidates.map(candidate => candidate.id).join('|')
  if (candidates.some(candidate => candidate.onReposition)) {
    editingCandidateIds = ids
    return
  }
  if (editingCandidateIds) {
    const sameReview = editingCandidateIds === ids
    editingCandidateIds = ''
    if (sameReview) return
  }
  if (
    review &&
    new Set(candidates.map(candidate => candidate.coordinates.join(','))).size < 2
  )
    return
  const bounds = new maplibregl.LngLatBounds()
  const pin = untrack(() => getCoordinateTuple(mapProps.coordinates))
  const isSubset = candidates.some(candidate => candidate.fitGroup)
  if (!isSubset && pin && untrack(() => mapProps.showMarker !== false))
    bounds.extend(pin)
  for (const candidate of candidates) bounds.extend(candidate.coordinates)
  /** Keep the complete marker circles inside the requested margin after a map resize.
   * @param animate Whether this is the initial comparison transition. @returns Nothing.
   */
  const fitComparisonBounds = (animate = false): void => {
    const { clientWidth: width, clientHeight: height } = target.getContainer()
    if (!width || !height) return
    const radius = review ? 20 : 0
    target.fitBounds(bounds, {
      padding: isSubset
        ? {
            top: height * 0.2 + radius,
            bottom: height * 0.2 + radius,
            left: width * 0.2 + radius,
            right: width * 0.2 + radius,
          }
        : 60,
      maxZoom: review ? 20 : 17,
      duration: animate && !prefersReducedMotion.current ? 350 : 0,
    })
  }
  // Selection owns the initial preview camera, but never disables fitting after a resize.
  if (review || !candidates.some(candidate => candidate.selected))
    fitComparisonBounds(true)
  let resizeFrame = 0
  const resized = (): void => {
    cancelAnimationFrame(resizeFrame)
    // Fit after resize listeners and frozen-container restoration have finished.
    resizeFrame = requestAnimationFrame(() => fitComparisonBounds())
  }
  // Discovery markers must stay in view after the map/results divider changes height.
  target.on('resize', resized)
  return () => {
    target.off('resize', resized)
    cancelAnimationFrame(resizeFrame)
  }
})

// STATE : DERIVED
const hasSelectedPreview = $derived(
  mapProps.locationCandidates?.some(candidate => candidate.selected) ?? false,
)
let markedAddressLngLat: [number, number] | null = $state(null)
let addressLngLat: [number, number] | null = $derived(
  mapProps.showMarker === false || hasSelectedPreview
    ? null
    : getCoordinates(mapProps.addressMeta as LngLatLike),
)
const coordinateTuple = $derived(
  mapProps.showMarker === false || hasSelectedPreview
    ? null
    : getCoordinateTuple(mapProps.coordinates),
)
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
    resolveMapStyleSpriteUrls(
      buildCatalogMapStyle(resolvedMapStyleKey, { locale: activeLocale }),
    ),
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
  const onMapReady = mapProps.onMapReady
  onMapReady?.(controller)
  return () => {
    onMapReady?.(null)
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
    draggable: (mapProps.draggable ?? true) && !mapProps.draggingLocked,
  })
    .setLngLat(coordinateTuple)
    .addTo(map)
  featureMap = map
  feature.on('dragstart', () => {
    pinIsDragging = true
  })
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
  if (!coordinateTuple) {
    // A fresh unpinned draft retains its discovery view when reusing an existing map.
    pendingViewport =
      mapProps.showMarker === false &&
      mapProps.initialCenter &&
      !mapProps.locationCandidates?.length
        ? { center: mapProps.initialCenter, zoom: mapProps.initialZoom ?? 20 }
        : null
  }
  if (map && coordinateTuple && feature) {
    feature.setDraggable((mapProps.draggable ?? true) && !mapProps.draggingLocked)
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
    if (mapProps.coordinateTransitionPending) return
    if (lastCoordinateKey === coordinateKey) {
      feature.setLngLat(coordinateTuple)
      return
    }
    lastCoordinateKey = coordinateKey
    // Editable markers and the camera are independent; only explicit navigation moves both.
    if (mapProps.draggable ?? true) {
      pendingViewport = null
      feature.setLngLat(coordinateTuple)
      return
    }
    pendingViewport = {
      center: coordinateTuple,
      zoom: untrack(() => pendingViewport?.zoom) ?? map.getZoom(),
    }
    feature.setLngLat(coordinateTuple)
  }
})

// Gallery resizing stays live; explicit map resizing can pause and resume the destination.
$effect(() => {
  const target = pendingViewport
  const mapInstance = map
  if (!mapInstance) return
  if (shouldFreeze) return untrack(() => freezeMapForResize(mapInstance))
  if (!target || mapProps.coordinateTransitionPending) return
  const duration = prefersReducedMotion.current ? 0 : VISUAL_TRANSITION_MS
  // Native camera events update Svelte bindings; they must not restart this flight effect.
  return untrack(() => {
    const releaseSize = holdMapSizeDuringFlight(mapInstance)
    const finish = (): void => {
      const center = mapInstance.getCenter()
      const arrived =
        Math.abs(center.lng - target.center[0]) < 1e-7 &&
        Math.abs(center.lat - target.center[1]) < 1e-7
      // Only layout freezes resume; user gestures and other camera commands take precedence.
      if (pendingViewport === target && (arrived || !shouldFreeze))
        pendingViewport = null
    }
    // Starting a replacement flight ends the previous one synchronously.
    mapInstance.flyTo({ ...target, duration })
    mapInstance.on('moveend', finish)
    if (!mapInstance.isMoving()) finish()
    return () => {
      mapInstance.off('moveend', finish)
      releaseSize()
    }
  })
})

// EVENTS
const handleDragEnd = (e: MarkerDragEvent): void => {
  pinIsDragging = false
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
  if (addressMarker && (addressMarkerMap !== map || !addressLngLat)) {
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
<div bind:this={resizeContainer} class="relative h-full w-full overflow-hidden">
  {#if mapProps.pinControls &&
    pinControlPosition &&
    !pinIsDragging &&
    mapProps.showMarker !== false}
    <div
      class="absolute z-30 -translate-x-1/2"
      style:left={`${pinControlPosition.x}px`}
      style:top={`${pinControlPosition.y}px`}
      data-map-pin-controls
    >
      {@render mapProps.pinControls()}
    </div>
  {/if}
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
        onclick={e => {
          e.preventDefault()
          e.stopPropagation()
          isCollapsed = !isCollapsed
          mapProps.toggleCollapsed?.(isCollapsed)
        }}
      >
        <div class="swap">
          <input
            name="collapsed"
            type="checkbox"
            checked={isCollapsed}
            onchange={() => {
              isCollapsed = !isCollapsed
              mapProps.toggleCollapsed?.(isCollapsed)
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
        onclick={e => {
          e.preventDefault()
          e.stopPropagation()
          isFullscreen = !isFullscreen
          mapProps.toggleFullscreen?.(isFullscreen)
        }}
      >
        <div class="swap">
          <input
            name="fullscreen"
            type="checkbox"
            checked={isFullscreen}
            onchange={() => {
              isFullscreen = !isFullscreen
              mapProps.toggleFullscreen?.(isFullscreen)
            }}
          >
          <Icon src={ArrowsPointingIn} class="swap-on h-5 w-5" />
          <Icon src={ArrowsPointingOut} class="swap-off h-5 w-5" />
        </div>
      </button>
    {/if}
  </div>
  <!-- Loading stays inside the final map pane until the map is ready. -->
  {#if !isMapLoaded && !mapProps.comparison}
    <MapLoading />
  {/if}

  {#if map && mapProps.premisesMapId}
    <StationFootprintLayer
      {map}
      premisesMapId={mapProps.premisesMapId}
      contextOnly
      theme={listMapStyleCatalog().find(style => style.key === resolvedMapStyleCode)
        ?.markerTheme ?? 'light'}
    />
  {/if}
  <!-- Map Container -->
  <div
    class="map bg-base-300 h-full w-full grow"
    class:opacity-0={!isMapLoaded && !mapProps.comparison}
    class:opacity-100={isMapLoaded || Boolean(mapProps.comparison)}
    data-testid="map"
  >
    <MapSurface
      bind:map={activeMapInstance}
      class="h-full w-full"
      style={resolvedMapStyle}
      center={initialCamera.center}
      zoom={initialCamera.zoom}
      attributionControl={false}
      hash={false}
      dragPan={!mapProps.draggingLocked}
      canvasContextAttributes={{ antialias: true }}
      onload={handleMapLoad}
    />
  </div>
  {#if mapProps.comparison}
    {#if movementLine}
      <svg
        class="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <line
          {...movementLine}
          stroke="#facc15"
          stroke-width="3"
          stroke-dasharray="6 6"
        />
      </svg>
    {/if}
    {#if comparisonMapUnavailable}
      <p
        class="bg-panel/95 text-muted-foreground absolute top-4 left-4 rounded p-2 text-xs"
        role="status"
      >
        {m.location_map_unavailable()}
      </p>
    {/if}
    <div
      class="bg-panel/95 text-warning absolute bottom-4 left-4 z-10 rounded-lg px-3 py-2 text-sm"
      data-review-distance
    >
      {m.location_map_distance({
        distance: String(
          Math.round(
            locationMoveDistance(mapProps.comparison.before, mapProps.comparison.after),
          ),
        ),
      })}
    </div>
  {/if}
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
