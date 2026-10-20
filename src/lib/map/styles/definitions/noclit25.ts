// MAP
import { buildNoclit26Style } from './noclit26'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Adapts the quiet NocLit map to the 2025 navy, blue and orange poster.
 * @param options - Locale and label visibility preferences.
 * @returns A minimal walking map with orange streets and white labels.
 * @remarks Inherits the 2026 geography and label density without extra POIs.
 */
export const buildNoclit25Style = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildNoclit26Style(options)
  style.name = "NocLit'25"
  style.metadata = { 'hype:style-variant': "NocLit'25" }
  // Preserve the base layout while replacing its paints with the poster palette.
  for (const layer of style.layers) {
    if (layer.type === 'background') {
      layer.paint = { ...layer.paint, 'background-color': '#29325b' }
    } else if (layer.type === 'fill') {
      layer.paint = {
        ...layer.paint,
        'fill-color': layer.id === 'water' ? '#29325b' : '#354477',
      }
    } else if (layer.type === 'line') {
      layer.paint = { ...layer.paint, 'line-color': '#f37021' }
    } else if (layer.type === 'symbol') {
      layer.paint = {
        ...layer.paint,
        'text-color': '#ffffff',
        'text-halo-color': '#29325b',
      }
    }
  }
  return style
}
