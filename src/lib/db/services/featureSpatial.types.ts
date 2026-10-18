// TYPES

/** Geographic membership for a bounded feature query; bounds use GeoJSON axis order. */
export type FeatureSpatialIndex = {
  geometry: string
  longitude: number
  latitude: number
  cells: Record<string, string>
}

/** Raw persisted geometry is used to guard backfill writes against concurrent edits. */
export type FeatureSpatialBackfillRow = { id: string; geometry: string }
