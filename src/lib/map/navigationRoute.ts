// MAP
import { divisionHighlightColors } from './divisionHighlights.js'
// TYPES
import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapMarkerTheme } from './styles/catalog.js'

const sourceId = 'hype-navigation-route'
const haloId = `${sourceId}-halo`
const lineId = `${sourceId}-line`
const endpointsId = `${sourceId}-endpoints`
const highlightId = `${sourceId}-highlight`
const highlightLayers = [
  `${highlightId}-halo`,
  `${highlightId}-line`,
  `${highlightId}-point`,
] as const

/**
 * Owns route geometry and layers inside one renderer, including basemap replacements.
 * @param map - Native map owned by MapCanvas.
 * @returns Route update and teardown capabilities without exposing the map.
 */
export function createNavigationRoute(map: MapLibreMap): {
  update: (geometry: MultiLineString, theme: MapMarkerTheme) => void
  highlight: (geometry: LineString | Point | null) => void
  destroy: () => void
} {
  let data: FeatureCollection<MultiLineString | Point> = {
    type: 'FeatureCollection',
    features: [],
  }
  let color = divisionHighlightColors.dark
  let halo = '#101827'
  let dirty = false
  let disposed = false
  let highlightDirty = false
  let selected: FeatureCollection<LineString | Point> = {
    type: 'FeatureCollection',
    features: [],
  }

  /** Restores the selected step independently of full-route data and camera state. @returns Nothing. */
  function renderHighlight(): void {
    if (disposed || !highlightDirty || !map.isStyleLoaded()) return
    highlightDirty = false
    if (!map.getSource(highlightId))
      map.addSource(highlightId, { type: 'geojson', data: selected })
    else (map.getSource(highlightId) as GeoJSONSource).setData(selected)
    // Amber with a dark casing remains distinct from every route palette.
    for (const [id, width, lineColor] of [
      [highlightLayers[0], 14, '#101827'],
      [highlightLayers[1], 9, '#fbbf24'],
    ] as const) {
      if (!map.getLayer(id))
        map.addLayer({
          id,
          type: 'line',
          source: highlightId,
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': lineColor, 'line-width': width },
        })
    }
    if (!map.getLayer(highlightLayers[2]))
      map.addLayer({
        id: highlightLayers[2],
        type: 'circle',
        source: highlightId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': '#fbbf24',
          'circle-radius': 9,
          'circle-stroke-color': '#101827',
          'circle-stroke-width': 3,
        },
      })
  }

  /** Restores the latest route once the style is ready. @returns Nothing. */
  function render(): void {
    if (disposed || !map.isStyleLoaded()) return
    if (!dirty) {
      renderHighlight()
      return
    }
    dirty = false
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'geojson', data })
    else (map.getSource(sourceId) as GeoJSONSource).setData(data)
    // A contrasting casing keeps the route legible on both bright and dark basemaps.
    const before = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id
    for (const [id, width, lineColor] of [
      [haloId, 10, halo],
      [lineId, 6, color],
    ] as const) {
      if (!map.getLayer(id))
        map.addLayer(
          {
            id,
            type: 'line',
            source: sourceId,
            filter: ['==', ['get', 'kind'], 'route'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': lineColor,
              'line-width': width,
              'line-opacity': 0.95,
            },
          },
          before,
        )
      map.setPaintProperty(id, 'line-color', lineColor)
    }
    if (!map.getLayer(endpointsId))
      map.addLayer({
        id: endpointsId,
        type: 'circle',
        source: sourceId,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 7, 'circle-stroke-width': 3 },
      })
    map.setPaintProperty(endpointsId, 'circle-color', [
      'case',
      ['==', ['get', 'kind'], 'origin'],
      color,
      halo,
    ])
    map.setPaintProperty(endpointsId, 'circle-stroke-color', color)
    renderHighlight()
  }

  /** Marks cached route data dirty after a basemap replacement. @returns Nothing. */
  function restore(): void {
    dirty = true
    highlightDirty = true
    render()
  }
  map.on('style.load', restore)
  map.on('idle', render)
  return {
    update(geometry, theme) {
      color = divisionHighlightColors[theme]
      halo = theme === 'light' ? '#ffffff' : '#101827'
      const first = geometry.coordinates[0][0]
      const lastLeg = geometry.coordinates[geometry.coordinates.length - 1]
      const last = lastLeg[lastLeg.length - 1]
      data = {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { kind: 'route' }, geometry },
          {
            type: 'Feature',
            properties: { kind: 'origin' },
            geometry: { type: 'Point', coordinates: first },
          },
          {
            type: 'Feature',
            properties: { kind: 'destination' },
            geometry: { type: 'Point', coordinates: last },
          },
        ],
      }
      dirty = true
      render()
    },
    highlight(geometry) {
      selected = {
        type: 'FeatureCollection',
        features: geometry ? [{ type: 'Feature', properties: {}, geometry }] : [],
      }
      highlightDirty = true
      render()
    },
    destroy() {
      disposed = true
      map.off('style.load', restore)
      map.off('idle', render)
      for (const id of [
        ...highlightLayers.slice().reverse(),
        endpointsId,
        lineId,
        haloId,
      ])
        if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(highlightId)) map.removeSource(highlightId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    },
  }
}
