import { buildNoclit26Style } from './definitions/noclit26'
import { buildMidnightStyle } from './definitions/midnight'
import { buildBreadlineDarkStyle } from './definitions/breadlineDark'
import { buildBreadlineLightStyle } from './definitions/breadlineLight'
import { buildBreadlineStyle } from './definitions/breadline'
import { buildGhosteryStyle } from './definitions/ghostery'
import { buildGhosteryLegacyStyle } from './definitions/ghostery-legacy'
import { buildHyperStyle } from './definitions/hyper'
import { buildHyperLightStyle } from './definitions/hyperLight'
import { buildHyperAdminStyle } from './definitions/hyperAdmin'
import { buildHyperpopStyle } from './definitions/hyperpop'
import { buildNeonmasterStyle } from './definitions/neonmaster'
import { buildneorangeStyle } from './definitions/neorange'
import { buildGenesisStyle } from './definitions/genesis'
import { buildRosepunkStyle } from './definitions/rosepunk'
import { buildSinStyle } from './definitions/sin'
import {
  NAMED_PROTOMAPS_FLAVORS,
  type MapStyleDefinition,
  type NamedProtomapsFlavor,
  type MapStyleVariant,
} from './definitions/common'
import { buildProtomapsFlavorStyle } from './definitions/protomaps'
import { getMapStyleCatalogCopy } from './i18n'

/** Keys available in the map-style catalog, including the internal admin style. */
export type MapStyleCatalogKey =
  | 'hyper'
  | 'hyperLight'
  | 'hyperpop'
  | 'ghostery'
  | 'ghostery-legacy'
  | 'neonmaster'
  | 'neorange'
  | 'genesis'
  | 'sin'
  | 'rosepunk'
  | 'breadline'
  | 'breadline-light'
  | 'breadline-dark'
  | 'midnight'
  | 'noclit26'
  | 'protomaps-light'
  | 'protomaps-dark'
  | 'protomaps-white'
  | 'protomaps-grayscale'
  | 'protomaps-black'
  | 'hyperAdmin'

/** Visual treatment applied to image or dot markers for a map palette. */
export type MapMarkerTheme =
  | 'light'
  | 'dark'
  | 'ghostery'
  | 'hyperpop'
  | 'neon'
  | 'rosepunk'
  | 'etch-dark'
  | 'etch-light'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CATALOG TYPES
//    - MapStyleCatalogEntry
//
// 2. CATALOG ENTRIES
//    - MAP_STYLE_CATALOG
//    - REGISTERED_MAP_STYLE_CATALOG
//    - getDefaultMapStyleCatalogEntry

export type MapStyleCatalogEntry<TCode extends string = string> = Omit<
  MapStyleDefinition<TCode>,
  'label' | 'description'
> & {
  name: string
  description: string
  register?: boolean
  selectable?: boolean
  default?: boolean
  bundledPreviewPath?: string
  projectCode?: string | null
  hubCode?: string | null
  organisationCode?: string | null
  basemapVariant: MapStyleVariant | null
  markerTheme: MapMarkerTheme
  showSymbols: boolean
}

// Derive the Protomaps family from one flavor list so metadata stays consistent across entries.
const PROTOMAPS_FLAVOR_ENTRIES: ReadonlyArray<
  MapStyleCatalogEntry<MapStyleCatalogKey>
> = NAMED_PROTOMAPS_FLAVORS.map(flavorName => ({
  key: `protomaps-${flavorName}` as MapStyleCatalogKey,
  name: getMapStyleCatalogCopy(`protomaps-${flavorName}` as MapStyleCatalogKey, 'en')
    .name,
  description: getMapStyleCatalogCopy(
    `protomaps-${flavorName}` as MapStyleCatalogKey,
    'en',
  ).description,
  buildStyle: options =>
    buildProtomapsFlavorStyle(flavorName as NamedProtomapsFlavor, options),
  basemapVariant: flavorName as MapStyleVariant,
  markerTheme:
    flavorName === 'light' || flavorName === 'white'
      ? 'light'
      : flavorName === 'dark' || flavorName === 'black'
        ? 'dark'
        : 'ghostery',
  showSymbols: flavorName === 'light' || flavorName === 'dark',
}))

