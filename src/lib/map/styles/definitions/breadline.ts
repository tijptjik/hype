import type { StyleSpecification } from 'maplibre-gl'

import type { StyleBuildOptions } from './common'
import { buildHyperLightStyle } from './hyperLight'

export const buildBreadlineStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildHyperLightStyle(options)

  return {
    ...style,
    name: 'Breadline',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Breadline',
    },
  }
}
