import type { AppCtx } from '$lib/context/app.svelte'
// API
import { getImageSrc } from '$lib/client/services/image'
// STYLES
import '$lib/styles/map.css'
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
  image.src = imageSrc
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  image.draggable = false
  image.dataset.type = 'marker'

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
      const el = createFeatureMarkerElement(feature, markerStyle)
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
 * @param appCtx - App context containing the active map instance.
 * @param lngLat - Marker coordinates in `[lng, lat]` order.
 * @returns Newly created marker instance.
 */
export function addAddressMarker(
  maplibre: any,
  appCtx: AppCtx,
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
    .addTo(appCtx.map)
  return marker
}
