import type { StyleSpecification } from 'maplibre-gl'

import {
  buildNamedProtomapsStyle,
  type NamedProtomapsFlavor,
  type StyleBuildOptions,
} from './common'

export const buildProtomapsFlavorStyle = (
  flavorName: NamedProtomapsFlavor,
  options: StyleBuildOptions = {},
): StyleSpecification => buildNamedProtomapsStyle(flavorName, options)
