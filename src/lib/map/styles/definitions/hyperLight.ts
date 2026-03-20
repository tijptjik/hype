import type { StyleSpecification } from 'maplibre-gl'

import { buildNamedProtomapsStyle, type StyleBuildOptions } from './common'

const withName = (style: StyleSpecification, name: string): StyleSpecification => {
  style.name = name
  style.metadata = {
    ...(style.metadata ?? {}),
    'hype:style-variant': name,
  }

  return style
}

export const buildHyperLightStyle = (
  options: StyleBuildOptions = {},
): StyleSpecification =>
  withName(buildNamedProtomapsStyle('light', options), 'Hyper Light')