export const MAP_STYLE_CATALOG = [
  {
    key: 'noclit26',
    ...getMapStyleCatalogCopy('noclit26', 'en'),
    buildStyle: buildNoclit26Style,
    projectCode: 'eln',
    bundledPreviewPath: '/mapStylePreviews/noclit26.png',
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
  {
    key: 'hyper',
    name: getMapStyleCatalogCopy('hyper', 'en').name,
    description: getMapStyleCatalogCopy('hyper', 'en').description,
    buildStyle: buildHyperStyle,
    basemapVariant: 'dark',
    markerTheme: 'etch-dark',
    showSymbols: true,
  },
  {
    key: 'hyperLight',
    name: getMapStyleCatalogCopy('hyperLight', 'en').name,
    description: getMapStyleCatalogCopy('hyperLight', 'en').description,
    buildStyle: buildHyperLightStyle,
    basemapVariant: 'light',
    markerTheme: 'etch-light',
    showSymbols: true,
  },
  {
    key: 'hyperpop',
    name: getMapStyleCatalogCopy('hyperpop', 'en').name,
    description: getMapStyleCatalogCopy('hyperpop', 'en').description,
    buildStyle: buildHyperpopStyle,
    basemapVariant: 'dark',
    markerTheme: 'hyperpop',
    showSymbols: true,
  },
  {
    key: 'ghostery',
    name: getMapStyleCatalogCopy('ghostery', 'en').name,
    description: getMapStyleCatalogCopy('ghostery', 'en').description,
    buildStyle: buildGhosteryStyle,
    default: true,
    hubCode: 'hkghostsigns',
    basemapVariant: 'dark',
    markerTheme: 'ghostery',
    showSymbols: true,
  },
  {
    key: 'ghostery-legacy',
    selectable: false,
    name: getMapStyleCatalogCopy('ghostery-legacy', 'en').name,
    description: getMapStyleCatalogCopy('ghostery-legacy', 'en').description,
    buildStyle: buildGhosteryLegacyStyle,
    hubCode: 'hkghostsigns',
    basemapVariant: null,
    markerTheme: 'ghostery',
    showSymbols: false,
  },
  {
    key: 'neonmaster',
    selectable: false,
    name: getMapStyleCatalogCopy('neonmaster', 'en').name,
    description: getMapStyleCatalogCopy('neonmaster', 'en').description,
    buildStyle: buildNeonmasterStyle,
    basemapVariant: 'dark',
    markerTheme: 'neon',
    showSymbols: true,
  },
  {
    key: 'neorange',
    name: getMapStyleCatalogCopy('neorange', 'en').name,
    description: getMapStyleCatalogCopy('neorange', 'en').description,
    buildStyle: buildneorangeStyle,
    basemapVariant: 'dark',
    markerTheme: 'neon',
    showSymbols: true,
  },
  {
    key: 'genesis',
    selectable: false,
    name: getMapStyleCatalogCopy('genesis', 'en').name,
    description: getMapStyleCatalogCopy('genesis', 'en').description,
    buildStyle: buildGenesisStyle,
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
  {
    key: 'sin',
    selectable: false,
    name: getMapStyleCatalogCopy('sin', 'en').name,
    description: getMapStyleCatalogCopy('sin', 'en').description,
    buildStyle: buildSinStyle,
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
  {
    key: 'rosepunk',
    selectable: false,
    name: getMapStyleCatalogCopy('rosepunk', 'en').name,
    description: getMapStyleCatalogCopy('rosepunk', 'en').description,
    buildStyle: buildRosepunkStyle,
    basemapVariant: 'dark',
    markerTheme: 'rosepunk',
    showSymbols: true,
  },
  {
    key: 'breadline',
    selectable: false,
    name: getMapStyleCatalogCopy('breadline', 'en').name,
    description: getMapStyleCatalogCopy('breadline', 'en').description,
    buildStyle: buildBreadlineStyle,
    hubCode: 'breadline',
    basemapVariant: 'light',
    markerTheme: 'light',
    showSymbols: true,
  },
  {
    key: 'breadline-light',
    name: getMapStyleCatalogCopy('breadline-light', 'en').name,
    description: getMapStyleCatalogCopy('breadline-light', 'en').description,
    buildStyle: buildBreadlineLightStyle,
    hubCode: 'breadline',
    basemapVariant: 'light',
    markerTheme: 'light',
    showSymbols: true,
  },
  {
    key: 'breadline-dark',
    ...getMapStyleCatalogCopy('breadline-dark', 'en'),
    buildStyle: buildBreadlineDarkStyle,
    hubCode: 'breadline',
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
  {
    key: 'midnight',
    ...getMapStyleCatalogCopy('midnight', 'en'),
    buildStyle: buildMidnightStyle,
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
  ...PROTOMAPS_FLAVOR_ENTRIES,
  {
    key: 'hyperAdmin',
    name: getMapStyleCatalogCopy('hyperAdmin', 'en').name,
    description: getMapStyleCatalogCopy('hyperAdmin', 'en').description,
    buildStyle: buildHyperAdminStyle,
    register: false,
    basemapVariant: 'dark',
    markerTheme: 'dark',
    showSymbols: true,
  },
] as const satisfies ReadonlyArray<MapStyleCatalogEntry>

export const REGISTERED_MAP_STYLE_CATALOG = MAP_STYLE_CATALOG.filter(
  (
    entry,
  ): entry is (typeof MAP_STYLE_CATALOG)[number] & { register?: true | undefined } =>
    !('register' in entry) || entry.register !== false,
) as ReadonlyArray<MapStyleCatalogEntry<MapStyleCatalogKey>>

/**
 * Resolves the default built-in map-style catalog entry.
 *
 * @returns Default catalog entry, falling back to the first registered style.
 */
export const getDefaultMapStyleCatalogEntry =
  (): MapStyleCatalogEntry<MapStyleCatalogKey> =>
    REGISTERED_MAP_STYLE_CATALOG.find(entry => entry.default) ??
    REGISTERED_MAP_STYLE_CATALOG[0]

/** Default map choices in the settings panel, in presentation order. */
export const FEATURED_MAP_STYLE_KEYS = [
  'hyper',
  'hyperLight',
  'breadline-light',
  'breadline-dark',
  'hyperpop',
  'midnight',
] as const satisfies readonly MapStyleCatalogKey[]

/**
 * Checks whether a style should be offered for a new map selection.
 * @param key - Built-in catalog key or an application-owned custom style code.
 * @returns False for retired picker options; true for current or custom styles.
 * @remarks Retired styles stay registered so existing saved selections still render.
 */
export const isMapStyleSelectable = (key: string): boolean =>
  REGISTERED_MAP_STYLE_CATALOG.find(entry => entry.key === key)?.selectable !== false

/** Built-in styles offered by theme and project style pickers. */
export const SELECTABLE_MAP_STYLE_CATALOG = REGISTERED_MAP_STYLE_CATALOG.filter(entry =>
  isMapStyleSelectable(entry.key),
)

/**
 * Identifies styles that must only be offered through their owning project.
 * @param key - Built-in or custom map style code.
 * @returns Whether the catalog restricts the style to a project.
 */
export const isProjectOnlyMapStyle = (key: string): boolean =>
  Boolean(REGISTERED_MAP_STYLE_CATALOG.find(entry => entry.key === key)?.projectCode)
