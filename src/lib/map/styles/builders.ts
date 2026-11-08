import { buildNoclit25Style } from './definitions/noclit25'
import { buildNoclit26Style } from './definitions/noclit26'
import { buildMidnightStyle } from './definitions/midnight'
import { buildBreadlineDarkStyle } from './definitions/breadlineDark'
import { buildBreadlineLightStyle } from './definitions/breadlineLight'
import { buildQuercusStyle } from './definitions/quercus'
import { buildGhosteryStyle } from './definitions/ghostery'
import { buildHyperStyle } from './definitions/hyper'
import { buildHyperLightStyle } from './definitions/hyperLight'
import { buildHyperAdminStyle } from './definitions/hyperAdmin'
import { buildHyperpopStyle } from './definitions/hyperpop'
import { buildneorangeStyle } from './definitions/neorange'
import { buildGenesisStyle } from './definitions/genesis'
import { buildRosepunkStyle } from './definitions/rosepunk'
import { buildSinStyle } from './definitions/sin'
import { buildProtomapsFlavorStyle } from './definitions/protomaps'
import type { StyleBuildOptions } from './definitions/common'
import type { MapStyleCatalogKey } from './catalog'
import type { StyleSpecification } from 'maplibre-gl'

// Loaded by map rendering and asset generation, never by catalogue-only controls.
export const MAP_STYLE_BUILDERS: Record<
  MapStyleCatalogKey,
  (options?: StyleBuildOptions) => StyleSpecification
> = {
  noclit25: buildNoclit25Style,
  noclit26: buildNoclit26Style,
  'hype-dark': buildHyperStyle,
  'hype-light': buildHyperLightStyle,
  hyperpop: buildHyperpopStyle,
  ghostery: buildGhosteryStyle,
  neorange: buildneorangeStyle,
  genesis: buildGenesisStyle,
  sin: buildSinStyle,
  rosepunk: buildRosepunkStyle,
  'breadline-light': buildBreadlineLightStyle,
  'breadline-dark': buildBreadlineDarkStyle,
  quercus: buildQuercusStyle,
  midnight: buildMidnightStyle,
  hyperAdmin: buildHyperAdminStyle,
  'protomaps-light': options => buildProtomapsFlavorStyle('light', options),
  'protomaps-dark': options => buildProtomapsFlavorStyle('dark', options),
  'protomaps-white': options => buildProtomapsFlavorStyle('white', options),
  'protomaps-grayscale': options => buildProtomapsFlavorStyle('grayscale', options),
  'protomaps-black': options => buildProtomapsFlavorStyle('black', options),
}
