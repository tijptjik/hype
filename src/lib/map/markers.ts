// PRESENTATION
import {
  MARKER_STYLE_CODES,
  isMarkerStyleCode,
  resolveMarkerStyle,
  type MarkerStyleCode,
} from '#lib/features/markerStyle.js'
import type { BreadlineMarkerState } from '#lib/features/breadlinePresentation.js'
import {
  customMarkerModel,
  customMarkerSignature,
  createCustomMarkerElement,
} from './customMarkers'
// API
import { getImageSrc } from '#lib/client/services/image.js'
// DEBUG
import {
  isMarkerBootstrapDebugEnabled,
  logMarkerBootstrap,
} from '#lib/debug/markerBootstrap.js'
// GEOMETRY
import { getFeaturePointCoordinates } from './featureSpatial'
import { createMarkerVisibilityTest } from './markerRetention'
// STYLES
import '#lib/styles/map-markers.css'
// TYPES
import type { Map as MaplibreMap } from 'maplibre-gl'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { Id } from '#lib/types.js'
import type { MapMarkerTheme } from './styles/catalog'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. MARKER STYLE HELPERS
//    - getUserMarkerStyleVariant
//    - createMarkerElement
//
// 2. MARKER LIFECYCLE
//    - cancelMarkerRemoval
//    - createMarkerRenderer
//    - addAddressMarker

export const USER_MARKER_STYLE_PARAM = 'markerStyle'

export const MARKER_STYLE_VARIANTS = MARKER_STYLE_CODES

export type MarkerStyleVariant = (typeof MARKER_STYLE_VARIANTS)[number]

const DEFAULT_MARKER_THEME: MapMarkerTheme = 'ghostery'

type MarkerImageDiagnostics = {
  created: number
  decodeFailed: number
  decoded: number
  failed: number
  loaded: number
  startedAt: number
}

type MarkerInstance = {
  addTo: (map: MaplibreMap) => MarkerInstance
  getElement: () => HTMLElement
  remove: () => void
  setLngLat: (lngLat: [number, number]) => MarkerInstance
}

type MapLibreMarkerFactory = {
  Marker: new (options: {
    anchor?: 'center'
    clickTolerance?: number
    color?: string
    draggable?: boolean
    element: HTMLElement
  }) => MarkerInstance
}

/**
 * Selection data supplied by the application adapter to the marker renderer.
 * Native marker objects remain private to the renderer.
 */
export type MarkerRenderState = {
  selectedId?: Id | null
  highlightedIds?: ReadonlySet<Id>
}

/** Scope changes invalidate cached marker presentation independently of entity freshness. */
type MarkerRetentionOptions = { scope: string; budget: number }
type RetainedMarker = {
  marker: MarkerInstance
  coordinates: [number, number]
  attached: boolean
}

/**
 * Instance-owned marker renderer for one MapLibre map.
 */
export type MarkerRenderer = {
  sync: (
    features: FeatureFromCollection[],
    options?: {
      markerStyle?: MarkerStyleVariant
      markerStylesByProjectId?: ReadonlyMap<string, MarkerStyleCode | null>
      markerStylesByLayerId?: ReadonlyMap<string, MarkerStyleCode | null>
      /** Live date-scoped state; changes invalidate the visible marker. */
      breadlineStateByFeatureId?: ReadonlyMap<string, BreadlineMarkerState>
      /** Active basemap default; explicit layer/project palettes take precedence. */
      markerTheme?: MapMarkerTheme
      markerThemesByProjectId?: ReadonlyMap<string, MapMarkerTheme>
      /** Null selects the active map default; absence inherits the project palette. */
      markerThemesByLayerId?: ReadonlyMap<string, MapMarkerTheme | null>
      selectedId?: Id | null
      highlightedIds?: ReadonlySet<Id>
      retention?: MarkerRetentionOptions
    },
  ) => void
  getElement: (featureId: Id) => HTMLElement | null
  updateCamera: (force?: boolean) => void
  clear: () => void
}

// Track the actual marker object so pending removal never belongs to its replacement.
const pendingMarkerRemovals = new WeakMap<
  MarkerInstance,
  ReturnType<typeof setTimeout>
>()

const applyMarkerState = (
  element: HTMLElement,
  featureId: Id,
  state: MarkerRenderState,
): void => {
  element.classList.toggle('active', state.selectedId === featureId)
  element.classList.toggle('highlighted', state.highlightedIds?.has(featureId) ?? false)
}

