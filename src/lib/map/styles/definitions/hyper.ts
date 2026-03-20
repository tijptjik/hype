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

export const buildHyperStyle = (options: StyleBuildOptions = {}): StyleSpecification =>
  withName(buildNamedProtomapsStyle('dark', options), 'Hyper')
