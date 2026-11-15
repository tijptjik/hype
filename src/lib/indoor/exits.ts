// TYPES
import type { Place } from './model'

export type ExitMarker = { place: Place; label: string; point: [number, number] }

/** Select source-labelled entry points for one floor without merging physical entrances.
 * @param places Source-derived directory entries.
 * @param levelId Exact source floor identity.
 * @returns Exit markers anchored to their source coordinates.
 * @remarks A label is wayfinding evidence, not proof of an outdoor routing connection.
 */
export function exitMarkers(places: Place[], levelId: string): ExitMarker[] {
  return places.flatMap(place => {
    const feature = place.markerFeature ?? place.feature
    if (
      place.category !== 'entry' ||
      place.levelId !== levelId ||
      feature.geometry.type !== 'Point'
    )
      return []
    const name = place.name.en.trim()
    const label =
      /^exit\s+([a-z]+\d*[a-z]?)$/i.exec(name.normalize('NFKC'))?.[1].toUpperCase() ??
      name
    const [x, y] = feature.geometry.coordinates
    if (!label || label === 'entry' || !Number.isFinite(x) || !Number.isFinite(y))
      return []
    return [{ place, label, point: [x, y] as [number, number] }]
  })
}
