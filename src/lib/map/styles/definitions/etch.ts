// TYPES
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

type EtchMode = 'dark' | 'light'

// Nullspace and Oblivion: fine violet footprints, rose route spines and mint coastlines.
const ETCH_PALETTES = {
  dark: {
    sea: '#000000',
    land: '#08070d',
    park: '#101a18',
    edge: '#7253ae',
    street: '#3e365b',
    artery: '#f04d7f',
    highway: '#f6b3cf',
    coast: '#76d9ad',
    text: '#e6d3ff',
    muted: '#c6b6d9',
    streetLabel: '#f7e7ef',
  },
  light: {
    sea: '#e6f0ed',
    land: '#f5f3fa',
    park: '#eef4ee',
    edge: '#b583ac',
    street: '#c3b5d7',
    artery: '#af245a',
    highway: '#5d46ae',
    coast: '#08776f',
    text: '#5d2854',
    muted: '#755375',
    streetLabel: '#422039',
  },
} as const

/**
 * Scales Etch's hairline transport network from city to street detail.
 * @param city - Stroke width at city zoom.
 * @param street - Stroke width at street zoom.
 * @returns A zoom interpolation for a line width.
 */
function lineWidth(city: number, street: number): ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    10,
    city * 0.25,
    14,
    city,
    18,
    street,
    21,
    street * 3,
  ]
}

/**
 * Builds Etch directly from the SaanSeoi vector schema, without generated basemap layers.
 * @param mode - Nullspace dark or Oblivion light treatment.
 * @param options - Locale and label visibility preferences.
 * @returns An independent, POI-free cadastral map style.
 * @remarks Keeps the selected art direction's road geometry, sparse labels and fine footprints.
 */
