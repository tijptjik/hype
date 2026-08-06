import type { StyleSpecification } from 'maplibre-gl'

import type { LocaleKey } from '../../../types'

import {
  buildNamedProtomapsStyle,
  getLocaleTextField,
  hideSymbolLayers,
  type StyleBuildOptions,
} from './common'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PALETTE AND LAYER POLICY
// 2. DERIVED LAYERS
// 3. STYLE TRANSFORMATION
// 4. STYLE BUILDER

type StyleLayer = NonNullable<StyleSpecification['layers']>[number]

const SIN_VOID = '#553478'
const SIN_EARTH = '#1A1038'
const SIN_HARBOUR = '#081536'
const SIN_PARK = '#B8F000'
const SIN_BUILDING = '#080D29'
const SIN_FUCHSIA = '#F5006C'
const SIN_ORANGE = '#FF6A00'
const SIN_YELLOW = '#F6FF00'
const SIN_CYAN = '#00D9FF'
const SIN_COBALT = '#4561FF'
const SIN_IVORY = '#FFE99A'

const HIDDEN_PROTOMAPS_LAYER_IDS = new Set([
  'boundaries',
  'boundaries_country',
  'earth_label_islands',
  'roads_tunnels_other',
  'roads_tunnels_other_casing',
  'roads_tunnels_link',
  'roads_tunnels_link_casing',
  'roads_link',
  'roads_link_casing',
  'water_label_lakes',
  'water_label_ocean',
])

const ROAD_LAYER_IDS = new Set([
  'roads_runway',
  'roads_taxiway',
  'roads_tunnels_minor',
  'roads_tunnels_major',
  'roads_tunnels_highway',
  'roads_other',
  'roads_minor_service',
  'roads_minor',
  'roads_major',
  'roads_highway',
  'roads_bridges_minor',
  'roads_bridges_major',
  'roads_bridges_highway',
])

const ROAD_CASING_LAYER_IDS = new Set([
  'roads_tunnels_minor_casing',
  'roads_tunnels_major_casing',
  'roads_tunnels_highway_casing',
  'roads_minor_service_casing',
  'roads_minor_casing',
  'roads_major_casing_late',
  'roads_highway_casing_late',
  'roads_major_casing_early',
  'roads_highway_casing_early',
  'roads_bridges_minor_casing',
  'roads_bridges_major_casing',
  'roads_bridges_highway_casing',
])

const GLOW_LABEL_LAYER_IDS = new Set([
  'roads_labels_major',
  'roads_labels_minor',
  'places_locality',
  'places_region',
  'places_subplace',
  'places_country',
])

/**
 * Creates the cobalt wireframe that gives dense building blocks their electric edge.
 *
 * @returns MapLibre line layer placed immediately above building fills.
 */
const createBuildingOutlineLayer = (): StyleLayer => ({
  id: 'buildings_outline',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'buildings',
  minzoom: 16.5,
  filter: ['in', 'kind', 'building', 'building_part'],
  paint: {
    'line-color': [
      'interpolate',
      ['linear'],
      ['zoom'],
      16.5,
      'rgba(69, 97, 255, 0.14)',
      18,
      'rgba(69, 97, 255, 0.58)',
      20,
      'rgba(69, 97, 255, 1)',
    ],
    'line-width': ['interpolate', ['linear'], ['zoom'], 16.5, 0.75, 19, 1.8, 22, 3.6],
    'line-blur': 0.35,
  },
})

/**
 * Creates a soft duplicate label beneath its sharp foreground counterpart.
 *
 * @param layer - Foreground symbol layer whose layout and placement are retained.
 * @returns A low-opacity glow layer.
 */
const createGlowLabelLayer = (layer: StyleLayer): StyleLayer => ({
  ...structuredClone(layer),
  id: `${layer.id}__glow`,
  paint: {
    ...(layer.paint ?? {}),
    'text-color': layer.id?.startsWith('roads_labels_')
      ? 'rgba(246, 255, 0, 0.34)'
      : 'rgba(0, 217, 255, 0.3)',
    'text-halo-color': layer.id?.startsWith('roads_labels_')
      ? 'rgba(246, 255, 0, 0.78)'
      : 'rgba(0, 217, 255, 0.74)',
    'text-halo-width': layer.id === 'places_country' ? 2.1 : 1.65,
    'text-halo-blur': 2.2,
  },
})

/**
 * Applies the Genesis palette and its layered nightlife treatment to a Protomaps style.
 *
 * @param style - Mutable Protomaps style specification.
 * @param noLabels - Whether symbol layers should be removed from the final style.
 * @param locale - Locale used for road and place label fields.
 * @returns The transformed style specification.
 */
