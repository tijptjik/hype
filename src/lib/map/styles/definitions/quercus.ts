// PROTOMAPS
import { LIGHT, type Flavor } from '@protomaps/basemaps'
// MAPLIBRE
import { convertFilter } from '@maplibre/maplibre-gl-style-spec'
// MAP
import { buildProtomapsStyle } from './common'
// TYPES
import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

// Chalk paper, botanical ink and printed vegetation distinguish this field map from Day Runner.
const PAPER = '#f1f0e5'
const ROAD = '#b9bcab'
const CASING = '#d6d7c8'
const PARK = '#e2e6d2'
const WOOD = '#dce1c9'
const PATH = '#879572'
const WATER = '#d0dadd'
const INK = '#52624f'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. BOTANICAL PALETTE
// 2. WALKING AND TEXTURE POLICIES
// 3. STYLE BUILDER

const QUERCUS_FLAVOR: Flavor = {
  ...LIGHT,
  background: WATER,
  earth: PAPER,
  park_a: PARK,
  park_b: PARK,
  wood_a: WOOD,
  wood_b: WOOD,
  scrub_a: PARK,
  scrub_b: PARK,
  zoo: PARK,
  hospital: '#eae9dd',
  industrial: '#e9e9df',
  school: '#eaeade',
  military: '#e9e9df',
  pedestrian: '#e5e6d5',
  sand: '#e9e5d3',
  beach: '#e9e5d3',
  glacier: PAPER,
  aerodrome: PAPER,
  runway: PAPER,
  water: WATER,
  pier: '#d1d3c2',
  buildings: '#eeeddf',
  tunnel_other_casing: PAPER,
  tunnel_minor_casing: PAPER,
  tunnel_link_casing: PAPER,
  tunnel_major_casing: PAPER,
  tunnel_highway_casing: PAPER,
  tunnel_other: '#ded6ca',
  tunnel_minor: '#ded6ca',
  tunnel_link: '#ded6ca',
  tunnel_major: '#ded6ca',
  tunnel_highway: '#ded6ca',
  minor_service_casing: CASING,
  minor_casing: CASING,
  link_casing: CASING,
  major_casing_late: CASING,
  highway_casing_late: CASING,
  other: PATH,
  minor_service: ROAD,
  minor_a: ROAD,
  minor_b: ROAD,
  link: ROAD,
  major_casing_early: CASING,
  major: ROAD,
  highway_casing_early: CASING,
  highway: ROAD,
  railway: '#b6bfbb',
  boundaries: CASING,
  bridges_other_casing: CASING,
  bridges_minor_casing: CASING,
  bridges_link_casing: CASING,
  bridges_major_casing: CASING,
  bridges_highway_casing: CASING,
  bridges_other: PATH,
  bridges_minor: ROAD,
  bridges_link: ROAD,
  bridges_major: ROAD,
  bridges_highway: ROAD,
  roads_label_minor: '#64715e',
  roads_label_minor_halo: PAPER,
  roads_label_major: INK,
  roads_label_major_halo: PAPER,
  ocean_label: '#6b7f86',
  subplace_label: INK,
  subplace_label_halo: PAPER,
  city_label: '#48583f',
  city_label_halo: PAPER,
  state_label: INK,
  state_label_halo: PAPER,
  country_label: INK,
  address_label: '#7b7c70',
  address_label_halo: PAPER,
  landcover: {
    barren: PAPER,
    farmland: PARK,
    forest: WOOD,
    glacier: PAPER,
    grassland: PARK,
    scrub: PARK,
    urban_area: PAPER,
  },
}

/**
 * Restricts every retained road layer to the walkable city context.
 * @param layer - Protomaps layer with a legacy or expression filter.
 * @returns The same layer with motorway and ramp features excluded.
 * @remarks Filter conversion preserves Protomaps bridge and tunnel conditions.
 */
const excludeMotorways = (layer: LayerSpecification): LayerSpecification => {
  if (!('source-layer' in layer) || layer['source-layer'] !== 'roads') return layer
  return {
    ...layer,
    filter: [
      'all',
      layer.filter === undefined ? true : convertFilter(layer.filter),
      ['!=', ['get', 'kind'], 'highway'],
      ['!', ['has', 'is_link']],
      [
        '!',
        [
          'in',
          ['get', 'kind_detail'],
          ['literal', ['motorway', 'motorway_link', 'trunk', 'trunk_link']],
        ],
      ],
    ] as FilterSpecification,
  }
}

