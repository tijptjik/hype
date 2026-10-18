// MAP
import { buildBreadlineLightStyle } from './breadlineLight'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Builds the dark Breadline palette while preserving transit entrance symbols.
 * @param options - Label visibility and locale preferences.
 * @returns A dark teal map with warm labels and clear transit entrances.
 */
export function buildBreadlineDarkStyle(
  options: StyleBuildOptions = {},
): StyleSpecification {
  const style = buildBreadlineLightStyle(options)
  style.name = 'Breadline Dark'
  style.metadata = { 'hype:style-variant': 'Breadline Dark' }
  // Recolour the light counterpart by layer role, retaining its filters and layout.
  style.layers = style.layers.map(layer => {
    if (layer.type === 'background')
      return { ...layer, paint: { ...layer.paint, 'background-color': '#12252e' } }
    if (layer.type === 'fill')
      return {
        ...layer,
        paint: {
          ...layer.paint,
          'fill-color':
            layer.id === 'water'
              ? '#12252e'
              : layer.id === 'buildings'
                ? '#28505b'
                : /park|green|landcover|zoo/.test(layer.id)
                  ? '#24473f'
                  : '#173542',
        },
      }
    if (layer.type === 'line')
      return {
        ...layer,
        paint: {
          ...layer.paint,
          'line-color': layer.id.startsWith('water')
            ? '#315e69'
            : layer.id.includes('rail')
              ? '#ff9275'
              : layer.id.includes('casing')
                ? '#12252e'
                : '#47717a',
        },
      }
    if (layer.type === 'symbol' && layer.layout?.['text-field'])
      return {
        ...layer,
        paint: {
          ...layer.paint,
          'text-color': '#f8f1e7',
          'text-halo-color': '#12252e',
        },
      }
    return layer
  })
  return style
}
