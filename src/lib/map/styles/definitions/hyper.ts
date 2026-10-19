// MAP
import { buildEtchStyle } from './etch'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { StyleBuildOptions } from './common'

/**
 * Builds the Hyper Dark basemap in the Nullspace palette.
 * @param options - Locale and label visibility preferences.
 * @returns The selected Etch composition with fine footprints and no POIs.
 */
export const buildHyperStyle = (options: StyleBuildOptions = {}): StyleSpecification =>
  buildEtchStyle('dark', options)
