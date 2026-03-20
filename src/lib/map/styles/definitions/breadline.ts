import type { StyleSpecification } from 'maplibre-gl'

import type { StyleBuildOptions } from './common'
import { buildHyperStyle } from './hyper'

export const buildBreadlineStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildHyperStyle(options)

  return {
    ...style,
    name: 'Breadline',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Breadline',
    },
  }
}
