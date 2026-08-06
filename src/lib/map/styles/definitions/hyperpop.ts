import type { StyleSpecification } from 'maplibre-gl'

import type { StyleBuildOptions } from './common'
import { buildGhosteryStyle } from './ghostery'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PALETTE
// 2. LAYER TRANSFORMATION
// 3. STYLE BUILDER

const HYPERPOP_PRIMARY = '#f04d7f'
const HYPERPOP_PRIMARY_CONTENT = '#d4dbff'
const HYPERPOP_SECONDARY = '#d653b9'
const HYPERPOP_ACCENT = '#7042f0'
const HYPERPOP_BASE_100 = '#1d232a'
const HYPERPOP_BASE_200 = '#191e24'
const HYPERPOP_BASE_350 = '#161617'
const HYPERPOP_BASE_400 = '#101214'
const HYPERPOP_PRIMARY_GLOW = 'rgba(240, 77, 127, 0.72)'

type StyleLayer = NonNullable<StyleSpecification['layers']>[number]

const BASE_EARTH_FILTER = [
  'all',
  ['==', '$type', 'Polygon'],
  ['==', 'kind', 'earth'],
  ['==', 'saanseoi:base', true],
] as const

const BASE_OCEAN_FILTER = [
  'all',
  ['==', '$type', 'Polygon'],
  ['==', 'kind', 'ocean'],
  ['==', 'sort_rank', 200],
  ['==', 'saanseoi:base', true],
] as const

const COASTLINE_FILTER = [
  'all',
  ['==', '$type', 'LineString'],
  ['==', 'kind', 'coastline'],
  ['==', 'saanseoi:base', true],
] as const

const REGIONAL_BORDER_FILTER = [
  'all',
  ['==', '$type', 'LineString'],
  ['==', 'kind', 'region'],
  ['==', 'kind_detail', 4],
  ['==', 'saanseoi:region_border', true],
] as const

/**
 * Creates the subtle casing behind source coastline geometry in the water layer.
 *
 * @returns MapLibre line layer that separates the shoreline from water and land.
 */
const createCoastlineGutterLayer = (): StyleLayer => ({
  id: 'coastline_gutter',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'water',
  filter: COASTLINE_FILTER,
  paint: {
    'line-color': HYPERPOP_BASE_400,
    'line-opacity': 0.82,
    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 10, 2.4, 18, 6],
  },
})

/**
 * Creates the purple shoreline above its gutter.
 *
 * @returns MapLibre line layer containing only water-layer coastline geometry.
 */
const createCoastlineLayer = (): StyleLayer => ({
  id: 'coastline',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'water',
  filter: COASTLINE_FILTER,
  paint: {
    'line-color': HYPERPOP_ACCENT,
    'line-opacity': 0.92,
    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.65, 10, 1.1, 18, 3.2],
  },
})

/**
 * Creates the subtle casing for source-local landward regional closure geometry.
 *
 * @returns MapLibre line layer that makes the regional land edge match the shoreline.
 */
const createRegionalBorderGutterLayer = (): StyleLayer => ({
  id: 'regional_border_gutter',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'boundaries',
  filter: REGIONAL_BORDER_FILTER,
  paint: {
    'line-color': HYPERPOP_BASE_400,
    'line-opacity': 0.82,
    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 10, 2.4, 18, 6],
  },
})

/**
 * Creates the purple landward regional closure line.
 *
 * @returns MapLibre line layer containing only land-adjacent footprint geometry.
 */
const createRegionalBorderLayer = (): StyleLayer => ({
  id: 'regional_border',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'boundaries',
  filter: REGIONAL_BORDER_FILTER,
  paint: {
    'line-color': HYPERPOP_ACCENT,
    'line-opacity': 0.92,
    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.65, 10, 1.1, 18, 3.2],
  },
})

