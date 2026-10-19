import type { CardStyleCode } from '#lib/features/cardStyle.js'
// TYPES
import type { MapStyleKey } from '#lib/map/styles/registry.js'

/** Absent style inherits the project; null explicitly follows the user's map preference. */
export type LayerMetadata = {
  /** Null or absent inherits the project card style. */
  cardStyleCode?: CardStyleCode | null
  mapStyleCode?: MapStyleKey | null
  [key: string]: unknown
}
