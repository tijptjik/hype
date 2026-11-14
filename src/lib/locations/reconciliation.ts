// TYPES
import type { PlacePreview } from './sourcePreview'

export type ReconciliationSearchItem = {
  name: string
  brand: string
  properties: Record<string, string>
}
/** Read the selected search field without turning a missing brand into a different search. @param item Current Feature values. @param source Selected automation source. @returns Editable initial search text. */
export function reconciliationQuery(
  item: ReconciliationSearchItem,
  source: string,
): string {
  return (
    source === 'brand'
      ? item.brand
      : source === 'name'
        ? item.name
        : (item.properties[source.slice(6)] ?? '')
  )
    .trim()
    .slice(0, 200)
}
/** Measure candidate distance without treating missing coordinates as a nearby record. @param origin Feature position. @param facts Source preview. @returns Metres, or infinity for invalid geometry. */
export function reconciliationDistance(
  origin: [number, number],
  facts: PlacePreview,
): number {
  const geometry = facts.location.geometry
  if (geometry.type !== 'Point') return Infinity
  const [lng, lat] = geometry.coordinates
  if (![lng, lat].every(Number.isFinite)) return Infinity
  const radians = Math.PI / 180
  const a =
    Math.sin(((lat - origin[1]) * radians) / 2) ** 2 +
    Math.cos(lat * radians) *
      Math.cos(origin[1] * radians) *
      Math.sin(((lng - origin[0]) * radians) / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}
