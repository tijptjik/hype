import type { StyleSpecification } from 'maplibre-gl'

import { buildGenesisStyle } from './genesis'
import type { StyleBuildOptions } from './common'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PALETTE
// 2. LAYER TRANSFORMATION
// 3. STYLE BUILDER

type StyleLayer = NonNullable<StyleSpecification['layers']>[number]

const SIN_VOID = '#25183F'
const SIN_EARTH = '#191432'
const SIN_HARBOUR = '#102C66'
const SIN_BUILDING = '#151A47'
const SIN_PARK = '#755889'
const SIN_ROAD_ORANGE = '#FF785B'
const SIN_ROAD_PINK = '#F26C97'
const SIN_ROAD_BLUE = '#627FDA'
const SIN_ROAD_PEACH = '#FFA45C'
const SIN_ROAD_BLOOM = '#8F376E'
const SIN_LABEL = '#FFD6E7'
const SIN_PLACE_LABEL = '#B8C8FF'

/**
 * Applies the calmer Sin palette while retaining Genesis's road-layer hierarchy.
 *
 * @param style - Mutable Genesis-derived style specification.
 * @returns The restyled MapLibre specification.
 */
const applySinPalette = (style: StyleSpecification): StyleSpecification => {
  if (!style.layers) return style

  // Restrain large surfaces first, leaving the existing road widths and glow placement intact.
  style.layers = style.layers.map(layer => {
    const paint = layer.paint ?? {}

    if (layer.id.includes('_casing')) {
      return {
        ...layer,
        paint: {
          ...paint,
          'line-color': SIN_ROAD_BLOOM,
          'line-opacity': layer.id.includes('minor') ? 0.07 : 0.14,
          'line-blur': layer.id.includes('highway') ? 3.6 : 3,
        },
      }
    }

    if (
      layer.id === 'roads_highway' ||
      layer.id === 'roads_bridges_highway' ||
      layer.id === 'roads_tunnels_highway'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': SIN_ROAD_PEACH } }
    }

    if (
      layer.id === 'roads_major' ||
      layer.id === 'roads_bridges_major' ||
      layer.id === 'roads_tunnels_major'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': SIN_ROAD_PINK } }
    }

    if (
      layer.id === 'roads_minor' ||
      layer.id === 'roads_minor_service' ||
      layer.id === 'roads_bridges_minor' ||
      layer.id === 'roads_tunnels_minor'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': SIN_ROAD_BLUE } }
    }

    switch (layer.id) {
      case 'background':
        return { ...layer, paint: { ...paint, 'background-color': SIN_VOID } }
      case 'earth':
        return { ...layer, paint: { ...paint, 'fill-color': SIN_EARTH } }
      case 'water':
        return {
          ...layer,
          paint: {
            ...paint,
            'fill-color': SIN_HARBOUR,
            'fill-outline-color': 'rgba(139, 171, 255, 0.16)',
          },
        }
      case 'water_stream':
      case 'water_river':
        return {
          ...layer,
          paint: { ...paint, 'line-color': '#7095EE', 'line-opacity': 0.38 },
        }
      case 'landuse_park':
      case 'landuse_urban_green':
      case 'landuse_zoo':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': SIN_PARK, 'fill-opacity': 0.34 },
        }
      case 'landuse_school':
      case 'landuse_hospital':
      case 'landuse_industrial':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': '#4B356C', 'fill-opacity': 0.3 },
        }
      case 'landuse_beach':
      case 'landuse_pedestrian':
      case 'landuse_pier':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': '#B2587C', 'fill-opacity': 0.22 },
        }
      case 'buildings':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': SIN_BUILDING, 'fill-opacity': 0.78 },
        }
      case 'buildings_outline':
        return {
          ...layer,
          paint: {
            ...paint,
            'line-color': [
              'interpolate',
              ['linear'],
              ['zoom'],
              16.5,
              'rgba(112, 149, 238, 0.08)',
              18,
              'rgba(112, 149, 238, 0.32)',
              20,
              'rgba(112, 149, 238, 0.72)',
            ],
            'line-blur': 0.15,
          },
        }
      case 'roads_rail':
        return {
          ...layer,
          paint: { ...paint, 'line-color': '#5778DD', 'line-opacity': 0.68 },
        }
      case 'roads_other':
      case 'roads_runway':
      case 'roads_taxiway':
        return {
          ...layer,
          paint: { ...paint, 'line-color': '#6C63B8', 'line-opacity': 0.42 },
        }
      case 'roads_labels_major':
      case 'roads_labels_minor':
        return {
          ...layer,
          paint: {
            ...paint,
            'text-color': SIN_LABEL,
            'text-halo-color': 'rgba(37, 24, 63, 0.9)',
            'text-halo-width': 0.55,
          },
        }
      case 'roads_labels_major__glow':
      case 'roads_labels_minor__glow':
        return {
          ...layer,
          paint: {
            ...paint,
            'text-color': 'rgba(255, 150, 190, 0.2)',
            'text-halo-color': 'rgba(242, 108, 151, 0.48)',
            'text-halo-width': 1.35,
            'text-halo-blur': 1.7,
          },
        }
      case 'places_locality':
      case 'places_region':
      case 'places_subplace':
      case 'places_country':
        return {
          ...layer,
          paint: {
            ...paint,
            'text-color': SIN_PLACE_LABEL,
            'text-halo-color': 'rgba(37, 24, 63, 0.92)',
            'text-halo-width': 0.6,
          },
        }
      default:
        if (layer.id.endsWith('__glow')) {
          return {
            ...layer,
            paint: {
              ...paint,
              'text-color': 'rgba(145, 168, 255, 0.16)',
              'text-halo-color': 'rgba(112, 149, 238, 0.42)',
              'text-halo-width': 1.3,
              'text-halo-blur': 1.6,
            },
          }
        }
        return layer
    }
  })

  return style
}

/**
 * Builds the Sin MapLibre style.
 *
 * @param options - Optional locale and label visibility controls.
 * @returns Calmer Hong Kong MapLibre style specification.
 */
export const buildSinStyle = (options: StyleBuildOptions = {}): StyleSpecification =>
  applySinPalette(buildGenesisStyle(options))
