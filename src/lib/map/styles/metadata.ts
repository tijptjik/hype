// CATALOGUE
import {
  MAP_STYLE_CATALOG,
  REGISTERED_MAP_STYLE_CATALOG,
  getDefaultMapStyleCatalogEntry,
} from './catalog'
// TYPES
import type { MapStyleCatalogEntry, MapStyleCatalogKey } from './catalog'

export const MAP_STYLE_KEYS = REGISTERED_MAP_STYLE_CATALOG.map(
  definition => definition.key,
) as Array<(typeof REGISTERED_MAP_STYLE_CATALOG)[number]['key']>

export type MapStyleKey = (typeof REGISTERED_MAP_STYLE_CATALOG)[number]['key']

/** Checks a persisted or selected key against registered styles.
 * @param value Candidate style key. @returns Whether the key is registered.
 */
export const isMapStyleKey = (value: string): value is MapStyleKey =>
  MAP_STYLE_KEYS.includes(value as MapStyleKey)

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
export const listMapStyleCatalog = (): ReadonlyArray<
  MapStyleCatalogEntry<MapStyleCatalogKey>
> => MAP_STYLE_CATALOG
