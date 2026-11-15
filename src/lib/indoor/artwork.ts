// TYPES
import type { Place } from './model'
export type ShopArtwork = {
  src: string
  aspect: number
  padding: number
  background: string
}
/** Resolve current database-backed brand artwork for a physical unit. @param place Hydrated place. @returns Approved artwork or null. */
export function shopArtwork(place?: Place): ShopArtwork | null {
  return place?.artwork ?? null
}
