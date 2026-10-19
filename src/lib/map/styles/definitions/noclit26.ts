// MAP
import { buildNamedProtomapsStyle } from './common'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Builds the quiet literature-night map from the NocLit poster palette.
 * @param options - Locale and label visibility preferences.
 * @returns Flat red city blocks, black streets and lighter charcoal water.
 * @remarks Building detail, ordinary POIs and transport decoration are omitted to foreground venues.
 */
export const buildNoclit26Style = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildNamedProtomapsStyle('dark', options)
  style.name = "NocLit'26"
  style.metadata = { 'hype:style-variant': "NocLit'26" }
  // Retain only the geography needed to orient a walking audience: flat land and streets.
  const retainedLayers = new Set([
    'background',
    'earth',
    'water',
    'roads_minor',
    'roads_major',
    'roads_highway',
    'roads_bridges_minor',
    'roads_bridges_major',
    'roads_bridges_highway',
    'roads_labels_major',
  ])
  style.layers = style.layers
    .filter(layer => retainedLayers.has(layer.id))
    .map(layer => {
      if (layer.type === 'background') {
        layer.paint = { 'background-color': '#3b3b3b' }
      } else if (layer.type === 'fill') {
        layer.paint = {
          'fill-color': layer.id === 'water' ? '#3b3b3b' : '#b93826',
          'fill-opacity': 1,
        }
      } else if (layer.type === 'line') {
        // Black streets cut through a single red city silhouette; no casings or fine paths.
        layer.paint = {
          'line-color': '#272727',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 3, 20, 12],
        }
      } else if (layer.type === 'symbol') {
        if (options.noLabels) return layer
        layer.minzoom = 16
        layer.layout = {
          ...layer.layout,
          'text-size': 11,
          'symbol-spacing': 1000,
          'text-padding': 24,
          'text-allow-overlap': false,
        }
        layer.paint = {
          'text-color': '#f5f1ec',
          'text-halo-color': '#272727',
          'text-halo-width': 1,
        }
      }
      return layer
    })
  return style
}
