import {
  getDefaultMapStyleCatalogEntry,
  MAP_STYLE_CATALOG,
  REGISTERED_MAP_STYLE_CATALOG,
  type MapStyleCatalogEntry,
} from './catalog'
import { applySpriteVariant, type MapStyleDefinition } from './definitions/common'
// TYPES
import type { StyleSpecification } from 'maplibre-gl'
import type { Locale } from '../../types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. REGISTRY LOOKUPS
//    - MAP_STYLE_KEYS
//    - isMapStyleKey
//    - listMapStyleDefinitions
//    - getMapStyleDefinition
//    - getDefaultMapStyleKey
//    - listMapStyleCatalog
//
// 2. STYLE / ASSET BUILDING
//    - buildMapStyle
//    - getMapStyleAssetRecord
//    - listMapStyleAssetRecords

const REGISTERED_MAP_STYLE_DEFINITIONS = REGISTERED_MAP_STYLE_CATALOG.map(entry => ({
  key: entry.key,
  label: entry.name,
  description: entry.description,
  basemapVariant: entry.basemapVariant,
  showSymbols: entry.showSymbols,
  buildStyle: entry.buildStyle,
})) as Array<MapStyleDefinition<(typeof REGISTERED_MAP_STYLE_CATALOG)[number]['key']>>

export const MAP_STYLE_KEYS = REGISTERED_MAP_STYLE_DEFINITIONS.map(
  definition => definition.key,
) as Array<(typeof REGISTERED_MAP_STYLE_DEFINITIONS)[number]['key']>

export type MapStyleKey = (typeof REGISTERED_MAP_STYLE_DEFINITIONS)[number]['key']

const MAP_STYLE_DEFINITIONS = Object.fromEntries(
  REGISTERED_MAP_STYLE_DEFINITIONS.map(definition => [definition.key, definition]),
) as Record<MapStyleKey, (typeof REGISTERED_MAP_STYLE_DEFINITIONS)[number]>

const toHash = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const isMapStyleKey = (value: string): value is MapStyleKey =>
  MAP_STYLE_KEYS.includes(value as MapStyleKey)

/**
 * Lists registered built-in map-style definitions.
 *
 * @returns Shallow copy of the registered definition list.
 */
export const listMapStyleDefinitions = (): MapStyleDefinition<MapStyleKey>[] => [
  ...REGISTERED_MAP_STYLE_DEFINITIONS,
]

/**
 * Resolves one registered map-style definition by key.
 *
 * @param key - Registered map-style key.
 * @returns Map-style definition for the requested key.
 */
export const getMapStyleDefinition = (
  key: MapStyleKey,
): MapStyleDefinition<MapStyleKey> => MAP_STYLE_DEFINITIONS[key]

/**
 * Resolves the default registered map-style key.
 *
 * @returns Default map-style key.
 */
export const getDefaultMapStyleKey = (): MapStyleKey =>
  getDefaultMapStyleCatalogEntry().key as MapStyleKey

/**
 * Lists the full map-style catalog, including non-registered entries.
 *
 * @returns Immutable map-style catalog.
 */
export const listMapStyleCatalog = (): ReadonlyArray<MapStyleCatalogEntry> =>
  MAP_STYLE_CATALOG

/**
 * Builds one runtime style specification for the requested key.
 *
 * @param key - Registered map-style key.
 * @param options - Optional runtime build options.
 * @returns Built style specification with variant/symbol behavior applied.
 */
export const buildMapStyle = (
  key: MapStyleKey,
  options?: {
    noLabels?: boolean
    locale?: Locale
  },
): StyleSpecification => {
  const definition = getMapStyleDefinition(key)
  return applySpriteVariant(definition.buildStyle(options), {
    basemapVariant: definition.basemapVariant,
    showSymbols: definition.showSymbols,
  })
}

export type MapStyleAssetRecord = {
  key: MapStyleKey
  label: string
  description: string
  hash: string
  fileName: string
  publicPath: string
  json: string
  style: StyleSpecification
}

/**
 * Builds one immutable JSON asset record for the requested map style.
 *
 * @param key - Registered map-style key.
 * @returns Asset record containing hashed JSON and public-path metadata.
 */
export const getMapStyleAssetRecord = async (
  key: MapStyleKey,
): Promise<MapStyleAssetRecord> => {
  const definition = getMapStyleDefinition(key)
  const style = applySpriteVariant(definition.buildStyle(), {
    basemapVariant: definition.basemapVariant,
    showSymbols: definition.showSymbols,
  })
  const json = `${JSON.stringify(style, null, 2)}\n`
  const hash = await toHash(json)
  const shortHash = hash.slice(0, 12)
  const fileName = `${key}.${shortHash}.json`

  return {
    key,
    label: definition.label,
    description: definition.description,
    hash,
    fileName,
    publicPath: `/mapStyles/${fileName}`,
    json,
    style,
  }
}

/**
 * Builds immutable asset records for every registered map style.
 *
 * @returns Asset records for all registered map styles.
 */
export const listMapStyleAssetRecords = async (): Promise<MapStyleAssetRecord[]> =>
  await Promise.all(MAP_STYLE_KEYS.map(getMapStyleAssetRecord))
