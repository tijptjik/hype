<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// MAP
import 'svelte-maplibre-gl/vite'
import { AttributionControl, NavigationControl } from 'svelte-maplibre-gl'
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import {
  applyRuntimeBasemapSource,
  buildCatalogMapStyle,
  getConfiguredBasemapAccessToken,
  getDefaultMapStyleKey,
  isMapStyleKey,
} from '#lib/map/styles/index.js'
import {
  applyMapCanvasBackground,
  resolveMapStyleSpriteUrls,
} from '#lib/map/styles/runtime.js'
// THEME
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { getLocaleKey } from '#lib/i18n.js'
// TYPES
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ExteriorFootprintProperties } from '#lib/locations/exterior/footprints.server.js'

let {
  coordinates,
  footprints,
  selectedFootprint,
  includedFootprints = [],
  onselect,
  class: className = '',
}: {
  coordinates: [number, number]
  footprints: FeatureCollection<Polygon | MultiPolygon, ExteriorFootprintProperties>
  includedFootprints?: string[]
  selectedFootprint: string
  class?: string
  onselect: (id: string) => void
} = $props()
let map = $state.raw<MapLibreMap>()
const theme = getThemeModel()
const style = $derived(
  applyRuntimeBasemapSource(
    resolveMapStyleSpriteUrls(
      buildCatalogMapStyle(
        theme?.resolvedMapStyle && isMapStyleKey(theme.resolvedMapStyle)
          ? theme.resolvedMapStyle
          : getDefaultMapStyleKey(),
        { locale: getLocaleKey() },
      ),
    ),
    getConfiguredBasemapAccessToken(),
  ),
)

$effect(() => {
  const instance = map
  if (!instance) return
  applyMapCanvasBackground(instance.getContainer(), style, instance)
  /** Restore source layers when MapLibre changes style. @returns Nothing. */
  const render = (): void => {
    if (!instance.getStyle()?.layers) return
    if (!instance.getSource('exterior-footprints')) {
      instance.addSource('exterior-footprints', { type: 'geojson', data: footprints })
      instance.addLayer({
        id: 'exterior-footprints-fill',
        type: 'fill',
        source: 'exterior-footprints',
        paint: { 'fill-color': '#168397', 'fill-opacity': 0.28 },
      })
      instance.addLayer({
        id: 'exterior-footprints-line',
        type: 'line',
        source: 'exterior-footprints',
        paint: { 'line-color': '#126a7a', 'line-width': 1.5 },
      })
      instance.addLayer({
        id: 'exterior-footprints-included-fill',
        type: 'fill',
        source: 'exterior-footprints',
        filter: ['in', ['get', 'csuid'], ['literal', includedFootprints]],
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.55 },
      })
      instance.addLayer({
        id: 'exterior-footprints-included-line',
        type: 'line',
        source: 'exterior-footprints',
        filter: ['in', ['get', 'csuid'], ['literal', includedFootprints]],
        paint: { 'line-color': '#0284c7', 'line-width': 2.5 },
      })
      instance.addLayer({
        id: 'exterior-footprints-selected-fill',
        type: 'fill',
        source: 'exterior-footprints',
        filter: ['==', ['get', 'csuid'], selectedFootprint],
        paint: { 'fill-color': '#e14b26', 'fill-opacity': 0.4 },
      })
      instance.addLayer({
        id: 'exterior-footprints-selected',
        type: 'line',
        source: 'exterior-footprints',
        filter: ['==', ['get', 'csuid'], selectedFootprint],
        paint: { 'line-color': '#e14b26', 'line-width': 4 },
      })
    }
  }
  /** Select the source footprint clicked on the map. @param event Map pointer event. @returns Nothing. */
  const click = (event: import('maplibre-gl').MapMouseEvent): void => {
    if (!instance.getLayer('exterior-footprints-fill')) return
    const feature = instance.queryRenderedFeatures(event.point, {
      layers: ['exterior-footprints-fill'],
    })[0]
    const id = feature?.properties?.csuid
    if (typeof id === 'string') onselect(id)
  }
  instance.on('style.load', render)
  instance.on('load', render)
  instance.on('click', click)
  untrack(render)
  return () => {
    instance.off('style.load', render)
    instance.off('load', render)
    instance.off('click', click)
  }
})
$effect(() => {
  // Read the selection even before layers exist, so subsequent clicks stay reactive.
  const selected = selectedFootprint
  const instance = map
  for (const layer of [
    'exterior-footprints-selected',
    'exterior-footprints-selected-fill',
  ]) {
    if (instance?.getLayer(layer))
      instance.setFilter(layer, ['==', ['get', 'csuid'], selected])
  }
})
$effect(() => {
  const included = includedFootprints
  const instance = map
  for (const layer of [
    'exterior-footprints-included-fill',
    'exterior-footprints-included-line',
  ]) {
    if (instance?.getLayer(layer))
      instance.setFilter(layer, ['in', ['get', 'csuid'], ['literal', included]])
  }
})
// Search and map selections share the same framing and highlight.
$effect(() => {
  const instance = map
  const feature = footprints.features.find(
    item => item.properties.csuid === selectedFootprint,
  )
  if (!instance || !feature) return
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  const points = polygons.flat(2)
  if (!points.length) return
  const west = Math.min(...points.map(point => point[0]))
  const east = Math.max(...points.map(point => point[0]))
  const south = Math.min(...points.map(point => point[1]))
  const north = Math.max(...points.map(point => point[1]))
  instance.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 70, maxZoom: 19, duration: 500 },
  )
})
</script>

<section
  class={`border-border relative min-h-80 overflow-hidden border ${className || 'h-80 rounded-lg'}`}
  aria-label="Building footprint map"
>
  <MapSurface
    bind:map
    {style}
    center={coordinates}
    zoom={17}
    attributionControl={false}
    class="h-full w-full"
  >
    <NavigationControl />
    <AttributionControl position="bottom-left" />
  </MapSurface>
  <div
    class="bg-panel text-foreground absolute top-2 left-2 rounded px-2 py-1 text-xs shadow"
  >
    <span class="inline-flex items-center gap-1.5"
      ><span class="size-2.5 rounded-full bg-sky-400"></span>Added</span
    >
    <span class="ml-3 inline-flex items-center gap-1.5"
      ><span class="size-2.5 rounded-full bg-orange-600"></span>Selected</span
    >
  </div>
</section>
