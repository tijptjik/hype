// TYPES
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'

export type Direction = 'velvet' | 'petal' | 'etch' | 'prism'
export type Mode = 'dark' | 'light'
type Palette = {
  sea: string
  land: string
  park: string
  building: string
  edge: string
  street: string
  artery: string
  highway: string
  coast: string
  text: string
  muted: string
}

/** Art directions authored directly against SaanSeoi's vector schema. */
export const DIRECTIONS = {
  velvet: {
    name: 'Velvet',
    description:
      'Luminous ribbons on a near-black plum city; Oblivion becomes a soft rose-and-lilac print. Sparse blocks, blurred arterial light and warm typography.',
    dark: {
      sea: '#000000',
      land: '#150d1b',
      park: '#13241f',
      building: '#291b31',
      edge: '#51314d',
      street: '#73546d',
      artery: '#f04d7f',
      highway: '#dba4ff',
      coast: '#8659e8',
      text: '#f7e7ef',
      muted: '#caaccc',
    },
    light: {
      sea: '#eee3f7',
      land: '#fff9fc',
      park: '#dbefe6',
      building: '#efdae8',
      edge: '#d5b6d0',
      street: '#c99bb9',
      artery: '#af245a',
      highway: '#7450b6',
      coast: '#b99ad9',
      text: '#44213c',
      muted: '#936581',
    },
  },
  petal: {
    name: 'Petal',
    description:
      'A graphic colour-block atlas. Rose city, mint gardens, lilac harbour and wide paper-cut streets. Dark mode turns the blocks into wine and orchid.',
    dark: {
      sea: '#070609',
      land: '#31192c',
      park: '#1f4840',
      building: '#62354f',
      edge: '#8c4b70',
      street: '#bd819c',
      artery: '#f7bed2',
      highway: '#f04d7f',
      coast: '#8659e8',
      text: '#ffe5ee',
      muted: '#e3a1bc',
    },
    light: {
      sea: '#e1d5f3',
      land: '#f7dce8',
      park: '#a4d9c7',
      building: '#e9afcb',
      edge: '#ca7fa5',
      street: '#fff9fc',
      artery: '#fff9fc',
      highway: '#af245a',
      coast: '#9b79c3',
      text: '#631f49',
      muted: '#965c7e',
    },
  },
  etch: {
    name: 'Etch',
    description:
      'A luminous cadastral drawing. Empty land, razor-thin violet footprints, rose route spines and mint coastlines. Oblivion is a crisp berry engraving on lilac paper.',
    dark: {
      sea: '#000000',
      land: '#08070d',
      park: '#101a18',
      building: '#08070d',
      edge: '#7253ae',
      street: '#3e365b',
      artery: '#f04d7f',
      highway: '#f6b3cf',
      coast: '#76d9ad',
      text: '#e6d3ff',
      muted: '#b09cc8',
    },
    light: {
      sea: '#e6f0ed',
      land: '#f5f3fa',
      park: '#eef4ee',
      building: '#f5f3fa',
      edge: '#b583ac',
      street: '#c3b5d7',
      artery: '#af245a',
      highway: '#5d46ae',
      coast: '#08776f',
      text: '#5d2854',
      muted: '#836584',
    },
  },
  prism: {
    name: 'Prism',
    description:
      'A saturated poster map. Electric violet streets and hot rose highways cut through chunky plum blocks, with a vivid mint harbour. Oblivion keeps the same confident geometry in berry and teal.',
    dark: {
      sea: '#083c37',
      land: '#100b22',
      park: '#17483b',
      building: '#302048',
      edge: '#614078',
      street: '#8659e8',
      artery: '#be90ff',
      highway: '#f04d7f',
      coast: '#76d9ad',
      text: '#fff0f7',
      muted: '#d4b9ef',
    },
    light: {
      sea: '#98d2c8',
      land: '#faf1fc',
      park: '#c2e5ca',
      building: '#e1c2ed',
      edge: '#bc91cd',
      street: '#aa81c6',
      artery: '#7250aa',
      highway: '#af245a',
      coast: '#08776f',
      text: '#48205c',
      muted: '#79568c',
    },
  },
} as const satisfies Record<
  Direction,
  { name: string; description: string; dark: Palette; light: Palette }
>

/**
 * Produces zoom-driven line widths for one hand-drawn transport hierarchy.
 * @param city - Width at city scale.
 * @param street - Width at street scale.
 * @returns MapLibre zoom interpolation.
 */
