// MAP
import { buildNamedProtomapsStyle } from './common'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
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
        if (layer.id.startsWith('boundaries'))
          layer.layout = { ...layer.layout, visibility: 'none' }
      } else if (layer.type === 'symbol' && layer.layout?.['text-field']) {
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

  // Keep both the MTR logo and its exit reference visible in dense station clusters.
  if (!options.noLabels) {
    style.layers.push(
      {
        id: 'breadline-mtr-exits',
        type: 'symbol',
        source: 'mtr-entrances',
        minzoom: 15,
        filter: ['==', 'kind', 'subway_entrance'],
        layout: {
          'icon-image': 'breadline:mtr-exit',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 17, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['coalesce', ['get', 'ref'], ['get', 'local_ref'], ''],
          'text-font': ['Noto Sans Medium'],
          'text-size': 13,
          'text-anchor': 'top',
          'text-offset': [0, 1.1],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#173f4a',
          'text-halo-color': '#fffdfa',
          'text-halo-width': 2,
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
    )
  }
  return style
}
