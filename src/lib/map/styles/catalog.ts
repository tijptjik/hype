import { buildBreadlineStyle } from './definitions/breadline'
import { buildGhosteryStyle } from './definitions/ghostery'
import { buildGhosteryLegacyStyle } from './definitions/ghostery-legacy'
import { buildHyperStyle } from './definitions/hyper'
import { buildHyperLightStyle } from './definitions/hyperLight'
import { buildHyperAdminStyle } from './definitions/hyperAdmin'
import { buildNeonmasterStyle } from './definitions/neonmaster'
import { buildNeorgangeStyle } from './definitions/neorgange'
import {
  NAMED_PROTOMAPS_FLAVORS,
  type MapStyleDefinition,
  type NamedProtomapsFlavor,
  type MapStyleVariant,
} from './definitions/common'
import { buildProtomapsFlavorStyle } from './definitions/protomaps'
import { getMapStyleCatalogCopy } from './i18n'
import type { MapStyleCatalogKey } from '$lib/types'

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
  default?: boolean
  hubCode?: string | null
  organisationCode?: string | null
  basemapVariant: MapStyleVariant | null
  showSymbols: boolean
}

// Derive the Protomaps family from one flavor list so metadata stays consistent across entries.
const PROTOMAPS_FLAVOR_ENTRIES = NAMED_PROTOMAPS_FLAVORS.map(flavorName => ({
  key: `protomaps-${flavorName}`,
  name: getMapStyleCatalogCopy(`protomaps-${flavorName}` as MapStyleCatalogKey, 'en')
    .name,
  description: getMapStyleCatalogCopy(
    `protomaps-${flavorName}` as MapStyleCatalogKey,
    'en',
  ).description,
  buildStyle: options =>
    buildProtomapsFlavorStyle(flavorName as NamedProtomapsFlavor, options),
  basemapVariant: flavorName as MapStyleVariant,
  showSymbols: flavorName === 'light' || flavorName === 'dark',
})) satisfies ReadonlyArray<MapStyleCatalogEntry>

export const MAP_STYLE_CATALOG = [
  {
    key: 'hyper',
    name: getMapStyleCatalogCopy('hyper', 'en').name,
    description: getMapStyleCatalogCopy('hyper', 'en').description,
    buildStyle: buildHyperStyle,
    basemapVariant: 'dark',
    showSymbols: true,
  },
  {
    key: 'hyperLight',
    name: getMapStyleCatalogCopy('hyperLight', 'en').name,
    description: getMapStyleCatalogCopy('hyperLight', 'en').description,
    buildStyle: buildHyperLightStyle,
    basemapVariant: 'light',
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
    showSymbols: true,
  },
  {
    key: 'ghostery-legacy',
    name: getMapStyleCatalogCopy('ghostery-legacy', 'en').name,
    description: getMapStyleCatalogCopy('ghostery-legacy', 'en').description,
    buildStyle: buildGhosteryLegacyStyle,
    hubCode: 'hkghostsigns',
    basemapVariant: null,
    showSymbols: false,
  },
  {
    key: 'neonmaster',
    name: getMapStyleCatalogCopy('neonmaster', 'en').name,
    description: getMapStyleCatalogCopy('neonmaster', 'en').description,
    buildStyle: buildNeonmasterStyle,
    basemapVariant: 'dark',
    showSymbols: true,
  },
  {
    key: 'neorgange',
    name: getMapStyleCatalogCopy('neorgange', 'en').name,
    description: getMapStyleCatalogCopy('neorgange', 'en').description,
    buildStyle: buildNeorgangeStyle,
    basemapVariant: 'dark',
    showSymbols: true,
  },
  {
    key: 'breadline',
    name: getMapStyleCatalogCopy('breadline', 'en').name,
    description: getMapStyleCatalogCopy('breadline', 'en').description,
    buildStyle: buildBreadlineStyle,
    hubCode: 'breadline',
    basemapVariant: 'light',
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
    showSymbols: true,
  },
] as const satisfies ReadonlyArray<MapStyleCatalogEntry>

export type { MapStyleCatalogKey } from '$lib/types'

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