/**
 * Adds transparent grain and vegetation print without replacing solid land colours.
 * @param layers - Base geometry and local street layers in drawing order.
 * @returns Layers with paper grain, park stipple and woodland hatching.
 * @remarks Patterns belong to geographic fills, so they move with the map and remain
 * available in label-free image renders. Water, streets and photographs stay clear.
 */
const addPrintedTextures = (
  layers: StyleSpecification['layers'],
): StyleSpecification['layers'] => {
  const earth = layers.find(layer => layer.id === 'earth')
  return layers.flatMap((layer): LayerSpecification[] => {
    if (layer.id === 'water' && earth?.type === 'fill') {
      return [
        {
          ...earth,
          id: 'quercus-paper-grain',
          paint: { 'fill-pattern': 'quercus:paper', 'fill-opacity': 0.55 },
        },
        layer,
      ]
    }
    if (layer.type !== 'fill') return [layer]
    if (layer.id === 'landuse_park') {
      return [
        layer,
        {
          ...layer,
          id: 'quercus-park-stipple',
          minzoom: 12,
          filter: [
            'in',
            'kind',
            'park',
            'national_park',
            'cemetery',
            'protected_area',
            'nature_reserve',
            'golf_course',
            'scrub',
            'grassland',
            'grass',
          ],
          paint: { 'fill-pattern': 'quercus:park', 'fill-opacity': 0.38 },
        },
        {
          ...layer,
          id: 'quercus-wood-hatch',
          minzoom: 12,
          filter: ['in', 'kind', 'forest', 'wood'],
          paint: { 'fill-pattern': 'quercus:wood', 'fill-opacity': 0.3 },
        },
      ]
    }
    if (layer.id === 'landuse_urban_green' || layer.id === 'landuse_zoo') {
      return [
        layer,
        {
          ...layer,
          id: `quercus-${layer.id}-stipple`,
          minzoom: 12,
          paint: { 'fill-pattern': 'quercus:park', 'fill-opacity': 0.32 },
        },
      ]
    }
    return [layer]
  })
}

/**
 * Builds a light city map that gives ancient-tree photography room to stand out.
 * @param options - Locale and label visibility preferences.
 * @returns A textured field map with local streets, printed vegetation and fine footprints.
 * @remarks Pairs with Milque. Trees remain project features; basemap POIs are omitted
 * so ordinary tree icons and commercial labels do not compete with their images.
 */
export const buildQuercusStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildProtomapsStyle(QUERCUS_FLAVOR, options)
  style.name = 'Quercus'
  style.metadata = { 'hype:style-variant': 'Quercus' }
  style.sprite = [
    {
      id: 'default',
      url: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    },
    { id: 'quercus', url: '/mapSprites/quercus/texture' },
  ]

  // Remove motorway surfaces and decoration, then draw local streets as fine ink lines.
  style.layers = style.layers
    .filter(layer => !('source-layer' in layer && layer['source-layer'] === 'pois'))
    .filter(layer => !layer.id.startsWith('boundaries'))
    .filter(layer => !/_highway|_link|_casing/.test(layer.id))
    .filter(
      layer =>
        ![
          'roads_shields',
          'roads_oneway',
          'roads_runway',
          'roads_taxiway',
          'roads_rail',
        ].includes(layer.id),
    )
    .map(excludeMotorways)
    .map(layer => {
      if (layer.type === 'fill' && layer.id === 'buildings') {
        return {
          ...layer,
          minzoom: 15,
          paint: {
            ...layer.paint,
            'fill-opacity': 0.6,
            'fill-outline-color': '#c4c7b6',
          },
        }
      }
      if (layer.type === 'line' && layer['source-layer'] === 'roads') {
        const isPath = layer.id.endsWith('_other')
        const isMajor = layer.id.endsWith('_major')
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'line-color': isPath ? PATH : ROAD,
            'line-width': isMajor
              ? ['interpolate', ['linear'], ['zoom'], 11, 0.65, 16, 1.3, 19, 2.2]
              : ['interpolate', ['linear'], ['zoom'], 12, 0.45, 16, 0.8, 19, 1.35],
            'line-opacity': layer.id.includes('tunnels') ? 0.45 : 0.85,
            ...(isPath ? { 'line-dasharray': [1, 1.7] } : {}),
          },
        } satisfies LayerSpecification
      }
      if (layer.type === 'symbol') {
        return {
          ...layer,
          minzoom:
            layer.id === 'roads_labels_major'
              ? 14
              : layer.id === 'roads_labels_minor'
                ? 16
                : layer.id === 'address_label'
                  ? 19
                  : layer.minzoom,
          paint: { ...layer.paint, 'text-halo-width': 1.4 },
        }
      }
      return layer
    })

  style.layers = addPrintedTextures(style.layers)

  return style
}
