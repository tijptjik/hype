import type { StyleSpecification } from 'maplibre-gl'

import type { StyleBuildOptions } from './common'
import { buildGenesisStyle } from './genesis'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PALETTE
// 2. LAYER TRANSFORMATION
// 3. STYLE BUILDER

const ROSEPUNK_VOID = '#08080C'
const ROSEPUNK_EARTH = '#191724'
const ROSEPUNK_SURFACE = '#1F1D2E'
const ROSEPUNK_SELECTION = '#26233A'
const ROSEPUNK_MUTED = '#555169'
const ROSEPUNK_TEXT = '#ECEBEF'
const ROSEPUNK_ROSE = '#EB6F92'
const ROSEPUNK_AMBER = '#F6C177'
const ROSEPUNK_BLUSH = '#F4B7B5'
const ROSEPUNK_TEAL = '#31748F'
const ROSEPUNK_CYAN = '#9CCFD8'
const ROSEPUNK_BLUE = '#7188FF'
const ROSEPUNK_PINK = '#FF53A6'
const ROSEPUNK_BRIGHT_PINK = '#E56EA1'

/**
 * Applies the Rosé Punk palette to Genesis's glowing road hierarchy.
 *
 * @param style - Mutable Genesis-derived style specification.
 * @returns The restyled MapLibre specification.
 */
const applyRosepunkPalette = (style: StyleSpecification): StyleSpecification => {
  if (!style.layers) return style

  // Recolour broad surfaces first so the theme's road and label accents remain legible.
  style.layers = style.layers.map(layer => {
    const paint = layer.paint ?? {}

    if (layer.id.includes('_casing')) {
      return {
        ...layer,
        paint: {
          ...paint,
          'line-color': ROSEPUNK_PINK,
          'line-opacity': layer.id.includes('minor') ? 0.08 : 0.17,
          'line-blur': layer.id.includes('highway') ? 4.2 : 3.5,
        },
      }
    }

    if (
      layer.id === 'roads_highway' ||
      layer.id === 'roads_bridges_highway' ||
      layer.id === 'roads_tunnels_highway'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': ROSEPUNK_AMBER } }
    }

    if (
      layer.id === 'roads_major' ||
      layer.id === 'roads_bridges_major' ||
      layer.id === 'roads_tunnels_major'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': ROSEPUNK_ROSE } }
    }

    if (
      layer.id === 'roads_minor' ||
      layer.id === 'roads_minor_service' ||
      layer.id === 'roads_bridges_minor' ||
      layer.id === 'roads_tunnels_minor'
    ) {
      return { ...layer, paint: { ...paint, 'line-color': ROSEPUNK_BLUE } }
    }

    switch (layer.id) {
      case 'background':
        return { ...layer, paint: { ...paint, 'background-color': ROSEPUNK_VOID } }
      case 'earth':
        return { ...layer, paint: { ...paint, 'fill-color': ROSEPUNK_EARTH } }
      case 'water':
        return {
          ...layer,
          paint: {
            ...paint,
            'fill-color': ROSEPUNK_TEAL,
            'fill-outline-color': 'rgba(156, 207, 216, 0.2)',
          },
        }
      case 'water_stream':
      case 'water_river':
        return {
          ...layer,
          paint: { ...paint, 'line-color': ROSEPUNK_CYAN, 'line-opacity': 0.42 },
        }
      case 'landuse_park':
      case 'landuse_urban_green':
      case 'landuse_zoo':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': ROSEPUNK_TEAL, 'fill-opacity': 0.32 },
        }
      case 'landuse_school':
      case 'landuse_hospital':
      case 'landuse_industrial':
        return {
          ...layer,
          paint: {
            ...paint,
            'fill-color': ROSEPUNK_SELECTION,
            'fill-opacity': 0.54,
          },
        }
      case 'landuse_beach':
      case 'landuse_pedestrian':
      case 'landuse_pier':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': ROSEPUNK_BLUSH, 'fill-opacity': 0.19 },
        }
      case 'buildings':
        return {
          ...layer,
          paint: { ...paint, 'fill-color': ROSEPUNK_SURFACE, 'fill-opacity': 0.84 },
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
              'rgba(156, 207, 216, 0.1)',
              18,
              'rgba(156, 207, 216, 0.4)',
              20,
              'rgba(156, 207, 216, 0.82)',
            ],
            'line-blur': 0.18,
          },
        }
      case 'roads_rail':
        return {
          ...layer,
          paint: { ...paint, 'line-color': ROSEPUNK_BRIGHT_PINK, 'line-opacity': 0.72 },
        }
      case 'roads_other':
      case 'roads_runway':
      case 'roads_taxiway':
        return {
          ...layer,
          paint: { ...paint, 'line-color': ROSEPUNK_MUTED, 'line-opacity': 0.48 },
        }
      case 'roads_labels_major':
      case 'roads_labels_minor':
        return {
          ...layer,
          paint: {
            ...paint,
            'text-color': ROSEPUNK_TEXT,
            'text-halo-color': 'rgba(25, 23, 36, 0.92)',
            'text-halo-width': 0.55,
          },
        }
      case 'roads_labels_major__glow':
      case 'roads_labels_minor__glow':
        return {
          ...layer,
          paint: {
            ...paint,
            'text-color': 'rgba(255, 83, 166, 0.18)',
            'text-halo-color': 'rgba(235, 111, 146, 0.52)',
            'text-halo-width': 1.35,
            'text-halo-blur': 1.75,
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
            'text-color': ROSEPUNK_BLUSH,
            'text-halo-color': 'rgba(25, 23, 36, 0.94)',
            'text-halo-width': 0.6,
          },
        }
      default:
        if (layer.id.endsWith('__glow')) {
          return {
            ...layer,
            paint: {
              ...paint,
              'text-color': 'rgba(229, 110, 161, 0.16)',
              'text-halo-color': 'rgba(255, 83, 166, 0.44)',
              'text-halo-width': 1.3,
              'text-halo-blur': 1.65,
            },
          }
        }
        return layer
    }
  })

  return style
}

/**
 * Builds the Rosé Punk MapLibre style.
 *
 * @param options - Optional locale and label visibility controls.
 * @returns Rosé Punk Hong Kong MapLibre style specification.
 */
export const buildRosepunkStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = applyRosepunkPalette(buildGenesisStyle(options))

  return {
    ...style,
    name: 'Rosé Punk',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Rosé Punk',
    },
  }
}