/**
 * Restores the Protomaps gap width that makes Genesis's coloured casing read
 * as a true road outline instead of a blurred line beneath the carriageway.
 *
 * @param layerId - Protomaps road casing layer ID.
 * @returns Genesis gap-width expression for the casing layer.
 */
const getGenesisRoadOutlineGap = (layerId: string) => {
  switch (layerId) {
    case 'roads_minor_service_casing':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 18, 8]
    case 'roads_tunnels_minor_casing':
    case 'roads_minor_casing':
    case 'roads_bridges_minor_casing':
      return [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        11,
        0,
        12.5,
        0.5,
        15,
        2,
        18,
        11,
      ]
    case 'roads_tunnels_major_casing':
    case 'roads_major_casing_early':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 0.5, 18, 13]
    case 'roads_bridges_major_casing':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 7, 0, 7.5, 0.5, 18, 10]
    case 'roads_major_casing_late':
      return [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        6,
        0,
        12,
        1.6,
        15,
        3,
        18,
        13,
      ]
    case 'roads_tunnels_highway_casing':
    case 'roads_highway_casing_early':
    case 'roads_highway_casing_late':
    case 'roads_bridges_highway_casing':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 3, 0, 3.5, 0.5, 18, 15]
    case 'roads_tunnels_other_casing':
    case 'roads_bridges_other_casing':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0, 20, 7]
    case 'roads_tunnels_link_casing':
    case 'roads_link_casing':
    case 'roads_bridges_link_casing':
      return ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0, 13.5, 1, 18, 11]
    default:
      return 0
  }
}

/**
 * Applies the Hype UI palette to Genesis road geometry and Ghostery's sparse,
 * zoom-aware layer policy.
 *
 * @param style - Mutable Ghostery-derived style specification.
 * @returns Restyled MapLibre specification with Ghostery visibility thresholds intact.
 */