/**
 * Summarizes whether loaded marker images are able to render in the current viewport.
 *
 * @returns Aggregate DOM and layout state for image-backed map markers.
 */
function getMarkerImageRenderState(): Record<string, number> {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>('img.marker-image'),
  )
  let attached = 0
  let inViewport = 0
  let renderable = 0
  let zeroSized = 0
  let hidden = 0

  for (const image of images) {
    const marker = image.closest<HTMLElement>('.maplibregl-marker')
    if (!marker?.isConnected) continue

    attached += 1
    const imageRect = image.getBoundingClientRect()
    const markerStyle = window.getComputedStyle(marker)
    const imageStyle = window.getComputedStyle(image)
    const hasSize = imageRect.width > 0 && imageRect.height > 0
    const isVisible =
      markerStyle.display !== 'none' &&
      markerStyle.visibility !== 'hidden' &&
      Number(markerStyle.opacity) > 0 &&
      imageStyle.display !== 'none' &&
      imageStyle.visibility !== 'hidden' &&
      Number(imageStyle.opacity) > 0
    const isInViewport =
      imageRect.right > 0 &&
      imageRect.bottom > 0 &&
      imageRect.left < window.innerWidth &&
      imageRect.top < window.innerHeight

    if (!hasSize) zeroSized += 1
    if (!isVisible) hidden += 1
    if (isInViewport) inViewport += 1
    if (hasSize && isVisible && isInViewport) renderable += 1
  }

  return {
    attached,
    hidden,
    inViewport,
    renderable,
    zeroSized,
  }
}

/**
 * Normalizes a raw marker-style value to a supported variant.
 *
 * @param value - Raw query param or persisted preference value.
 * @returns Supported marker style variant.
 */
export function getUserMarkerStyleVariant(value: string | null): MarkerStyleVariant {
  return isMarkerStyleCode(value) ? value : 'image'
}

/**
 * Builds the default dot marker DOM subtree.
 *
 * @returns Root marker element ready to pass to MapLibre.
 */
export function createMarkerElement(): HTMLDivElement {
  const container = document.createElement('div')
  container.className = 'marker-container marker-fade-in'
  container.dataset.type = 'marker'
  container.dataset.markerSignature = 'dot'

  const innerContainer = document.createElement('div')
  innerContainer.className = 'marker-inner'
  innerContainer.dataset.type = 'marker'

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.dataset.type = 'marker'

  // Create outer circle
  const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  outerCircle.setAttribute('cx', '12')
  outerCircle.setAttribute('cy', '12')
  outerCircle.setAttribute('r', '8')
  outerCircle.setAttribute('class', 'marker-circle')
  outerCircle.dataset.type = 'marker'

  // Create inner dot
  const innerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  innerDot.setAttribute('cx', '12')
  innerDot.setAttribute('cy', '12')
  innerDot.setAttribute('r', '2')
  innerDot.setAttribute('class', 'marker-dot')
  innerDot.dataset.type = 'marker'

  // Append circles to SVG
  svg.appendChild(outerCircle)
  svg.appendChild(innerDot)

  // Append SVG to inner container, then inner to outer
  innerContainer.appendChild(svg)
  container.appendChild(innerContainer)

  return container
}

/**
 * Resolves the transformed image URL used by an image-backed feature marker.
 *
 * @param feature - Feature whose canonical image should be displayed.
 * @returns Derived image URL, or `null` when the feature has no image.
 */
function getFeatureMarkerImageSrc(feature: FeatureFromCollection): string | null {
  return getImageSrc(feature.image, {
    transformation: 'c_fill,h_128,w_128',
  })
}

/**
 * Resolves marker styling from explicit layer/project choices before the map default.
 *
 * @param feature - Feature being rendered as a marker.
 * @param markerThemesByProjectId - Explicit project palettes indexed by project id.
 * @param markerThemesByLayerId - Layer palettes; null selects the map default.
 * @param activeTheme - Chosen basemap palette for default markers.
 * @returns Layer palette, inherited project palette, or the chosen map default.
 */
function getFeatureMarkerTheme(
  feature: FeatureFromCollection,
  markerThemesByProjectId: ReadonlyMap<string, MapMarkerTheme>,
  markerThemesByLayerId: ReadonlyMap<string, MapMarkerTheme | null>,
  activeTheme?: MapMarkerTheme,
): MapMarkerTheme {
  const fallback = activeTheme ?? DEFAULT_MARKER_THEME
  const layerTheme = feature.layerId
    ? markerThemesByLayerId.get(feature.layerId)
    : undefined
  if (layerTheme === null) return fallback
  return layerTheme ?? markerThemesByProjectId.get(feature.projectId) ?? fallback
}