const applyGenesisTheme = (
  style: StyleSpecification,
  noLabels: boolean,
  locale: LocaleKey,
): StyleSpecification => {
  if (!style.layers) return style

  // Transform land, harbour, transport and label layers into one cohesive night map.
  style.layers = style.layers.map(layer => {
    const localizedTextField =
      layer.type === 'symbol' ? getLocaleTextField(layer.id, locale) : undefined

    if (HIDDEN_PROTOMAPS_LAYER_IDS.has(layer.id)) {
      return {
        ...layer,
        layout: { ...(layer.layout ?? {}), visibility: 'none' },
      }
    }

    if (ROAD_LAYER_IDS.has(layer.id)) {
      const isMinorRoad =
        layer.id.includes('minor') || layer.id === 'roads_minor_service'
      const isHighway = layer.id.includes('highway')
      const roadColor = isHighway ? SIN_YELLOW : isMinorRoad ? SIN_CYAN : SIN_ORANGE

      return {
        ...layer,
        minzoom: layer.id === 'roads_other' ? 16 : isMinorRoad ? 11 : layer.minzoom,
        paint: {
          ...(layer.paint ?? {}),
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

    if (ROAD_CASING_LAYER_IDS.has(layer.id)) {
      const isMinorRoad = layer.id.includes('minor')

      return {
        ...layer,
        minzoom: isMinorRoad ? 11 : layer.minzoom,
        paint: {
          ...(layer.paint ?? {}),
          'line-color': SIN_FUCHSIA,
          'line-opacity': isMinorRoad ? 0.12 : 0.22,
          'line-blur': layer.id.includes('highway') ? 4.6 : 3.8,
          'line-width': isMinorRoad
            ? ['interpolate', ['linear'], ['zoom'], 11, 2.2, 15, 4.4, 19, 7.7]
            : ['interpolate', ['linear'], ['zoom'], 10, 3.4, 14, 6.5, 19, 11.4],
        },
      }
    }

    switch (layer.id) {
      case 'background':
        return {
          ...layer,
          paint: { ...(layer.paint ?? {}), 'background-color': SIN_VOID },
        }
      case 'earth':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': SIN_EARTH,
            'fill-outline-color': 'transparent',
          },
        }
      case 'water':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': SIN_HARBOUR,
            'fill-outline-color': 'rgba(0, 217, 255, 0.18)',
          },
        }
      case 'water_stream':
      case 'water_river':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': SIN_CYAN,
            'line-opacity': 0.48,
          },
        }
      case 'landuse_park':
      case 'landuse_urban_green':
      case 'landuse_zoo':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': SIN_PARK,
            'fill-opacity': 0.5,
          },
        }
      case 'landuse_school':
      case 'landuse_hospital':
      case 'landuse_industrial':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': '#773A98',
            'fill-opacity': 0.56,
          },
        }
      case 'landuse_beach':
      case 'landuse_pedestrian':
      case 'landuse_pier':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': '#FF8100',
            'fill-opacity': 0.42,
          },
        }
      case 'buildings':
        return {
          ...layer,
          minzoom: 16.5,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': SIN_BUILDING,
            'fill-opacity': 0.86,
            'fill-outline-color': 'transparent',
          },
        }
      case 'roads_rail':
        return {
          ...layer,
          layout: { ...(layer.layout ?? {}), visibility: 'visible' },
          paint: {
            ...(layer.paint ?? {}),
            'line-color': SIN_FUCHSIA,
            'line-opacity': 0.82,
            'line-blur': 0.6,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              0.9,
              15,
              1.7,
              19,
              2.8,
            ],
          },
        }
      case 'roads_pier':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': SIN_CYAN,
            'line-opacity': 0.7,
          },
        }
      case 'address_label':
        return {
          ...layer,
          minzoom: 19,
          layout: {
            ...(layer.layout ?? {}),
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-size': 12,
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': SIN_YELLOW,
            'text-halo-color': SIN_EARTH,
            'text-halo-width': 1.1,
          },
        }
      case 'water_waterway_label':
        return {
          ...layer,
          layout: {
            ...(layer.layout ?? {}),
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': SIN_CYAN,
            'text-halo-color': SIN_HARBOUR,
            'text-halo-width': 1,
          },
        }
      case 'roads_labels_minor':
      case 'roads_labels_major':
        return {
          ...layer,
          minzoom: layer.id === 'roads_labels_major' ? 12 : 15,
          layout: {
            ...(layer.layout ?? {}),
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-size':
              layer.id === 'roads_labels_major'
                ? ['interpolate', ['linear'], ['zoom'], 12, 13, 16, 16, 20, 19]
                : ['interpolate', ['linear'], ['zoom'], 15, 12.5, 20, 15.5],
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': SIN_IVORY,
            'text-halo-color': 'rgba(16, 7, 19, 0.88)',
            'text-halo-width': 0.6,
          },
        }
      case 'places_subplace':
      case 'places_region':
      case 'places_locality':
      case 'places_country':
        if (noLabels) return layer
        return {
          ...layer,
          layout: {
            ...(layer.layout ?? {}),
            'icon-image': '',
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-transform': 'uppercase',
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': layer.id === 'places_locality' ? SIN_IVORY : '#B7DFFF',
            'text-halo-color': 'rgba(26, 16, 56, 0.94)',
            'text-halo-width': 0.75,
          },
        }
      case 'pois':
        return {
          ...layer,
          layout: { ...(layer.layout ?? {}), visibility: 'none' },
        }
      default:
        return layer
    }
  })

  // Insert blurred label duplicates below sharp text, then wireframe every building mass.
  const layersWithGlow: StyleLayer[] = []
  for (const layer of style.layers) {
    if (GLOW_LABEL_LAYER_IDS.has(layer.id) && layer.type === 'symbol' && !noLabels) {
      layersWithGlow.push(createGlowLabelLayer(layer))
    }
    layersWithGlow.push(layer)
  }

  const buildingLayerIndex = layersWithGlow.findIndex(layer => layer.id === 'buildings')
  if (buildingLayerIndex >= 0) {
    layersWithGlow.splice(buildingLayerIndex + 1, 0, createBuildingOutlineLayer())
  }

  style.layers = layersWithGlow
  return style
}

/**
 * Builds the Genesis MapLibre style.
 *
 * @param options - Optional locale and label visibility controls.
 * @returns Nighttime Hong Kong MapLibre style specification.
 */
export const buildGenesisStyle = ({
  noLabels = false,
  locale = 'en',
}: StyleBuildOptions = {}): StyleSpecification => {
  const style = buildNamedProtomapsStyle('dark', { locale })
  applyGenesisTheme(style, noLabels, locale)

  return noLabels ? hideSymbolLayers(style) : style
}
