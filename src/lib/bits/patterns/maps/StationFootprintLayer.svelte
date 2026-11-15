<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { getLocale } from '#lib/i18n.js'
// DOMAIN
import { premisesLabel, premisesTypography } from '#lib/indoor/premisesLabels.js'
import { divisionHighlightColors } from '#lib/map/divisionHighlights.js'
import type { MapMarkerTheme } from '#lib/map/styles/catalog.js'
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  loadPremisesCatalogue,
  findPremises,
  findStation,
  premisesPath,
} from '#lib/indoor/registry.js'
import { bounds } from '#lib/indoor/model.js'
import type { Collection } from '#lib/indoor/model.js'
let {
  map,
  theme,
  showMtrStations = true,
}: { map: MapLibreMap; theme: MapMarkerTheme; showMtrStations?: boolean } = $props()
const locale = $derived(getLocale())
let available = $state<string[]>([])
let data = $state.raw<Collection | null>(null)
$effect(() => {
  const controller = new AbortController()
  void loadPremisesCatalogue(controller.signal)
    .then(maps => {
      data = {
        type: 'FeatureCollection',
        features: maps.flatMap(entry =>
          (entry.footprint?.features ?? []).map(feature => ({
            ...feature,
            properties: {
              ...feature.properties,
              stationCode: entry.code,
              indoorName: entry.name,
              indoorNameZh: entry.nameZh,
              isStation: entry.kind === 'station',
            },
          })),
        ),
      }
    })
    .catch(error => {
      if (!controller.signal.aborted) console.error(error)
    })
  return () => controller.abort()
})
$effect(() => {
  const activeLocale = locale
  const source = data
      ? {
          ...data,
          features: data.features
            .filter(
              feature =>
                showMtrStations || !findStation(String(feature.properties.stationCode)),
            )
            .map(feature => ({
              ...feature,
              properties: {
                ...feature.properties,
                indoorLabel: premisesLabel(
                  {
                    name: String(feature.properties.indoorName ?? ''),
                    nameZh: String(feature.properties.indoorNameZh ?? ''),
                  },
                  activeLocale,
                ),
              },
            })),
        }
      : null,
    colour = divisionHighlightColors[theme],
    target = map
  if (!source) return
  return untrack(() => {
    let rendering = false
    // Rasterize the supplied official SVG at its original aspect ratio for MapLibre.
    let disposed = false
    let logoReady = false
    const canvas = document.createElement('canvas')
    canvas.width = 50
    canvas.height = 40
    const ctx = canvas.getContext('2d')
    const logo = new Image()
    logo.onload = () => {
      if (disposed || !ctx) return
      ctx.drawImage(logo, 0, 0, canvas.width, canvas.height)
      logoReady = true
      render()
    }
    logo.src = '/brands/mtr.svg'
    /** Restore footprint layers after style changes. @returns Nothing. */
    const render = (): void => {
      if (rendering || !target.getStyle()) return
      rendering = true
      try {
        if (ctx && logoReady && !target.hasImage('hype-indoor-mtr'))
          target.addImage(
            'hype-indoor-mtr',
            ctx.getImageData(0, 0, canvas.width, canvas.height),
            {
              pixelRatio: 2,
            },
          )
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
            paint: {
              'fill-color': colour,
              'fill-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 17, 0.12],
            },
          })
        if (!target.getLayer('hype-station-footprint-line'))
          target.addLayer({
            id: 'hype-station-footprint-line',
            type: 'line',
            source: 'hype-station-footprint',
            minzoom: 16,
            paint: {
              'line-color': colour,
              'line-width': 2,
              'line-dasharray': [3, 2],
              'line-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 17, 1],
            },
          })
        const road = target
          .getStyle()
          .layers.find(layer => layer.id === 'roads_labels_major')
        const typography = premisesTypography(
          road?.type === 'symbol' ? road : undefined,
        )
        if (!target.getLayer('hype-station-footprint-label'))
          target.addLayer({
            id: 'hype-station-footprint-label',
            type: 'symbol',
            source: 'hype-station-footprint',
            minzoom: 16.5,
            layout: {
              ...typography.layout,
              'text-field': [
                'case',
                ['get', 'isStation'],
                [
                  'format',
                  ['image', 'hype-indoor-mtr'],
                  { 'vertical-align': 'center' },
                  ' ',
                  {},
                  ['get', 'indoorLabel'],
                  { 'vertical-align': 'center' },
                ],
                ['get', 'indoorLabel'],
              ],
              'text-max-width': 20,
              'text-anchor': 'bottom',
              'text-offset': [0, -1],
              'text-allow-overlap': false,
            },
            paint: {
              // Use the same ink and halo as major streets in the active theme.
              ...typography.paint,
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 16.5, 0, 17.25, 1],
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
      disposed = true
      logo.onload = null
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
      if (target.hasImage('hype-indoor-mtr')) target.removeImage('hype-indoor-mtr')
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
    >Open {premisesLabel(findPremises(code), locale)} indoor map</a
  >
{/each}