/**
 * Builds one marker element for the requested presentation variant.
 *
 * @param feature - Feature represented by the marker.
 * @param markerStyle - Image or dot presentation mode.
 * @param markerTheme - Palette treatment for the marker.
 * @param diagnostics - Optional image bootstrap counters.
 * @returns Marker DOM element ready for MapLibre placement.
 */
function createFeatureMarkerElement(
  feature: FeatureFromCollection,
  markerStyle: MarkerStyleVariant,
  markerTheme: MapMarkerTheme,
  diagnostics?: MarkerImageDiagnostics,
): HTMLDivElement {
  if (markerStyle === 'dot') {
    const marker = createMarkerElement()
    marker.classList.add(`marker-theme--${markerTheme}`)
    marker.dataset.markerSignature = `dot:${markerTheme}`
    return marker
  }

  const imageSrc = getFeatureMarkerImageSrc(feature)
  if (!imageSrc) {
    const marker = createMarkerElement()
    marker.classList.add(`marker-theme--${markerTheme}`)
    marker.dataset.markerSignature = `dot:${markerTheme}`
    return marker
  }

  const container = document.createElement('div')
  container.className = `marker-container marker-container--feature marker-theme--${markerTheme} marker-fade-in`
  container.dataset.type = 'marker'
  container.dataset.markerSignature = `${imageSrc}:${markerTheme}`

  const innerContainer = document.createElement('div')
  innerContainer.className = 'marker-inner marker-inner--feature'
  innerContainer.dataset.type = 'marker'

  const image = document.createElement('img')
  image.className =
    'marker-image opacity-0 transition-opacity duration-200 motion-reduce:transition-none'
  image.alt = ''
  // MapLibre positions markers outside normal document flow, so native lazy loading
  // can indefinitely defer their first uncached image request.
  image.loading = 'eager'
  image.decoding = 'async'
  image.draggable = false
  image.dataset.type = 'marker'

  // Keep progressive image bytes hidden until decoding finishes; the marker hit
  // target and frame remain available throughout loading and on request failure.
  const skeleton = document.createElement('div')
  skeleton.className =
    'pointer-events-none absolute inset-0 rounded-full bg-base-300 animate-pulse motion-reduce:animate-none'
  skeleton.setAttribute('aria-hidden', 'true')
  innerContainer.dataset.imageState = 'loading'
  if (diagnostics) diagnostics.created += 1

  image.addEventListener(
    'load',
    async () => {
      if (diagnostics) diagnostics.loaded += 1
      try {
        if (typeof image.decode === 'function') await image.decode()
        if (diagnostics) diagnostics.decoded += 1
      } catch {
        // Some browsers reject decode for an otherwise paintable, fully loaded image.
        if (diagnostics) {
          diagnostics.decodeFailed += 1
          logMarkerBootstrap('marker image decode failed', {
            featureId: feature.id,
            imageSrc,
          })
        }
        if (!image.complete || image.naturalWidth === 0) return
      }
      innerContainer.dataset.imageState = 'ready'
      image.classList.replace('opacity-0', 'opacity-100')
      skeleton.remove()
    },
    { once: true },
  )
  image.addEventListener(
    'error',
    () => {
      innerContainer.dataset.imageState = 'error'
      skeleton.classList.remove('animate-pulse')
      if (diagnostics) {
        diagnostics.failed += 1
        logMarkerBootstrap('marker image request failed', {
          featureId: feature.id,
          imageSrc,
        })
      }
    },
    { once: true },
  )

  image.src = imageSrc

  const frame = document.createElement('div')
  frame.className = 'marker-image-frame'
  frame.dataset.type = 'marker'

  innerContainer.appendChild(skeleton)
  innerContainer.appendChild(image)
  innerContainer.appendChild(frame)
  container.appendChild(innerContainer)

  return container
}

/**
 * Cancels a marker's pending fade removal when it becomes visible or is explicitly cleared.
 * @param marker Marker object whose lifecycle is changing.
 * @returns Nothing after removing its pending timer and fade state.
 */
function cancelMarkerRemoval(marker: MarkerInstance): void {
  const timer = pendingMarkerRemovals.get(marker)
  if (timer !== undefined) {
    clearTimeout(timer)
    pendingMarkerRemovals.delete(marker)
  }
  marker.getElement().classList.remove('marker-fade-out')
}

