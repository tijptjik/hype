import type { StyleSpecification } from 'maplibre-gl'

import type { LocaleKey } from '../../../types'

import {
  buildNamedProtomapsStyle,
  getLocaleTextField,
  hideSymbolLayers,
  type StyleBuildOptions,
} from './common'

const HIDDEN_NEORGANGE_PROTOMAPS_LAYER_IDS = new Set([
  'boundaries',
  'boundaries_country',
  'earth_label_islands',
  'roads_tunnels_other',
  'roads_tunnels_other_casing',
  'roads_tunnels_link',
  'roads_tunnels_link_casing',
  'roads_link',
  'roads_link_casing',
  'roads_rail',
  'roads_bridges_other',
  'roads_bridges_other_casing',
  'roads_bridges_link',
  'roads_bridges_link_casing',
  'water_label_lakes',
  'water_label_ocean',
])

const NEORGANGE_ROAD_ORANGE = '#FF8A00'
const NEORGANGE_ROAD_ORANGE_BRIGHT = '#FFB347'
const NEORGANGE_DARK = '#141414'
const NEORGANGE_BLACK = '#000000'
const NEORGANGE_VOID = 'rgb(12,12,12)'
const NEORGANGE_BUILDING_FILL = 'rgba(15, 14, 14, 1)'
const NEORGANGE_TEXT_WHITE_SOLID = '#FFFFFF'

const GLOW_LABEL_LAYER_IDS = new Set([
  'roads_labels_major',
  'roads_labels_minor',
  'places_locality',
  'places_locality_detail',
  'places_region',
  'places_subplace',
  'places_country',
])

const createGlowLabelLayer = (
  layer: NonNullable<StyleSpecification['layers']>[number],
): NonNullable<StyleSpecification['layers']>[number] => ({
  ...structuredClone(layer),
  id: `${layer.id}__glow`,
  paint: {
    ...(layer.paint ?? {}),
    'text-color': layer.id?.startsWith('roads_labels_')
      ? 'rgba(255,255,255,0.52)'
      : 'rgba(255,255,255,0.42)',
    'text-halo-color': 'rgb(255, 164, 72)',
    'text-halo-width': layer.id === 'places_country' ? 1.35 : 1.1,
    'text-halo-blur': layer.id?.startsWith('roads_labels_') ? 2.2 : 1.9,
    'text-opacity': layer.id === 'roads_labels_minor' ? 0.9 : 1,
  },
})

const createMinorLocalityLayer = (
  layer: NonNullable<StyleSpecification['layers']>[number],
): NonNullable<StyleSpecification['layers']>[number] => ({
  ...structuredClone(layer),
  id: 'places_locality_minor',
  minzoom: 12,
  filter: [
    'all',
    ['==', 'kind', 'locality'],
    [
      'any',
      ['==', 'kind_detail', 'village'],
      ['==', 'kind_detail', 'hamlet'],
      ['==', 'kind_detail', 'isolated_dwelling'],
      ['==', 'kind_detail', 'farm'],
      ['==', 'kind_detail', 'scientific_station'],
    ],
  ],
  layout: {
    ...(layer.layout ?? {}),
    'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10.5, 15, 13.5, 18, 16],
    'text-transform': 'uppercase',
  },
  paint: {
    ...(layer.paint ?? {}),
    'text-color': NEORGANGE_TEXT_WHITE_SOLID,
    'text-halo-color': 'rgba(255,255,255,0.2)',
    'text-halo-width': 0.3,
    'text-halo-blur': 0,
  },
})

const createDetailLocalityLayer = (
  layer: NonNullable<StyleSpecification['layers']>[number],
): NonNullable<StyleSpecification['layers']>[number] => ({
  ...structuredClone(layer),
  id: 'places_locality_detail',
  minzoom: 13,
  filter: ['all', ['==', 'kind', 'locality'], ['==', 'kind_detail', 'locality']],
  layout: {
    ...(layer.layout ?? {}),
    'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 15, 13.5, 18, 16.5],
    'text-transform': 'uppercase',
  },
  paint: {
    ...(layer.paint ?? {}),
    'text-color': NEORGANGE_TEXT_WHITE_SOLID,
    'text-halo-color': 'rgba(255,255,255,0.2)',
    'text-halo-width': 0.3,
    'text-halo-blur': 0,
  },
})

