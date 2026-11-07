<script lang="ts">
// SVELTE
import 'svelte-maplibre-gl/vite'
// MAP
import { LngLatBounds } from 'maplibre-gl'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import {
  buildCatalogMapStyle,
  applyRuntimeBasemapSource,
  getConfiguredBasemapAccessToken,
} from '#lib/map/styles/index.js'
import { resolveMapStyleSpriteUrls } from '#lib/map/styles/runtime.js'
import { embedCoordinate, embedLabel } from '#lib/embed/presentation.js'
// TYPES
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { EmbedConfig, EmbedCamera } from '#lib/embed/config.js'

let {
  features,
  config,
  fitFeatures,
  onselect,
  oncamera,
}: {
  features: FeatureFromCollection[]
  fitFeatures: FeatureFromCollection[]
  config: EmbedConfig
  onselect: (id: string) => void
  oncamera?: (camera: EmbedCamera) => void
} = $props()
let map = $state<MapLibreMap>()
let loaded = $state(false)
let fitted = false
// MapLibre starts compact attribution expanded. Collapse it once when the control
// is ready, without waiting for tiles or overriding subsequent visitor toggles.
$effect(() => {
  if (!map) return
  const container = map.getContainer()
  const collapse = (): void => {
    const control = container.querySelector(
      '.maplibregl-ctrl-attrib.maplibregl-compact',
    )
    if (!control) return
    observer.disconnect()
    control.classList.remove('maplibregl-compact-show')
  }
  const observer = new MutationObserver(collapse)
  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
  collapse()
  return () => observer.disconnect()
})
const style = $derived(
  applyRuntimeBasemapSource(
    resolveMapStyleSpriteUrls(
      buildCatalogMapStyle(config.mapStyle, {
        locale:
          config.lang === 'zh-Hant'
            ? 'zhHant'
            : config.lang === 'zh-Hans'
              ? 'zhHans'
              : 'en',
      }),
    ),
    getConfiguredBasemapAccessToken(),
  ),
)
const geojson = $derived({
  type: 'FeatureCollection' as const,
  features: features.flatMap(feature => {
    const coordinates = embedCoordinate(feature)
    return coordinates
      ? [
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates },
            properties: {
              id: feature.id,
              title: embedLabel(feature, config.lang, 'title', feature.id),
            },
          },
        ]
      : []
  }),
})
$effect(() => {
  if (!map || !loaded) return
  const update = (): void => {
    if (!map?.isStyleLoaded()) return
    if (!map.getSource('embed-features')) {
      map.addSource('embed-features', { type: 'geojson', data: geojson })
      map.addLayer({
        id: 'embed-points',
        type: 'circle',
        source: 'embed-features',
        paint: {
          'circle-radius': 7,
          'circle-color': '#e2597d',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
    } else (map.getSource('embed-features') as GeoJSONSource).setData(geojson)
  }
  update()
  map.on('styledata', update)
  return () => {
    map?.off('styledata', update)
  }
})
/** Fits the preview to its initially active layers, resetting tilt and rotation.
 * @returns Whether any located features were available to fit.
 */
function fitActiveLayers(): boolean {
  if (!map || !loaded) return false
  const points = fitFeatures
    .map(embedCoordinate)
    .filter((point): point is [number, number] => point !== null)
  if (!points.length) return false
  const bounds = new LngLatBounds(points[0], points[0])
  points.forEach(point => {
    bounds.extend(point)
  })
  map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0, pitch: 0, bearing: 0 })
  return true
}
$effect(() => {
  if (!map || !loaded || fitted || config.camera || !fitFeatures.length) return
  fitted = fitActiveLayers()
})
$effect(() => {
  // Only the same-origin builder may request a camera reset in its preview iframe.
  const receive = (event: MessageEvent): void => {
    if (
      window.parent === window ||
      event.origin !== window.location.origin ||
      event.source !== window.parent ||
      event.data?.type !== 'hype-embed-fit'
    )
      return
    fitActiveLayers()
  }
  window.addEventListener('message', receive)
  return () => window.removeEventListener('message', receive)
})
$effect(() => {
  if (!map) return
  const target = map
  const click = (event: import('maplibre-gl').MapMouseEvent): void => {
    if (!target.getLayer('embed-points')) return
    const item = target.queryRenderedFeatures(event.point, {
      layers: ['embed-points'],
    })[0]
    if (item?.properties?.id) onselect(String(item.properties.id))
  }
  const camera = (): void => {
    const center = target.getCenter()
    oncamera?.([
      center.lng,
      center.lat,
      target.getZoom(),
      target.getPitch(),
      target.getBearing(),
    ])
  }
  target.on('click', click)
  target.on('moveend', camera)
  return () => {
    target.off('click', click)
    target.off('moveend', camera)
  }
})
</script>
<MapSurface
  bind:map
  {style}
  class="h-full w-full"
  center={config.camera ? [config.camera[0], config.camera[1]] : [114.17, 22.3]}
  zoom={config.camera?.[2] ?? 10}
  pitch={config.camera?.[3] ?? 0}
  bearing={config.camera?.[4] ?? 0}
  attributionControl={{
    compact: true,
    customAttribution:
      '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>',
  }}
  scrollZoom={true}
  cooperativeGestures={false}
  onload={() => (loaded = true)}
/>