export function buildEtchStyle(
  mode: EtchMode,
  { noLabels = false, locale = 'en' }: StyleBuildOptions = {},
): StyleSpecification {
  const p = ETCH_PALETTES[mode]
  const source = 'hongkong-latest'
  // Quiet land and gardens leave the footprints and transport network in the foreground.
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.sea } },
    {
      id: 'earth',
      type: 'fill',
      source,
      'source-layer': 'earth',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': p.land },
    },
    {
      id: 'gardens',
      type: 'fill',
      source,
      'source-layer': 'landuse',
      filter: [
        'in',
        ['get', 'kind'],
        [
          'literal',
          [
            'park',
            'forest',
            'wood',
            'nature_reserve',
            'national_park',
            'garden',
            'golf_course',
          ],
        ],
      ],
      paint: { 'fill-color': p.park, 'fill-opacity': 0.55 },
    },
    {
      id: 'water',
      type: 'fill',
      source,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': p.sea },
    },
    {
      id: 'coast',
      type: 'line',
      source,
      'source-layer': 'water',
      filter: ['==', ['get', 'kind'], 'coastline'],
      paint: {
        'line-color': p.coast,
        'line-width': lineWidth(0.6, 1),
        'line-opacity': 0.85,
      },
    },
    {
      id: 'footprints',
      type: 'line',
      source,
      'source-layer': 'buildings',
      minzoom: 14,
      // Fine at city scale, then smoothly strengthen individual footprints as buildings spread out.
      paint: {
        'line-color': p.edge,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0.45,
          16,
          0.65,
          18,
          1,
          20,
          1.5,
          22,
          2,
        ],
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          14,
          0.55,
          17,
          0.8,
          20,
          0.95,
        ],
      },
    },
  ]
  // Preserve the approved four-class road hierarchy with no fills, casings or glow.
  const roads = [
    { kind: 'other', color: p.street, city: 0.2, detail: 1, minzoom: 16, opacity: 0.4 },
    {
      kind: 'minor_road',
      color: p.street,
      city: 0.4,
      detail: 1.2,
      minzoom: 13,
      opacity: 1,
    },
    {
      kind: 'major_road',
      color: p.artery,
      city: 1,
      detail: 2.2,
      minzoom: 7,
      opacity: 1,
    },
    {
      kind: 'highway',
      color: p.highway,
      city: 1.5,
      detail: 3.2,
      minzoom: 7,
      opacity: 1,
    },
  ] as const
  for (const road of roads)
    layers.push({
      id: `route-${road.kind}`,
      type: 'line',
      source,
      'source-layer': 'roads',
      filter: [
        'all',
        ['==', ['get', 'kind'], road.kind],
        ['==', ['geometry-type'], 'LineString'],
      ],
      minzoom: road.minzoom,
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': road.color,
        'line-width': lineWidth(road.city, road.detail),
        'line-opacity': road.opacity,
        'line-blur': 0,
      },
    })
  layers.push({
    id: 'rail',
    type: 'line',
    source,
    'source-layer': 'roads',
    minzoom: 13,
    filter: ['==', ['get', 'kind'], 'rail'],
    paint: {
      'line-color': p.coast,
      'line-width': lineWidth(0.5, 1.6),
      'line-dasharray': [1, 4],
      'line-opacity': 0.5,
    },
  })
  // Keep streets prominent and reveal building detail only at high zoom; POIs stay omitted.
  if (!noLabels) {
    const english: ExpressionSpecification = [
      'coalesce',
      ['get', 'name:en'],
      ['get', 'name_en'],
      ['get', 'name2'],
      ['get', 'name'],
    ]
    const text: ExpressionSpecification =
      locale === 'en'
        ? english
        : ['coalesce', ['get', 'name'], ['get', 'pgf:name'], english]
    layers.push({
      id: 'districts',
      type: 'symbol',
      source,
      'source-layer': 'places',
      minzoom: 9,
      maxzoom: 16,
      filter: [
        'in',
        ['get', 'kind'],
        ['literal', ['locality', 'neighbourhood', 'macrohood']],
      ],
      layout: {
        'text-field': text,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 13, 15, 16],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.18,
        'text-max-width': 8,
        'text-padding': 25,
      },
      paint: {
        'text-color': p.text,
        'text-halo-color': p.land,
        'text-halo-width': 0.7,
        'text-halo-blur': 0,
      },
    })
    layers.push({
      id: 'streets',
      type: 'symbol',
      source,
      'source-layer': 'roads',
      minzoom: 16,
      filter: ['in', ['get', 'kind'], ['literal', ['major_road', 'minor_road']]],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 900,
        'text-field': text,
        'text-font': ['Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11.5, 19, 13],
        'text-letter-spacing': 0.08,
        'text-max-angle': 25,
        'text-padding': 8,
      },
      paint: {
        'text-color': p.streetLabel,
        'text-halo-color': p.land,
        'text-halo-width': 1.4,
        'text-halo-blur': 0,
      },
    })
    // Named building polygons are absent from the tiles; reuse the shared interior-point dataset.
    const buildingName: ExpressionSpecification = [
      'coalesce',
      [
        'get',
        locale === 'zhHant'
          ? 'name:zh-Hant'
          : locale === 'zhHans'
            ? 'name:zh-Hans'
            : 'name:en',
      ],
      ['get', 'name'],
    ]
    layers.push({
      id: 'building-names',
      type: 'symbol',
      source: 'building-labels',
      minzoom: 18,
      filter: ['in', ['get', 'kind'], ['literal', ['building', 'mall']]],
      layout: {
        'text-field': buildingName,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 18, 11, 20, 12.5],
        'text-max-width': 9,
        'text-padding': 4,
        'text-variable-anchor': ['center', 'top', 'bottom'],
        'text-radial-offset': 0.4,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': p.muted,
        'text-halo-color': p.land,
        'text-halo-width': 1.2,
      },
    })
    layers.push({
      id: 'building-numbers',
      type: 'symbol',
      source,
      'source-layer': 'buildings',
      minzoom: 19,
      filter: ['==', ['get', 'kind'], 'address'],
      layout: {
        'text-field': [
          'coalesce',
          ['get', 'addr_housenumber'],
          ['get', 'addr:housenumber'],
        ],
        'text-font': ['Noto Sans Medium'],
        'text-size': 12,
        'text-padding': 3,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': p.streetLabel,
        'text-halo-color': p.land,
        'text-halo-width': 1.2,
      },
    })
  }
  return {
    version: 8,
    name: mode === 'dark' ? 'Hyper Dark' : 'Hyper Light',
    metadata: {
      'hype:style-variant': 'Etch',
      'hype:theme': mode === 'dark' ? 'hype-black' : 'hype-light',
    },
    sources: {
      ...(!noLabels
        ? {
            'building-labels': {
              type: 'geojson' as const,
              data: '/mapData/building-labels.geojson',
              attribution:
                '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
            },
          }
        : {}),
      [source]: {
        type: 'vector',
        url: 'https://tiles.saanseoi.hk/hongkong-latest.json',
      },
    },
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    layers,
  }
}
