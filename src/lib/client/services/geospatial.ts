// I18N
import { getI18n } from '$lib/i18n'
// TYPES
import type { LngLatLike } from 'maplibre-gl'
import type { AppCtx } from '$lib/context/app.svelte'
import type { DivisionFacet } from '$lib/api/services/featureQuery.types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'

/**
 * Resolves a division label in the user's locale and preferred fallback languages.
 * @param division Registry identity and translated source names.
 * @param preferences User language preferences.
 * @returns Localized name, then an available source name, then the stable ID.
 */
export function getDivisionName(
  division: DivisionFacet,
  preferences?: Partial<UserPreferences>,
): string {
  const fallback =
    division.i18n.en?.name ??
    Object.values(division.i18n).find(value => value?.name)?.name ??
    division.id
  return getI18n(division, 'name', preferences, fallback)
}

/**
 * Searches the registry divisions available to the current authorized collection.
 * @param appCtx Active application and division facet state.
 * @param term Localized search text.
 * @returns Stable IDs with classification and translated names, ordered by level and name.
 */
export function filterPlaces(appCtx: AppCtx, term: string): [string, DivisionFacet][] {
  const preferences = appCtx.getUserPreferences()
  const label = (division: DivisionFacet) => getDivisionName(division, preferences)
  return [...appCtx.placeCtx.divisions.entries()]
    .filter(
      ([id, division]) =>
        (appCtx.placeCtx.neighbourhoodFeatureCounts.get(id) ?? 0) > 0 &&
        label(division).toLocaleLowerCase().includes(term.toLocaleLowerCase()),
    )
    .sort(
      ([, a], [, b]) =>
        (a.level ?? 99) - (b.level ?? 99) || label(a).localeCompare(label(b)),
    )
}

/**
 * Extracts a coordinate pair from MapLibre's supported coordinate forms.
 * @param lngLat Map coordinate value.
 * @returns Longitude and latitude, or null.
 */
export function getCoordinates(lngLat: LngLatLike | null): [number, number] | null {
  if (!lngLat) return null
  if (Array.isArray(lngLat)) {
    return lngLat
  }
  if ('lon' in lngLat) {
    return [lngLat.lon, lngLat.lat]
  } else if ('lng' in lngLat) {
    return [lngLat.lng, lngLat.lat]
  }
  return null
}

/**
 * Extracts the current user location from app state as `[lng, lat]`.
 *
 * @param appCtx Application context containing the current geolocation state.
 * @returns The current user coordinates or `null` when location is unavailable.
 */
export function getUserLocationCoordinates(appCtx: AppCtx): [number, number] | null {
  const userLocation = appCtx.state.userLocation
  if (!userLocation) return null

  return [userLocation.coords.longitude, userLocation.coords.latitude]
}
