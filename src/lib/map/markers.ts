import type { AppCtx } from '$lib/context/app.svelte'
// API
import { getImageSrc } from '$lib/client/services/image'
// DEBUG
import {
  isMarkerBootstrapDebugEnabled,
  logMarkerBootstrap,
} from '$lib/debug/markerBootstrap'
// STYLES
import '$lib/styles/map.css'
// TYPES
import type { Map as MaplibreMap } from 'maplibre-gl'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. MARKER STYLE HELPERS
//    - getUserMarkerStyleVariant
//    - createMarkerElement
//
// 2. MARKER LIFECYCLE
//    - updateMarkers
//    - addMarkerClass
//    - removeMarkerClass
//    - addAddressMarker

export const USER_MARKER_STYLE_PARAM = 'markerStyle'

export const MARKER_STYLE_VARIANTS = ['image', 'dot'] as const

export type MarkerStyleVariant = (typeof MARKER_STYLE_VARIANTS)[number]

type MarkerImageDiagnostics = {
  created: number
  decodeFailed: number
  decoded: number
  failed: number
  loaded: number
  startedAt: number
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
  return value === 'dot' ? 'dot' : 'image'
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

function getFeatureMarkerImageSrc(feature: FeatureFromCollection): string | null {
  return getImageSrc(feature.image, {
    transformation: 'c_fill,h_128,w_128',
  })
}

function createFeatureMarkerElement(
  feature: FeatureFromCollection,
  markerStyle: MarkerStyleVariant,
  diagnostics?: MarkerImageDiagnostics,
): HTMLDivElement {
  if (markerStyle === 'dot') {
    return createMarkerElement()
  }

  const imageSrc = getFeatureMarkerImageSrc(feature)
  if (!imageSrc) {
    return createMarkerElement()
  }

  const container = document.createElement('div')
  container.className = 'marker-container marker-container--feature marker-fade-in'
  container.dataset.type = 'marker'
  container.dataset.markerSignature = imageSrc

  const innerContainer = document.createElement('div')
  innerContainer.className = 'marker-inner marker-inner--feature'
  innerContainer.dataset.type = 'marker'

  const image = document.createElement('img')
  image.className = 'marker-image'
  image.alt = ''
  // MapLibre positions markers outside normal document flow, so native lazy loading
  // can indefinitely defer their first uncached image request.
  image.loading = 'eager'
  image.decoding = 'async'
  image.draggable = false
  image.dataset.type = 'marker'

  if (diagnostics) {
    diagnostics.created += 1
    image.addEventListener('load', () => {
      diagnostics.loaded += 1
      void image.decode().then(
        () => {
          diagnostics.decoded += 1
        },
        () => {
          diagnostics.decodeFailed += 1
          logMarkerBootstrap('marker image decode failed', {
            featureId: feature.id,
            imageSrc,
          })
        },
      )
    })
    image.addEventListener('error', () => {
      diagnostics.failed += 1
      logMarkerBootstrap('marker image request failed', {
        featureId: feature.id,
        imageSrc,
      })
    })
  }

  image.src = imageSrc

  const frame = document.createElement('div')
  frame.className = 'marker-image-frame'
  frame.dataset.type = 'marker'

  innerContainer.appendChild(image)
  innerContainer.appendChild(frame)
  container.appendChild(innerContainer)

  return container
}

/**
 * Reconciles the rendered marker cache against the current feature set.
 *
 * @param appCtx - App context containing the active map and marker cache.
 * @param features - Features that should currently render markers.
 * @param maplibre - MapLibre namespace used to construct markers.
 * @param markerStyle - Visual marker variant to render.
 * @returns Cleanup function that removes all managed markers.
 */
export function updateMarkers(
  appCtx: AppCtx,
  features: FeatureFromCollection[],
  maplibre: any,
  markerStyle: MarkerStyleVariant = 'image',
) {
  if (!appCtx.map) return
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
  // Create a set of new feature IDs
  const newFeatureIds = new Set(features.map(f => f.id as string))
  // Remove markers that are no longer present
  for (const [id, marker] of appCtx.state.markers.entries()) {
    if (!newFeatureIds.has(id)) {
      marker.getElement().classList.add('marker-fade-out')
      // Remove marker after animation completes
      setTimeout(() => {
        marker.remove()
        appCtx.state.markers.delete(id)
      }, 300) // Match this with CSS transition duration
    }
  }

  // Add or update markers
  features.forEach(feature => {
    if (feature.geometry?.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates
      const existingMarker = appCtx.state.markers.get(feature.id)
      if (existingMarker) {
        const nextMarkerSignature =
          markerStyle === 'dot'
            ? 'dot'
            : (getFeatureMarkerImageSrc(feature) ?? 'default')
        const currentMarkerSignature =
          existingMarker.getElement().dataset.markerSignature ?? 'default'
        // Skip churn when the rendered marker image/dot state is unchanged.
        if (currentMarkerSignature === nextMarkerSignature) {
          return
        }

        existingMarker.remove()
        appCtx.state.markers.delete(feature.id)
      }
      // Create new marker
      const el = createFeatureMarkerElement(feature, markerStyle, diagnostics)
      // Add data attributes to all elements in the marker
      const addDataToElements = (element: Element) => {
        element.setAttribute('data-type', 'marker')
        element.setAttribute('data-feature-id', feature.id as string)
        Array.from(element.children).forEach(addDataToElements)
      }
      addDataToElements(el)
      const marker = new maplibre.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([lng, lat])
        .addTo(appCtx.map)
      // Add marker to appCtx
      appCtx.state.markers.set(feature.id, marker)
    }
  })

  if (diagnostics?.created) {
    const reportMarkerImageState = (delayMs: number): void => {
      window.setTimeout(() => {
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
    }

    logMarkerBootstrap('markers reconciled', {
      featureCount: features.length,
      markerStyle,
      imageMarkersCreated: diagnostics.created,
      markerCount: appCtx.state.markers.size,
    })
    reportMarkerImageState(1_000)
    reportMarkerImageState(5_000)
  }
  // Return cleanup function
  return () => {
    // Remove all markers and their event listeners
    for (const [_, marker] of appCtx.state.markers.entries()) {
      marker.remove() // This also removes the event listeners
    }
    appCtx.state.markers.clear()
  }
}

/**
 * Adds a CSS class to one rendered marker.
 *
 * @param appCtx - App context containing the marker cache.
 * @param featureId - Feature id whose marker should be updated.
 * @param className - CSS class to add.
 * @returns Nothing.
 */
export function addMarkerClass(
  appCtx: AppCtx,
  featureId: string,
  className: string = 'active',
) {
  if (!appCtx.map) return
  // Set active state to new feature
  appCtx.state.markers.get(featureId)?.getElement().classList.add(className)
}

/**
 * Removes a CSS class from one rendered marker.
 *
 * @param appCtx - App context containing the marker cache.
 * @param featureId - Feature id whose marker should be updated.
 * @param className - CSS class to remove.
 * @returns Nothing.
 */
export function removeMarkerClass(
  appCtx: AppCtx,
  featureId: string,
  className: string = 'active',
) {
  if (!appCtx.map) return
  appCtx.state.markers.get(featureId)?.getElement().classList.remove(className)
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
  maplibre: any,
  map: MaplibreMap,
  lngLat: [number, number],
) {
  const el = createMarkerElement()
  el.classList.add('marker-address')
  el.setAttribute('data-feature-property', 'geoCodeCoordinates')
  // @ts-expect-error
  const marker = new maplibre.Marker({
    element: el,
    color: '#ef4444',
    anchor: 'center',
  })
    .setLngLat(lngLat)
    .addTo(map)
  return marker
}