const applyHyperpopPalette = (style: StyleSpecification): StyleSpecification => {
  if (!style.layers) return style

  // Preserve Ghostery's layer visibility and zoom thresholds while replacing its visual treatment.
  style.layers = style.layers.map(layer => {
    const paint = layer.paint ?? {}
    const isRoadLabelGlow =
      layer.id.startsWith('roads_labels_') && layer.id.endsWith('__glow')

    if (layer.id.endsWith('__glow')) {
      return {
        ...layer,
        paint: {
          ...paint,
          'text-color': isRoadLabelGlow
            ? 'rgba(255, 255, 255, 0.46)'
            : 'rgba(255, 255, 255, 0.36)',
          'text-halo-color': HYPERPOP_PRIMARY_GLOW,
          'text-halo-width': layer.id === 'places_country__glow' ? 1.5 : 1.25,
          'text-halo-blur': isRoadLabelGlow ? 2.2 : 1.9,
        },
      }
    }

    if (layer.id.includes('_casing')) {
      const isMinorRoad = layer.id.includes('minor')

      return {
        ...layer,
        paint: {
          ...paint,
          'line-color': HYPERPOP_ACCENT,
          'line-opacity': isMinorRoad ? 0.12 : 0.22,
          'line-blur': layer.id.includes('highway') ? 4.6 : 3.8,
          'line-gap-width': getGenesisRoadOutlineGap(layer.id),
          'line-width': isMinorRoad
            ? ['interpolate', ['linear'], ['zoom'], 11, 2.2, 15, 4.4, 19, 7.7]
            : ['interpolate', ['linear'], ['zoom'], 10, 3.4, 14, 6.5, 19, 11.4],
        },
      }
    }

    if (layer.id === 'buildings_outline') {
      return {
        ...layer,
        paint: {
          ...paint,
          'line-color': [
            'interpolate',
            ['linear'],
            ['zoom'],
            16.5,
            'rgba(214, 83, 185, 0.14)',
            18,
            'rgba(214, 83, 185, 0.58)',
            20,
            'rgba(214, 83, 185, 1)',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            16.5,
            0.75,
            19,
            1.8,
            22,
            3.6,
          ],
          'line-blur': 0.35,
        },
      }
    }

    if (
      layer.id === 'roads_runway' ||
      layer.id === 'roads_taxiway' ||
      layer.id === 'roads_tunnels_minor' ||
      layer.id === 'roads_tunnels_major' ||
      layer.id === 'roads_tunnels_highway' ||
      layer.id === 'roads_other' ||
      layer.id === 'roads_minor_service' ||
      layer.id === 'roads_minor' ||
      layer.id === 'roads_major' ||
      layer.id === 'roads_highway' ||
      layer.id === 'roads_bridges_minor' ||
      layer.id === 'roads_bridges_major' ||
      layer.id === 'roads_bridges_highway'
    ) {
      const isMinorRoad =
        layer.id.includes('minor') || layer.id === 'roads_minor_service'
      const isHighway = layer.id.includes('highway')
      const roadColor = isHighway
        ? HYPERPOP_SECONDARY
        : isMinorRoad
          ? HYPERPOP_SECONDARY
          : layer.id === 'roads_other'
            ? HYPERPOP_PRIMARY_CONTENT
            : HYPERPOP_PRIMARY

      return {
        ...layer,
        paint: {
          ...paint,
          'line-color': roadColor,
          'line-opacity': layer.id === 'roads_other' ? 0.5 : isMinorRoad ? 0.76 : 1,
          'line-blur': layer.id === 'roads_other' ? 0.45 : isHighway ? 0.34 : 0.2,
          'line-width':
            layer.id === 'roads_other'
              ? ['interpolate', ['linear'], ['zoom'], 16, 0.8, 19, 1.5, 22, 2.3]
              : isMinorRoad
                ? ['interpolate', ['linear'], ['zoom'], 11, 0.65, 15, 1.45, 19, 2.7]
                : ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2, 19, 4.1],
        },
      }
    }

    if (layer.id === 'background') {
      return {
        ...layer,
        paint: { ...paint, 'background-color': HYPERPOP_BASE_400 },
      }
    }

    if (layer.id === 'earth') {
      return {
        ...layer,
        filter: BASE_EARTH_FILTER,
        paint: {
          ...paint,
          'fill-color': HYPERPOP_BASE_100,
          'fill-outline-color': 'transparent',
        },
      }
    }

    if (layer.id === 'water') {
      return {
        ...layer,
        filter: BASE_OCEAN_FILTER,
        paint: { ...paint, 'fill-color': HYPERPOP_BASE_200 },
      }
    }

    if (layer.id === 'buildings') {
      return {
        ...layer,
        paint: { ...paint, 'fill-color': HYPERPOP_BASE_350, 'fill-opacity': 0.9 },
      }
    }

    if (layer.type === 'symbol') {
      return {
        ...layer,
        paint: {
          ...paint,
          'text-color': HYPERPOP_PRIMARY_CONTENT,
          'text-halo-color': 'rgba(8, 5, 17, 0.92)',
          'text-halo-width': 0.55,
          'text-halo-blur': 0.2,
        },
      }
    }

    return layer
  })

  // Paint source shoreline and landward closure after water, never generic administrative boundaries.
  const layersWithCoastline: StyleLayer[] = []
  for (const layer of style.layers) {
    layersWithCoastline.push(layer)

    if (layer.id === 'water') {
      layersWithCoastline.push(
        createCoastlineGutterLayer(),
        createCoastlineLayer(),
        createRegionalBorderGutterLayer(),
        createRegionalBorderLayer(),
      )
    }
  }

  style.layers = layersWithCoastline

  return style
}

/**
 * Builds the Hyperpop MapLibre style.
 *
 * @param options - Optional locale and label visibility controls.
 * @returns A sparse map in the Hype UI palette with Genesis roads and glowing labels.
 */
export const buildHyperpopStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = applyHyperpopPalette(buildGhosteryStyle(options))

  return {
    ...style,
    name: 'Hyperpop',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Hyperpop',
    },
  }
}
