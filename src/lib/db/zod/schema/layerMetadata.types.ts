// TYPES
import type { MapStyleKey } from '#lib/map/styles/registry.js'

/** Absent style inherits the project; null explicitly follows the user's map preference. */
export type LayerMetadata = {
  mapStyleCode?: MapStyleKey | null
  [key: string]: unknown
}