function width(city: number, street: number): ExpressionSpecification {
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
 * Builds an original art direction without importing any generated basemap layers.
 * @param direction - Composition, transport treatment and typography to render.
 * @param mode - Nullspace or Oblivion companion palette.
 * @returns A standalone POI-free map specification.
 * @remarks Only vector data and font assets are shared with the application.
 */
export function buildDirection(direction: Direction, mode: Mode): StyleSpecification {
  const p: Palette = DIRECTIONS[direction][mode]
  const glow = direction === 'velvet'
  const block = direction === 'petal'
  const etched = direction === 'etch'
  const poster = direction === 'prism'
  const source = 'hongkong-latest'
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.sea } },
    {
      id: 'land',
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
      paint: { 'fill-color': p.park, 'fill-opacity': etched ? 0.55 : 1 },
    },
    {
      id: 'water',
      type: 'fill',
      source,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': p.sea },
    },
  ]
  // A wide coastline wash and a finer edge give the islands an intentional silhouette.
  if (glow || poster)
    layers.push({
      id: 'coast-wash',
      type: 'line',
      source,
      'source-layer': 'water',
      filter: ['==', ['get', 'kind'], 'coastline'],
      paint: {
        'line-color': p.coast,
        'line-width': width(5, 12),
        'line-blur': glow ? 4 : 1.5,
        'line-opacity': glow ? 0.25 : 0.18,
      },
    })
  layers.push({
    id: 'coast',
    type: 'line',
    source,
    'source-layer': 'water',
    filter: ['==', ['get', 'kind'], 'coastline'],
    paint: {
      'line-color': p.coast,
      'line-width': width(etched ? 0.6 : 1.2, etched ? 1 : 2),
      'line-opacity': etched ? 0.85 : 0.65,
    },
  })
  // Footprints carry the visual identity: solid blocks, soft silhouettes or fine engraving.
  if (!etched)
    layers.push({
      id: 'blocks',
      type: 'fill',
      source,
      'source-layer': 'buildings',
      minzoom: glow ? 15 : 13,
      paint: {
        'fill-color': p.building,
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13,
          block ? 0.5 : 0.15,
          16,
          block || poster ? 1 : 0.65,
        ],
      },
    })
  if (etched || poster)
    layers.push({
      id: 'footprints',
      type: 'line',
      source,
      'source-layer': 'buildings',
      minzoom: etched ? 14 : 16,
      paint: {
        'line-color': p.edge,
        'line-width': etched ? 0.65 : 0.8,
        'line-opacity': etched ? 0.8 : 0.55,
      },
    })
  // Each road class is authored once, with dedicated casing/glow rather than stock layer recipes.
  for (const [index, kind] of [
    'other',
    'minor_road',
    'major_road',
    'highway',
  ].entries()) {
    const major = index >= 2
    const color = index === 3 ? p.highway : index === 2 ? p.artery : p.street
    const city = [
      0.2,
      etched ? 0.4 : glow ? 0.7 : 1.1,
      etched ? 1 : poster ? 2.6 : block ? 3.2 : 1.8,
      etched ? 1.5 : poster ? 4.5 : block ? 5 : 2.8,
    ][index]
    const detail = [
      1,
      etched ? 1.2 : poster ? 5 : block ? 6 : 2.5,
      etched ? 2.2 : poster ? 10 : block ? 13 : 6,
      etched ? 3.2 : poster ? 14 : block ? 18 : 9,
    ][index]
    const minzoom = index === 0 ? 16 : index === 1 ? 13 : 7
    const filter: ExpressionSpecification = [
      'all',
      ['==', ['get', 'kind'], kind],
      ['==', ['geometry-type'], 'LineString'],
    ]
    if (glow && major)
      layers.push({
        id: `route-${kind}-glow`,
        type: 'line',
        source,
        'source-layer': 'roads',
        filter,
        minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': color,
          'line-width': width(city * 4, detail * 2.4),
          'line-blur': 5,
          'line-opacity': mode === 'dark' ? 0.35 : 0.18,
        },
      })
    if (poster && major)
      layers.push({
        id: `route-${kind}-ink`,
        type: 'line',
        source,
        'source-layer': 'roads',
        filter,
        minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.land, 'line-width': width(city + 2, detail + 3) },
      })
    layers.push({
      id: `route-${kind}`,
      type: 'line',
      source,
      'source-layer': 'roads',
      filter,
      minzoom,
      layout: { 'line-cap': etched ? 'butt' : 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': width(city, detail),
        'line-opacity': index === 0 ? 0.4 : index === 1 && glow ? 0.6 : 1,
        'line-blur': glow ? 0.3 : 0,
      },
    })
  }
  layers.push({
    id: 'rail',
    type: 'line',
    source,
    'source-layer': 'roads',
    minzoom: 13,
    filter: ['==', ['get', 'kind'], 'rail'],
    paint: {
      'line-color': etched ? p.coast : p.highway,
      'line-width': width(0.5, 1.6),
      'line-dasharray': etched ? [1, 4] : [2, 3],
      'line-opacity': 0.5,
    },
  })
  // Label density and typography vary with the composition; there are no POI or icon layers.
  const text: ExpressionSpecification = [
    'coalesce',
    ['get', 'name:en'],
    ['get', 'name_en'],
    ['get', 'name2'],
    ['get', 'name'],
  ]
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
      'text-font': [poster || block ? 'Noto Sans Medium' : 'Noto Sans Regular'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        poster ? 16 : 13,
        15,
        poster ? 21 : block ? 18 : 16,
      ],
      'text-transform': etched || poster ? 'uppercase' : 'none',
      'text-letter-spacing': etched ? 0.18 : poster ? 0.1 : 0.03,
      'text-max-width': 8,
      'text-padding': poster ? 45 : 25,
    },
    paint: {
      'text-color': p.text,
      'text-halo-color': p.land,
      'text-halo-width': glow ? 2.2 : etched ? 0.7 : 1.3,
      'text-halo-blur': glow ? 2 : 0,
    },
  })
  layers.push({
    id: 'streets',
    type: 'symbol',
    source,
    'source-layer': 'roads',
    minzoom: poster ? 17 : 16,
    filter: ['in', ['get', 'kind'], ['literal', ['major_road', 'minor_road']]],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': etched ? 900 : 650,
      'text-field': text,
      'text-font': ['Noto Sans Regular'],
      'text-size': etched ? 10.5 : 12,
      'text-letter-spacing': etched ? 0.08 : 0.01,
      'text-max-angle': 25,
      'text-padding': 8,
    },
    paint: {
      'text-color': p.muted,
      'text-halo-color': p.land,
      'text-halo-width': etched ? 0.7 : 1.6,
      'text-halo-blur': glow ? 1 : 0,
    },
  })
  return {
    version: 8,
    name: `${DIRECTIONS[direction].name} / ${mode}`,
    sources: {
      [source]: {
        type: 'vector',
        url: 'https://tiles.saanseoi.hk/hongkong-latest.json',
      },
    },
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    layers,
  }
}