const createBuildingOutlineLayer = (): NonNullable<
  StyleSpecification['layers']
>[number] => ({
  id: 'buildings_outline',
  type: 'line',
  source: 'hongkong-latest',
  'source-layer': 'buildings',
  minzoom: 17,
  filter: ['in', 'kind', 'building', 'building_part'],
  paint: {
    'line-color': [
      'interpolate',
      ['linear'],
      ['zoom'],
      17,
      'rgba(56, 247, 255, 0.14)',
      19,
      'rgba(56, 247, 255, 0.74)',
      20,
      'rgba(56, 247, 255, 1)',
    ],
    'line-width': ['interpolate', ['linear'], ['zoom'], 17, 1, 19, 2, 21, 3, 23, 5],
    'line-opacity': 0.8,
  },
})

const applyNeorgangeThemeToProtomaps = (
  style: StyleSpecification,
  noLabels: boolean,
  locale: LocaleKey,
): StyleSpecification => {
  if (!style.layers) {
    return style
  }

  style.layers = style.layers.map(layer => {
    const localizedTextField =
      layer.type === 'symbol' ? getLocaleTextField(layer.id, locale) : undefined

    if (HIDDEN_NEORGANGE_PROTOMAPS_LAYER_IDS.has(layer.id)) {
      return {
        ...layer,
        layout: {
          ...(layer.layout ?? {}),
          visibility: 'none',
        },
      }
    }

    switch (layer.id) {
      case 'background':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'background-color': NEORGANGE_VOID,
          },
        }
      case 'earth':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': NEORGANGE_BLACK,
            'fill-outline-color': 'transparent',
            'fill-antialias': true,
          },
        }
      case 'water':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': NEORGANGE_VOID,
            'fill-antialias': false,
            'fill-outline-color': 'transparent',
          },
        }
      case 'landuse_park':
      case 'landuse_urban_green':
      case 'landuse_hospital':
      case 'landuse_industrial':
      case 'landuse_school':
      case 'landuse_beach':
      case 'landuse_zoo':
      case 'landuse_aerodrome':
      case 'landuse_runway':
      case 'landuse_pedestrian':
      case 'landuse_pier':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': NEORGANGE_BLACK,
            'fill-opacity': 0,
          },
        }
      case 'water_stream':
      case 'water_river':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': '#111111',
            'line-opacity': 0.25,
          },
        }
      case 'buildings':
        return {
          ...layer,
          minzoom: 17,
          maxzoom: 19,
          paint: {
            ...(layer.paint ?? {}),
            'fill-color': NEORGANGE_BUILDING_FILL,
            'fill-opacity': 0.5,
            'fill-outline-color': 'transparent',
          },
        }
      case 'buildings_outline':
        return {
          ...layer,
          minzoom: 17,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': [
              'interpolate',
              ['linear'],
              ['zoom'],
              17,
              'rgba(56, 247, 255, 0.14)',
              19,
              'rgba(56, 247, 255, 0.74)',
              20,
              'rgba(56, 247, 255, 1)',
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              17,
              1,
              19,
              2,
              21,
              3,
              23,
              5,
            ],
            'line-opacity': 0.8,
          },
        }
      case 'roads_runway':
      case 'roads_taxiway':
      case 'roads_tunnels_minor':
      case 'roads_tunnels_major':
      case 'roads_tunnels_highway':
      case 'roads_other':
      case 'roads_minor_service':
      case 'roads_minor':
      case 'roads_major':
      case 'roads_highway':
      case 'roads_bridges_minor':
      case 'roads_bridges_major':
      case 'roads_bridges_highway':
        return {
          ...layer,
          minzoom:
            layer.id === 'roads_other'
              ? 17
              : layer.id === 'roads_minor_service' || layer.id === 'roads_minor'
                ? 11
                : layer.minzoom,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': NEORGANGE_ROAD_ORANGE,
            'line-opacity': layer.id === 'roads_other' ? 0.58 : 1,
            'line-dasharray': layer.id === 'roads_other' ? [1.5, 1.5] : [1, 0],
            'line-blur':
              layer.id === 'roads_other'
                ? 0.8
                : layer.id === 'roads_highway' || layer.id === 'roads_bridges_highway'
                  ? 0.7
                  : layer.id === 'roads_major' || layer.id === 'roads_bridges_major'
                    ? 0.55
                    : 0.35,
            'line-width':
              layer.id === 'roads_other'
                ? ['interpolate', ['linear'], ['zoom'], 17, 1, 19, 1.45, 21, 2.1]
                : layer.id === 'roads_minor_service' ||
                    layer.id === 'roads_minor' ||
                    layer.id === 'roads_tunnels_minor' ||
                    layer.id === 'roads_bridges_minor'
                  ? ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 1.55, 18, 2.45]
                  : ['interpolate', ['linear'], ['zoom'], 10, 1.3, 14, 2.1, 18, 3.2],
          },
        }
      case 'roads_tunnels_minor_casing':
      case 'roads_tunnels_major_casing':
      case 'roads_tunnels_highway_casing':
      case 'roads_minor_service_casing':
      case 'roads_minor_casing':
      case 'roads_major_casing_late':
      case 'roads_highway_casing_late':
      case 'roads_major_casing_early':
      case 'roads_highway_casing_early':
      case 'roads_bridges_minor_casing':
      case 'roads_bridges_major_casing':
      case 'roads_bridges_highway_casing':
        return {
          ...layer,
          minzoom: layer.id.includes('minor')
            ? 11
            : layer.id.includes('major')
              ? 10
              : layer.minzoom,
          paint: {
            'line-color': NEORGANGE_ROAD_ORANGE_BRIGHT,
            'line-opacity': layer.id.includes('minor') ? 0.22 : 0.28,
            'line-blur': layer.id.includes('highway') ? 5.8 : 4.8,
            'line-dasharray': [1, 0],
            'line-width': layer.id.includes('minor')
              ? ['interpolate', ['linear'], ['zoom'], 11, 2.8, 14, 4.9, 18, 7.8]
              : ['interpolate', ['linear'], ['zoom'], 10, 3.2, 14, 5.9, 18, 9.4],
          },
        }
      case 'roads_pier':
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            'line-color': NEORGANGE_VOID,
          },
        }
      case 'roads_rail':
        return {
          ...layer,
          layout: {
            ...(layer.layout ?? {}),
            visibility: 'none',
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
            'text-color': 'rgba(240, 77, 127, 0.86)',
            'text-halo-blur': 1.2,
            'text-halo-color': NEORGANGE_DARK,
            'text-halo-width': 1,
            'text-opacity': ['interpolate', ['linear'], ['zoom'], 18.5, 0, 20, 1],
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
            'text-color': '#6F88A8',
            'text-halo-blur': 1,
            'text-halo-color': 'rgba(0,0,0,0.7)',
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
            'text-transform': 'none',
            'text-size':
              layer.id === 'roads_labels_major'
                ? ['interpolate', ['linear'], ['zoom'], 12, 13.75, 16, 16.25, 20, 20]
                : ['interpolate', ['linear'], ['zoom'], 15, 13.75, 20, 16.25],
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': NEORGANGE_TEXT_WHITE_SOLID,
            'text-halo-blur': 0,
            'text-halo-color': 'rgba(255,255,255,0.2)',
            'text-halo-width': 0.35,
          },
        }
      case 'places_subplace':
        if (noLabels) return layer
        return {
          ...layer,
          maxzoom: layer.maxzoom === undefined ? 17 : layer.maxzoom + 2,
          filter: ['any', ['==', 'kind', 'neighbourhood'], ['==', 'kind', 'macrohood']],
          layout: {
            ...(layer.layout ?? {}),
            'icon-image': '',
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              11,
              16,
              14,
              22.5,
              18,
              26,
            ],
            'text-transform': 'uppercase',
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': NEORGANGE_TEXT_WHITE_SOLID,
            'text-halo-blur': 0,
            'text-halo-color': 'rgba(255,255,255,0.2)',
            'text-halo-width': 0.35,
          },
        }
      case 'places_region':
        if (noLabels) return layer
        return {
          ...layer,
          maxzoom: layer.maxzoom === undefined ? 14 : layer.maxzoom + 2,
          layout: {
            ...(layer.layout ?? {}),
            'icon-image': '',
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6, 17, 10, 22, 12, 26],
            'text-transform': 'uppercase',
            visibility: 'visible',
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': NEORGANGE_TEXT_WHITE_SOLID,
            'text-halo-blur': 0,
            'text-halo-color': 'rgba(255,255,255,0.2)',
            'text-halo-width': 0.35,
          },
        }
      case 'places_locality':
      case 'places_country':
      case 'pois':
        if (noLabels) return layer
        if (layer.id === 'pois') {
          return {
            ...layer,
            layout: {
              ...(layer.layout ?? {}),
              visibility: 'none',
            },
          }
        }
        return {
          ...layer,
          minzoom: layer.id === 'places_locality' ? 8 : layer.minzoom,
          filter:
            layer.id === 'places_locality'
              ? [
                  'all',
                  ['==', 'kind', 'locality'],
                  ['!=', 'kind_detail', 'locality'],
                  [
                    'none',
                    ['==', 'kind_detail', 'village'],
                    ['==', 'kind_detail', 'hamlet'],
                    ['==', 'kind_detail', 'isolated_dwelling'],
                    ['==', 'kind_detail', 'farm'],
                    ['==', 'kind_detail', 'scientific_station'],
                  ],
                ]
              : layer.filter,
          layout: {
            ...(layer.layout ?? {}),
            'icon-image': '',
            'text-field': localizedTextField ?? layer.layout?.['text-field'],
            'text-size':
              layer.id === 'places_country'
                ? ['interpolate', ['linear'], ['zoom'], 4, 14, 8, 22, 12, 28]
                : layer.id === 'places_locality'
                  ? [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      8,
                      ['case', ['==', ['get', 'kind_detail'], 'city'], 23.4, 13],
                      12,
                      ['case', ['==', ['get', 'kind_detail'], 'city'], 32.4, 19],
                      18,
                      ['case', ['==', ['get', 'kind_detail'], 'city'], 50.4, 29],
                    ]
                  : layer.layout?.['text-size'],
            'text-transform': 'uppercase',
          },
          paint: {
            ...(layer.paint ?? {}),
            'text-color': NEORGANGE_TEXT_WHITE_SOLID,
            'text-halo-blur': 0,
            'text-halo-color': 'rgba(255,255,255,0.2)',
            'text-halo-width': 0.35,
          },
        }
      default:
        return layer
    }
  })

  const layersWithGlow: NonNullable<StyleSpecification['layers']> = []

  for (const layer of style.layers) {
    if (GLOW_LABEL_LAYER_IDS.has(layer.id) && layer.type === 'symbol' && !noLabels) {
      layersWithGlow.push(createGlowLabelLayer(layer))
    }

    if (layer.id === 'places_locality' && layer.type === 'symbol' && !noLabels) {
      layersWithGlow.push(layer)
      const detailLocalityLayer = createDetailLocalityLayer(layer)
      layersWithGlow.push(createGlowLabelLayer(detailLocalityLayer))
      layersWithGlow.push(detailLocalityLayer)
      const minorLocalityLayer = createMinorLocalityLayer(layer)
      layersWithGlow.push(createGlowLabelLayer(minorLocalityLayer))
      layersWithGlow.push(minorLocalityLayer)
      continue
    }

    layersWithGlow.push(layer)
  }

  if (!layersWithGlow.some(layer => layer.id === 'buildings_outline')) {
    const buildingLayerIndex = layersWithGlow.findIndex(
      layer => layer.id === 'buildings',
    )
    const outlineLayer = createBuildingOutlineLayer()

    if (buildingLayerIndex >= 0) {
      layersWithGlow.splice(buildingLayerIndex + 1, 0, outlineLayer)
    } else {
      layersWithGlow.push(outlineLayer)
    }
  }

  style.layers = layersWithGlow

  return style
}

export const buildNeorgangeStyle = ({
  noLabels = false,
  locale = 'en',
}: StyleBuildOptions = {}): StyleSpecification => {
  const style = buildNamedProtomapsStyle('dark', { locale })

  applyNeorgangeThemeToProtomaps(style, noLabels, locale)

  return noLabels ? hideSymbolLayers(style) : style
}
