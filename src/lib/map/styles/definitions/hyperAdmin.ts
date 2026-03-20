import type { StyleSpecification } from 'maplibre-gl'

import type { StyleBuildOptions } from './common'
import { buildHyperStyle } from './hyper'

export const buildHyperAdminStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification => {
  const style = buildHyperStyle(options)

  return {
    ...style,
    name: 'Hyper Admin',
    metadata: {
      ...(style.metadata ?? {}),
      'hype:style-variant': 'Hyper Admin',
    },
  }
}
