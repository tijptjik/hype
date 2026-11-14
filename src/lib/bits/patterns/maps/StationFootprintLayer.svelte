<script lang="ts">
import { untrack } from 'svelte'
import { divisionHighlightColors } from '#lib/map/divisionHighlights.js'
import type { MapMarkerTheme } from '#lib/map/styles/catalog.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { indoorSnapshots, findStation, premisesPath } from '#lib/indoor/registry.js'
import { bounds } from '#lib/indoor/model.js'
import type { Collection } from '#lib/indoor/model.js'
let { map, theme }: { map: MapLibreMap; theme: MapMarkerTheme } = $props()
let available = $state<string[]>([])
let data = $state.raw<Collection | null>(null)
$effect(() => {
  const controller = new AbortController()
  void Promise.all(
    Object.entries(indoorSnapshots).map(async ([code, base]) => {
      const response = await fetch(`${base}/venue_polygon.json`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Station outline unavailable')
      const collection: Collection = await response.json()
      return collection.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          stationCode: code,
          indoorLabel: `${findStation(code)?.name} · Indoor map ↗`,
        },
      }))
    }),
  )
    .then(features => {
      data = { type: 'FeatureCollection', features: features.flat() }
    })
    .catch(error => {
      if (!controller.signal.aborted) console.error(error)
    })
  return () => controller.abort()
})
$effect(() => {
  const source = data,
    colour = divisionHighlightColors[theme],
    target = map
  if (!source) return
  return untrack(() => {
    let rendering = false
    const render = () => {
      if (rendering || !target.getStyle()) return
      rendering = true
      try {
        if (!target.getSource('hype-station-footprint'))
          target.addSource('hype-station-footprint', {
            type: 'geojson',
            data: JSON.parse(JSON.stringify(source)),
          })
        if (!target.getLayer('hype-station-footprint-fill'))
          target.addLayer({
            id: 'hype-station-footprint-fill',
            type: 'fill',
            source: 'hype-station-footprint',
            minzoom: 16,
            paint: { 'fill-color': colour, 'fill-opacity': 0.12 },
          })
        if (!target.getLayer('hype-station-footprint-line'))
          target.addLayer({
            id: 'hype-station-footprint-line',
            type: 'line',
            source: 'hype-station-footprint',
            minzoom: 16,
            paint: { 'line-color': colour, 'line-width': 2, 'line-dasharray': [3, 2] },
          })
        if (!target.getLayer('hype-station-footprint-label'))
          target.addLayer({
            id: 'hype-station-footprint-label',
            type: 'symbol',
            source: 'hype-station-footprint',
            minzoom: 16.5,
            layout: {
              'text-field': ['get', 'indoorLabel'],
              'text-size': 15,
              'text-anchor': 'bottom',
              'text-offset': [0, -1],
              'text-allow-overlap': false,
            },
            paint: {
              // Neutral ink and paper keep labels readable on every basemap palette.
              'text-color': '#263d49',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
              'text-halo-blur': 0,
            },
          })
      } catch (error) {
        // Style metadata can arrive before it accepts sources; retry on styledata.
        if (
          !(error instanceof Error) ||
          !error.message.includes('Style is not done loading')
        )
          console.error('Station outline rendering failed', error)
      } finally {
        rendering = false
      }
    }
    const enter = () => {
      target.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      target.getCanvas().style.cursor = ''
    }
    const updateAvailability = () => {
      available =
        target.getZoom() < 16
          ? []
          : source.features
              .filter(feature => {
                const b = bounds(feature)
                return target.getBounds().intersects([
                  [b[0], b[1]],
                  [b[2], b[3]],
                ])
              })
              .map(feature => String(feature.properties.stationCode))
    }
    target.on('style.load', render)
    target.on('styledata', render)
    target.on('idle', render)
    target.on('moveend', updateAvailability)
    updateAvailability()
    target.on('mouseenter', 'hype-station-footprint-fill', enter)
    target.on('mouseleave', 'hype-station-footprint-fill', leave)
    render()
    return () => {
      target.off('style.load', render)
      target.off('styledata', render)
      target.off('idle', render)
      target.off('moveend', updateAvailability)
      target.off('mouseenter', 'hype-station-footprint-fill', enter)
      target.off('mouseleave', 'hype-station-footprint-fill', leave)
      for (const id of [
        'hype-station-footprint-label',
        'hype-station-footprint-line',
        'hype-station-footprint-fill',
      ])
        if (target.getLayer(id)) target.removeLayer(id)
      if (target.getSource('hype-station-footprint'))
        target.removeSource('hype-station-footprint')
    }
  })
})
</script>

{#each available as code (code)}
  <a
    href={premisesPath(code)}
    class="focus:bg-panel focus:text-primary sr-only focus:not-sr-only focus:absolute focus:right-4 focus:bottom-12 focus:z-50 focus:rounded-lg focus:p-3"
    >Open {findStation(code)?.name} indoor map</a
  >
{/each}