/**
 * Creates an instance-owned renderer for native MapLibre markers.
 *
 * @param map - Map instance that owns the markers.
 * @param maplibre - MapLibre namespace used to construct markers.
 * @param onElementChange - Optional transition handoff for marker DOM elements.
 * @returns Renderer with declarative reconciliation and explicit element lookup.
 */
export function createMarkerRenderer(
  map: MaplibreMap,
  maplibre: MapLibreMarkerFactory,
  onElementChange?: (featureId: Id, element: HTMLElement | null) => void,
): MarkerRenderer {
  const markers = new Map<Id, MarkerInstance>()
  const retained = new Map<Id, RetainedMarker>()
  const positions = new Map<Id, [number, number]>()
  const detached = new Set<Id>()
  let lastCameraUpdate = -Infinity
  let retentionScope: string | undefined
  const diagnosticsTimers = new Set<number>()
  let disposed = false

  // Keep decoded nodes warm without giving offscreen markers per-frame MapLibre work.
  const updateCamera = (force = false): void => {
    if (disposed || retentionScope === undefined) return
    const now = performance.now()
    if (!force && now - lastCameraUpdate < 80) return
    lastCameraUpdate = now
    const isNear = createMarkerVisibilityTest(map)
    for (const [id, coordinates] of positions) {
      const marker = markers.get(id)
      if (!marker) continue
      const near = isNear(coordinates)
      if (near === !detached.has(id)) continue
      if (near) {
        marker.addTo(map)
        detached.delete(id)
      } else {
        marker.remove()
        detached.add(id)
      }
      onElementChange?.(id, near ? marker.getElement() : null)
    }
    // The query already caps active rows at 500. Cached presentation must not
    // multiply that live rendering cost; keep a small advance guard for panning.
    let available = Math.min(64, Math.max(0, 500 - (markers.size - detached.size)))
    for (const [id, entry] of [...retained].reverse()) {
      const near = available > 0 && isNear(entry.coordinates)
      if (near) available--
      if (near === entry.attached) continue
      if (near) entry.marker.addTo(map)
      else entry.marker.remove()
      entry.attached = near
      onElementChange?.(id, near ? entry.marker.getElement() : null)
    }
  }

  const clear = (): void => {
    for (const timer of diagnosticsTimers) window.clearTimeout(timer)
    diagnosticsTimers.clear()
    for (const [id, marker] of markers) {
      cancelMarkerRemoval(marker)
      marker.remove()
      onElementChange?.(id, null)
    }
    markers.clear()
    for (const [id, entry] of retained) {
      entry.marker.remove()
      onElementChange?.(id, null)
    }
    retained.clear()
    positions.clear()
    detached.clear()
  }

  const sync = (
    features: FeatureFromCollection[],
    options: {
      markerStyle?: MarkerStyleVariant
      markerStylesByProjectId?: ReadonlyMap<string, MarkerStyleCode | null>
      markerStylesByLayerId?: ReadonlyMap<string, MarkerStyleCode | null>
      /** Live date-scoped state; changes invalidate the visible marker. */
      breadlineStateByFeatureId?: ReadonlyMap<string, BreadlineMarkerState>
      /** Active basemap default; explicit layer/project palettes take precedence. */
      markerTheme?: MapMarkerTheme
      markerThemesByProjectId?: ReadonlyMap<string, MapMarkerTheme>
      /** Null selects the active map default; absence inherits the project palette. */
      markerThemesByLayerId?: ReadonlyMap<string, MapMarkerTheme | null>
      selectedId?: Id | null
      highlightedIds?: ReadonlySet<Id>
      retention?: MarkerRetentionOptions
    } = {},
  ): void => {
    if (disposed) return
    const retention = options.retention
    const nextRetentionScope = retention
      ? JSON.stringify([
          retention.scope,
          options.markerStyle ?? 'image',
          [...(options.markerStylesByProjectId ?? new Map())],
          [...(options.markerStylesByLayerId ?? new Map())],
          [...(options.breadlineStateByFeatureId ?? new Map())],
          options.markerTheme,
          [...(options.markerThemesByProjectId ?? new Map())],
          [...(options.markerThemesByLayerId ?? new Map())],
        ])
      : undefined
    const incomingIds = new Set(features.map(feature => feature.id))
    // Filter/auth/style transitions cannot leave old cached presentation available.
    if (retentionScope !== nextRetentionScope) {
      for (const [id, entry] of retained) {
        entry.marker.remove()
        onElementChange?.(id, null)
      }
      retained.clear()
      // Existing active IDs will be refreshed below, but obsolete IDs must be discarded.
      for (const [id, marker] of markers) {
        if (incomingIds.has(id)) continue
        cancelMarkerRemoval(marker)
        marker.remove()
        markers.delete(id)
        positions.delete(id)
        detached.delete(id)
        onElementChange?.(id, null)
      }
    }
    retentionScope = nextRetentionScope
    const isNear = retention ? createMarkerVisibilityTest(map) : () => true
    const markerStyle = options.markerStyle ?? 'image'
    const markerThemesByProjectId = options.markerThemesByProjectId ?? new Map()
    const markerThemesByLayerId = options.markerThemesByLayerId ?? new Map()
    const markerState: MarkerRenderState = {
      selectedId: options.selectedId,
      highlightedIds: options.highlightedIds,
    }
    const diagnostics = isMarkerBootstrapDebugEnabled()
      ? {
          created: 0,
          decodeFailed: 0,
          decoded: 0,
          failed: 0,
          loaded: 0,
          startedAt: performance.now(),
        }
      : undefined
    const pointFeatures = features.filter(feature =>
      getFeaturePointCoordinates(feature.geometry),
    )
    const newFeatureIds = new Set(pointFeatures.map(feature => feature.id as Id))

    // Keep fade deadlines attached to the marker object, never to a feature id.
    for (const [id, marker] of markers.entries()) {
      if (newFeatureIds.has(id)) {
        cancelMarkerRemoval(marker)
      } else if (retention && positions.has(id)) {
        // Preserve the exact image node; nearby parked markers avoid MapLibre reattachment.
        cancelMarkerRemoval(marker)
        const coordinates = positions.get(id)
        if (!coordinates) continue
        const attached = !detached.has(id)
        // Keep nearby parked elements visible until the bounded camera pass detaches them.
        marker.getElement().hidden = false
        detached.delete(id)
        retained.delete(id)
        retained.set(id, { marker, coordinates, attached })
        markers.delete(id)
        positions.delete(id)
        if (!attached) onElementChange?.(id, null)
      } else if (!pendingMarkerRemovals.has(marker)) {
        marker.getElement().classList.add('marker-fade-out')
        const timer = setTimeout(() => {
          if (pendingMarkerRemovals.get(marker) !== timer) return
          pendingMarkerRemovals.delete(marker)
          marker.remove()
          if (markers.get(id) === marker) {
            markers.delete(id)
            positions.delete(id)
            detached.delete(id)
            onElementChange?.(id, null)
          }
        }, 300)
        pendingMarkerRemovals.set(marker, timer)
      }
    }

    for (const feature of pointFeatures) {
      const coordinates = getFeaturePointCoordinates(feature.geometry)
      if (!coordinates) continue
      const markerTheme = getFeatureMarkerTheme(
        feature,
        markerThemesByProjectId,
        markerThemesByLayerId,
        options.markerTheme,
      )
      const cached = retained.get(feature.id)
      if (cached) {
        retained.delete(feature.id)
        cached.marker.getElement().hidden = false
        positions.set(feature.id, cached.coordinates)
        if (!cached.attached) detached.add(feature.id)
        markers.set(feature.id, cached.marker)
        onElementChange?.(
          feature.id,
          cached.attached ? cached.marker.getElement() : null,
        )
      }
      const previousCoordinates = positions.get(feature.id)
      positions.set(feature.id, coordinates)
      const existingMarker = markers.get(feature.id)
      const effectiveStyle = resolveMarkerStyle(
        options.markerStylesByProjectId?.get(feature.projectId),
        options.markerStylesByLayerId?.get(feature.layerId),
        markerStyle,
      )
      const custom = customMarkerModel(effectiveStyle, {
        feature,
        imageSrc: effectiveStyle === 'flag' ? getFeatureMarkerImageSrc(feature) : null,
        state: options.breadlineStateByFeatureId?.get(feature.id),
      })
      const nextSignature = custom
        ? customMarkerSignature(custom)
        : effectiveStyle === 'dot'
          ? `dot:${markerTheme}`
          : `${getFeatureMarkerImageSrc(feature) ?? 'dot'}:${markerTheme}`

      if (existingMarker) {
        const element = existingMarker.getElement()
        cancelMarkerRemoval(existingMarker)
        if (
          previousCoordinates?.[0] !== coordinates[0] ||
          previousCoordinates?.[1] !== coordinates[1]
        )
          existingMarker.setLngLat(coordinates)
        if (!retention && detached.delete(feature.id)) {
          existingMarker.addTo(map)
          onElementChange?.(feature.id, element)
        }
        if (element.dataset.markerSignature === nextSignature) {
          applyMarkerState(element, feature.id, markerState)
          continue
        }
        existingMarker.remove()
        markers.delete(feature.id)
        onElementChange?.(feature.id, null)
      }

      const element = custom
        ? createCustomMarkerElement(custom)
        : createFeatureMarkerElement(feature, effectiveStyle, markerTheme, diagnostics)
      const addDataToElements = (node: Element): void => {
        node.setAttribute('data-type', 'marker')
        node.setAttribute('data-feature-id', feature.id as string)
        Array.from(node.children).forEach(addDataToElements)
      }
      addDataToElements(element)
      applyMarkerState(element, feature.id, markerState)
      const marker = new maplibre.Marker({ element, anchor: 'center' }).setLngLat(
        coordinates,
      )
      const attached = isNear(coordinates)
      if (attached) {
        marker.addTo(map)
        detached.delete(feature.id)
      } else detached.add(feature.id)
      markers.set(feature.id, marker)
      onElementChange?.(feature.id, attached ? element : null)
    }

    // Keep nearby cached presentation current; evict only when capacity requires it.
    updateCamera(true)
    const distant: Id[] = []
    const nearby: Id[] = []
    for (const [id, entry] of retained) {
      const near = entry.attached
      applyMarkerState(entry.marker.getElement(), id, markerState)
      const candidates = near ? nearby : distant
      candidates.push(id)
    }
    const requestedBudget = retention?.budget ?? 0
    const budget = Number.isFinite(requestedBudget)
      ? Math.max(500, Math.min(1500, Math.floor(requestedBudget)))
      : 1000
    // Oldest distant entries go first, then oldest nearby entries; active markers are protected.
    for (const id of [...distant, ...nearby]) {
      if (markers.size + retained.size <= budget) break
      retained.get(id)?.marker.remove()
      retained.delete(id)
      onElementChange?.(id, null)
    }

    if (diagnostics?.created) {
      const reportMarkerImageState = (delayMs: number): void => {
        const timer = window.setTimeout(() => {
          diagnosticsTimers.delete(timer)
          logMarkerBootstrap('marker image batch state', {
            delayMs,
            created: diagnostics.created,
            decodeFailed: diagnostics.decodeFailed,
            decoded: diagnostics.decoded,
            loaded: diagnostics.loaded,
            failed: diagnostics.failed,
            pending: diagnostics.created - diagnostics.loaded - diagnostics.failed,
            elapsedMs: Math.round(performance.now() - diagnostics.startedAt),
            renderState: getMarkerImageRenderState(),
          })
        }, delayMs)
        diagnosticsTimers.add(timer)
      }
      logMarkerBootstrap('markers reconciled', {
        featureCount: features.length,
        markerStyle,
        imageMarkersCreated: diagnostics.created,
        markerCount: markers.size,
      })
      reportMarkerImageState(1_000)
      reportMarkerImageState(5_000)
    }
  }

  return {
    sync,
    updateCamera,
    getElement: featureId => {
      const cached = retained.get(featureId)
      return (
        (detached.has(featureId) ? null : markers.get(featureId)?.getElement()) ??
        (cached?.attached ? cached.marker.getElement() : null)
      )
    },
    clear: () => {
      disposed = true
      clear()
    },
  }
}

/**
 * Adds a temporary address/geocode marker to the active map.
 *
 * @param maplibre - MapLibre namespace used to construct markers.
 * @param map - Map instance on which to place the marker.
 * @param lngLat - Marker coordinates in `[lng, lat]` order.
 * @returns Newly created marker instance.
 */
export function addAddressMarker(
  maplibre: MapLibreMarkerFactory,
  map: MaplibreMap,
  lngLat: [number, number],
): MarkerInstance {
  const el = createMarkerElement()
  el.classList.add('marker-address')
  el.setAttribute('data-feature-property', 'geoCodeCoordinates')
  const marker = new maplibre.Marker({
    element: el,
    color: '#ef4444',
    anchor: 'center',
  })
    .setLngLat(lngLat)
    .addTo(map)
  return marker
}
