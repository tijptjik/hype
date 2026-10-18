// MAP
import { buildNamedProtomapsStyle } from './common'
// TYPES
import type {
  ExpressionSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Builds the Milque basemap for Breadline collection journeys.
 * @param options - Locale and label visibility preferences.
 * @returns A quiet light map with prominent subway entrances.
 * @remarks Volume colours and claim rings belong to operational overlays, not POIs.
 */
export const buildBreadlineLightStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildNamedProtomapsStyle('light', options)
  style.name = 'Breadline Light'
  style.metadata = { 'hype:style-variant': 'Breadline Light' }
  style.sprite = [
    {
      id: 'default',
      url: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    },
    { id: 'breadline', url: '/mapSprites/breadline-light/exit' },
  ]

  // Milque paper, peach and muted teal leave saturated marker states conspicuous.
  style.layers = style.layers
    .filter(layer => layer.id !== 'pois')
    .map(layer => {
      if (layer.type === 'fill') {
        const color =
          layer.id === 'water'
            ? '#d3e5e4'
            : layer.id === 'earth'
              ? '#f8f4ed'
              : layer.id === 'buildings'
                ? '#efddd0'
                : /park|green|landcover|zoo/.test(layer.id)
                  ? '#e2e9da'
                  : '#f8ece2'
        layer.paint = { ...layer.paint, 'fill-color': color }
      } else if (layer.type === 'line') {
        const color = layer.id.startsWith('water')
          ? '#b1cecf'
          : layer.id.includes('rail')
            ? '#90aaae'
            : layer.id.includes('casing')
              ? '#d5c8bc'
              : layer.id.includes('other')
                ? '#c7b9a6'
                : '#fffdfa'
        layer.paint = { ...layer.paint, 'line-color': color }
        // Bring pedestrian routes forward without highlighting other minor roads.
        if (layer.id.includes('other') && !layer.id.includes('casing')) {
          layer.paint['line-color'] = [
            'case',
            [
              'any',
              ['==', ['get', 'kind'], 'path'],
              [
                'in',
                ['get', 'kind_detail'],
                ['literal', ['footway', 'pedestrian', 'steps']],
              ],
            ],
            '#438c87',
            color,
          ]
        }
        if (layer.id.startsWith('boundaries'))
          layer.layout = { ...layer.layout, visibility: 'none' }
      } else if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        if (layer.id.startsWith('roads_labels_')) {
          // 750 / 1.5 = 500 px: increase repeat frequency by 50%.
          layer.layout = {
            ...layer.layout,
            'symbol-spacing': 500,
            'text-padding': 2,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          }
        }
        layer.paint = {
          ...layer.paint,
          'text-color': '#5d777b',
          'text-halo-color': '#fffdfa',
          'text-halo-width': 1.5,
        }
      }
      return layer
    })

  // Preserve actual OSM exit references until the vector tile pipeline emits them.
  style.sources['mtr-entrances'] = {
    type: 'geojson',
    data: '/mapData/mtr-entrances.geojson',
    attribution:
      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
  }

  // Keep exact entrance positions visible while full badges yield to collisions.
  if (!options.noLabels) {
    // The tile building polygons omit names; retain only interior points and names.
    style.sources['building-labels'] = {
      type: 'geojson',
      data: '/mapData/building-labels.geojson',
      attribution:
        '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
    }
    const landmarkName: ExpressionSpecification = [
      'coalesce',
      [
        'get',
        options.locale === 'zhHant'
          ? 'name:zh-Hant'
          : options.locale === 'zhHans'
            ? 'name:zh-Hans'
            : 'name:en',
      ],
      ['get', 'name'],
    ]
    style.layers.push(
      ...(['building', 'mall'] as const).map(
        (kind): SymbolLayerSpecification => ({
          id: `breadline-${kind}-names`,
          type: 'symbol',
          source: 'building-labels',
          minzoom: kind === 'mall' ? 15 : 17,
          filter: ['==', 'kind', kind],
          layout: {
            'text-field': landmarkName,
            'text-transform': kind === 'mall' ? 'uppercase' : 'none',
            'text-font': [kind === 'mall' ? 'Noto Sans Medium' : 'Noto Sans Regular'],
            'text-size': kind === 'mall' ? 12 : 10.5,
            'text-max-width': 9,
            'text-variable-anchor-offset':
              kind === 'mall'
                ? [
                    'center',
                    [0, 0],
                    'top',
                    [0, 2],
                    'bottom',
                    [0, -2],
                    'left',
                    [2, 0],
                    'right',
                    [-2, 0],
                    'top',
                    [0, 4],
                    'bottom',
                    [0, -4],
                    'left',
                    [4, 0],
                    'right',
                    [-4, 0],
                  ]
                : ['center', [0, 0], 'top', [0, 0.6], 'bottom', [0, -0.6]],
            'text-justify': 'auto',
            'text-padding': kind === 'mall' ? 5 : 3,
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': kind === 'mall' ? '#173f4a' : '#5d777b',
            'text-halo-color': '#fffdfa',
            'text-halo-width': 1.5,
          },
        }),
      ),
      {
        id: 'breadline-mtr-exit-points',
        type: 'circle',
        source: 'mtr-entrances',
        minzoom: 15,
        paint: {
          'circle-radius': 2.5,
          'circle-color': '#ac2e44',
          'circle-stroke-color': '#fffdfa',
          'circle-stroke-width': 1,
        },
      },
      {
        id: 'breadline-mtr-stations',
        type: 'symbol',
        source: 'hongkong-latest',
        'source-layer': 'pois',
        minzoom: 13,
        filter: ['==', 'kind', 'station'],
        layout: {
          'text-field': [
            'coalesce',
            [
              'get',
              options.locale === 'zhHant'
                ? 'name:zh-Hant'
                : options.locale === 'zhHans'
                  ? 'name:zh-Hans'
                  : 'name:en',
            ],
            ['get', 'name'],
            '',
          ],
          'text-font': ['Noto Sans Medium'],
          'text-size': 14,
          'text-padding': 8,
        },
        paint: {
          'text-color': '#173f4a',
          'text-halo-color': '#fffdfa',
          'text-halo-width': 2,
        },
      },
      {
        id: 'breadline-mtr-exits',
        type: 'symbol',
        source: 'mtr-entrances',
        minzoom: 15,
        filter: ['==', 'kind', 'subway_entrance'],
        layout: {
          'icon-image': 'breadline:mtr-exit',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 17, 1],
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 3,
          'icon-optional': false,
          // Prefer specific exits over concourse letters and unnumbered access points.
          'symbol-sort-key': [
            'case',
            ['>', ['length', ['coalesce', ['get', 'ref'], '']], 1],
            0,
            ['!=', ['coalesce', ['get', 'ref'], ''], ''],
            1,
            2,
          ],
          'text-field': ['coalesce', ['get', 'ref'], ['get', 'local_ref'], ''],
          'text-font': ['Noto Sans Medium'],
          'text-size': 13,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 1.25,
          'text-justify': 'auto',
          'text-padding': 3,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': false,
        },
        paint: {
          'text-color': '#173f4a',
          'text-halo-color': '#fffdfa',
          'text-halo-width': 2,
        },
      },
    )
  }
  // Try the usual road anchor first, then search along the line in both directions.
  // MapLibre places later layers first; MTR badges remain fixed obstacles, and
  // the placement controller enables alternatives only for names not yet visible.
  const streetLabels = style.layers.filter(
    (layer): layer is SymbolLayerSpecification =>
      layer.type === 'symbol' && layer.id.startsWith('roads_labels_'),
  )
  style.layers = style.layers.filter(layer => !layer.id.startsWith('roads_labels_'))
  const streetCandidates = [
    ...[-6, 6, -3, 3, 0].flatMap(offset =>
      streetLabels.map(layer => {
        const { 'symbol-spacing': _spacing, ...layout } = layer.layout ?? {}
        return {
          ...layer,
          id: `${layer.id}__shift_${offset}`,
          layout: {
            ...layout,
            'symbol-placement': 'line-center' as const,
            'text-offset': [offset, 0] as [number, number],
          },
        }
      }),
    ),
    ...streetLabels,
  ]
  const transitIndex = style.layers.findIndex(
    layer => layer.id === 'breadline-mtr-stations',
  )
  if (transitIndex !== -1) style.layers.splice(transitIndex, 0, ...streetCandidates)
  return style
}
