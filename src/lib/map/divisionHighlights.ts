// TYPES
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl'
import type { MapMarkerTheme } from '#lib/map/styles/catalog.js'
import type { DivisionGeometry } from '#lib/divisions/geometry.js'

/** Contrasting overlay accents follow the basemap palette, independently of the UI theme. */
export const divisionHighlightColors: Record<MapMarkerTheme, string> = {
  light: '#9d174d',
  dark: '#fde047',
  ghostery: '#5eead4',
  hyperpop: '#67e8f9',
  neon: '#fef08a',
  rosepunk: '#bef264',
}

const sourceId = 'hype-division-highlights'
const fillId = `${sourceId}-fill`
const outlineId = `${sourceId}-outline`

/**
 * Owns the division overlay for one native renderer, including style reloads.
 * @param map Renderer-owned MapLibre instance.
 * @returns Update and teardown operations; no payload cache or map ownership escapes.
 */
export function createDivisionHighlights(map: MapLibreMap): {
  update: (
    divisions: DivisionGeometry[],
    hoveredId: string | null,
    theme?: MapMarkerTheme,
  ) => void
  destroy: () => void
} {
  let data: FeatureCollection<Polygon | MultiPolygon> = {
    type: 'FeatureCollection',
    features: [],
  }
  let color = divisionHighlightColors.dark
  let disposed = false
  let dirty = true
  /** Restores layers after a style replacement. @returns Nothing. */
  const render = (): void => {
    if (disposed || !dirty || !map.isStyleLoaded()) return
    dirty = false
    if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'geojson', data })
    else (map.getSource(sourceId) as GeoJSONSource).setData(data)
    // Place territory beneath labels while retaining its outline above the fill.
    const before = map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id
    if (!map.getLayer(fillId))
      map.scope.addLayer(
        {
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': color,
            'fill-opacity': ['case', ['get', 'hovered'], 0.24, 0.12],
          },
        },
        before,
      )
    if (!map.getLayer(outlineId))
      map.scope.addLayer(
        {
          id: outlineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': color,
            'line-width': ['case', ['get', 'hovered'], 3, 2],
            'line-opacity': 0.9,
          },
        },
        before,
      )
    map.setPaintProperty(fillId, 'fill-color', color)
    map.setPaintProperty(outlineId, 'line-color', color)
  }
  const restore = (): void => {
    dirty = true
    render()
  }
  map.on('style.load', restore)
  // Source loading can temporarily make a style unready; render the latest update once idle.
  map.on('idle', render)
  return {
    update(divisions, hoveredId, theme = 'dark') {
      color = divisionHighlightColors[theme]
      dirty = true
      data = {
        type: 'FeatureCollection',
        features: divisions.flatMap(division =>
          division.geometries.map((geometry, index) => ({
            type: 'Feature' as const,
            id: `${division.id}:${index}`,
            properties: { divisionId: division.id, hovered: division.id === hoveredId },
            geometry,
          })),
        ),
      }
      render()
    },
    destroy() {
      disposed = true
      map.off('style.load', restore)
      map.off('idle', render)
      for (const id of [outlineId, fillId])
        if (map.getLayer(id)) map.scope.removeLayer(id)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    },
  }
}
