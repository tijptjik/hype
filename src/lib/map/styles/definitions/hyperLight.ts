// MAP
import { buildEtchStyle } from './etch'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Builds the Sketch basemap in the Oblivion palette.
 * @param options - Locale and label visibility preferences.
 * @returns The selected Etch composition with fine footprints and no POIs.
 */
export const buildHyperLightStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => buildEtchStyle('light', options)
