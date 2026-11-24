<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// MAP
import { LngLatBounds, type GeoJSONSource, type Map as LibreMap } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { AttributionControl, NavigationControl } from 'svelte-maplibre-gl'
// ICONS
import RotateLeftIcon from 'virtual:icons/proicons/arrow-counterclockwise'
import RotateRightIcon from 'virtual:icons/proicons/arrow-clockwise'
// COMPONENTS
import MapSurface from '#lib/bits/custom/map/MapSurface.svelte'
import {
  sessionModelLayer,
  type SessionMapBuilding,
} from '#lib/fieldResearch/modelMapLayer.js'
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

let { buildings }: { buildings: SessionMapBuilding[] } = $props()
const initialPitch = 60
const rotations = [
  { label: 'Rotate map left', icon: RotateLeftIcon, step: -30 },
  { label: 'Rotate map right', icon: RotateRightIcon, step: 30 },
] as const
const located = $derived(
  buildings.filter((b): b is SessionMapBuilding & { coordinates: [number, number] } =>
    Boolean(b.coordinates),
  ),
)
const count = $derived(located.filter(b => b.exteriorUrl).length)
let loaded = $state(0)
let failed = $state(0)
let map = $state.raw<LibreMap>()
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
  const points = located
  if (!instance || !points.length) return
  const bounds = new LngLatBounds()
  for (const b of points) bounds.extend(b.coordinates)
  // fitBounds emits move synchronously. Camera reads in those listeners must not retrigger the fit.
  untrack(() =>
    instance.fitBounds(bounds, {
      maxZoom: 18.5,
      padding: 85,
      pitch: initialPitch,
      bearing: instance.getBearing(),
      duration: 0,
    }),
  )
})

$effect(() => {
  const instance = map
  const points = located
  if (!instance || !points.length) return
  applyMapCanvasBackground(instance.getContainer(), style, instance)
  const mount = (): void => {
    if (!instance.getStyle()?.layers || instance.getLayer('session-exterior-models'))
      return
    loaded = 0
    failed = 0
    const labels: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: points.map(b => ({
        type: 'Feature',
        id: b.id,
        geometry: { type: 'Point', coordinates: b.coordinates },
        properties: { title: b.title, hasModel: Boolean(b.exteriorUrl) },
      })),
    }
    instance.addSource('session-buildings', { type: 'geojson', data: labels })
    instance.addLayer({
      id: 'session-unmodelled',
      type: 'circle',
      source: 'session-buildings',
      filter: ['==', ['get', 'hasModel'], false],
      paint: {
        'circle-radius': 5,
        'circle-color': '#777588',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#fff',
      },
    })
    instance.addLayer(
      sessionModelLayer(
        points,
        (visible, errors) => {
          loaded = visible
          failed = errors
        },
        (id, coordinates) => {
          const label = labels.features.find(feature => feature.id === id)
          if (!label) return
          label.geometry.coordinates = coordinates
          instance.getSource<GeoJSONSource>('session-buildings')?.setData(labels)
        },
      ),
    )
    instance.addLayer({
      id: 'session-model-labels',
      type: 'symbol',
      source: 'session-buildings',
      layout: {
        'text-field': ['get', 'title'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
      },
      paint: {
        'text-color': '#221d2a',
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      },
    })
  }
  instance.on('style.load', mount)
  instance.on('load', mount)
  if (instance.isStyleLoaded()) untrack(mount)
  return () => {
    instance.off('style.load', mount)
    instance.off('load', mount)
    for (const id of [
      'session-model-labels',
      'session-exterior-models',
      'session-unmodelled',
    ]) {
      if (instance.getLayer(id)) instance.removeLayer(id)
    }
    if (instance.getSource('session-buildings'))
      instance.removeSource('session-buildings')
  }
})
</script>

{#if located.length}
  <section aria-label="Session building map" class="relative min-h-0 flex-1">
    <MapSurface
      bind:map
      {style}
      center={located[0].coordinates}
      zoom={17}
      pitch={initialPitch}
      maxPitch={85}
      attributionControl={false}
      class="h-full w-full"
    >
      <NavigationControl visualizePitch />
      <AttributionControl position="bottom-left" />
    </MapSurface>
    <div
      class="border-border bg-panel absolute right-3 bottom-3 flex rounded-md border shadow"
    >
      {#each rotations as rotation (rotation.label)}
        <button
          type="button"
          aria-label={rotation.label}
          title={rotation.label}
          class="text-foreground hover:bg-raised grid size-11 place-items-center rounded-md"
          onclick={() => map?.setBearing(map.getBearing() + rotation.step)}
        >
          <rotation.icon class="size-5" aria-hidden="true" />
        </button>
      {/each}
    </div>
    <p
      role="status"
      class="bg-panel text-foreground absolute top-3 left-3 rounded-md px-3 py-2 text-xs shadow"
    >
      {loaded} of {count} exterior models{failed ? ' · ' + failed + ' unavailable' : ''}
      {#if buildings.length > located.length}
        · {buildings.length - located.length} without coordinates
      {/if}
    </p>
  </section>
{:else}
  <p class="text-muted-foreground p-6 text-sm">No building coordinates available.</p>
{/if}
