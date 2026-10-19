import type { StyleSpecification } from 'maplibre-gl'

import { buildNamedProtomapsStyle, type StyleBuildOptions } from './common'

/**
 * Builds the legacy Breadline map independently of the current Hyper art direction.
 * @param options - Locale and label visibility preferences.
 * @returns The original light basemap retained for saved Breadline Classic selections.
 */
export const buildBreadlineStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildNamedProtomapsStyle('light', options)

  return {
    ...style,
    name: 'Breadline',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Breadline',
    },
  }
}
