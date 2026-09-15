// I18N
import { getI18n, getLocaleKey, toLocaleKey } from '$lib/i18n'
// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json'
// MAPLIBRE
import type { LngLatLike } from 'maplibre-gl'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { Locale, LocaleKey } from '$lib/types'
// TYPES
import type { Ref } from '$lib/types'

type NeighbourhoodJSON = Record<
  Ref,
  {
    i18n: Record<LocaleKey, NeighbourhoodI18n>
  }
>

type NeighbourhoodI18n = {
  name: string
  neighbourhood: string
  area: string
  district: string
}

type NeighbourhoodResource = {
  id: Ref
  i18n: Record<LocaleKey, NeighbourhoodI18n>
}


// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. GETTERS
//    - getFilteredNeighbourhoods(appCtx: AppCtx): NeighbourhoodJSON
//      Gets filtered neighbourhoods data based on current filters
//
// 2. FILTERS
//    - filterPlaces(appCtx: AppCtx, term: string)
//      Filters places by search term across name, district, and area
//
// 3. TRANSFORMATIONS
//    - getNeighbourhoodsAsResources(): NeighbourhoodResource[]
//      Converts neighbourhoods data to resource format
//
//    - buildNeighbourhoodSubdivisionMap(locale?: string): Map<string, string[]>
//      Builds map of neighbourhoods to their subdivisions
//
//    - getCoordinates(lngLat: LngLatLike | null): [number, number] | null
//      Extracts coordinates from various LngLatLike formats
//
//    - getUserLocationCoordinates(appCtx: AppCtx): [number, number] | null
//      Extracts the current user location as an `[lng, lat]` tuple
//
// 4. ANIMATION
//
// ═══════════════════════

export function getFilteredNeighbourhoods(appCtx: AppCtx): NeighbourhoodJSON {
  const filteredNeighbourhoods = appCtx.placeCtx.getFilteredNeighbourhoods()
  const result: NeighbourhoodJSON = {}

  for (const key of filteredNeighbourhoods) {
    if (key in neighbourhoods) {
      result[key] = neighbourhoods[key as keyof typeof neighbourhoods]
    }
  }

  return result
}

// ═══════════════════════
// 1. FILTERS
// ═══════════════════════

export function filterPlaces(appCtx: AppCtx, term: string) {
  if (!term) return Object.entries(neighbourhoods)
  const searchLower = term.toLowerCase()
  return Object.entries(neighbourhoods).filter(([_key, data]) => {
    return (
      getI18n(data, 'name', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(data, 'district', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower) ||
      getI18n(data, 'area', appCtx.getUserPreferences())
        .toLowerCase()
        .includes(searchLower)
    )
  })
}

// ═══════════════════════
// 2. TRANSFORMATIONS
// ═══════════════════════

export function getNeighbourhoodsAsResources(): NeighbourhoodResource[] {
  return Object.entries(neighbourhoods).map(([id, i18n]) => ({
    ...i18n,
    id,
  }))
}

export function buildNeighbourhoodSubdivisionMap(
  locale?: Locale | LocaleKey,
): Map<string, string[]> {
  const localeKey = locale ? toLocaleKey(locale) : getLocaleKey()

  const subNeighbourhoodsMap = new Map<string, string[]>()

  for (const [_key, data] of Object.entries(neighbourhoods)) {
    const name = data.i18n[localeKey]?.name
    const neighbourhood = data.i18n[localeKey]?.neighbourhood

    if (!name || !neighbourhood) continue

    // Handle neighbourhood as string or array
    const neighbourhoodKeys = Array.isArray(neighbourhood)
      ? neighbourhood
      : [neighbourhood]

    for (const hoodKey of neighbourhoodKeys) {
      if (!subNeighbourhoodsMap.has(hoodKey)) {
        subNeighbourhoodsMap.set(hoodKey, [])
      }
      subNeighbourhoodsMap.get(hoodKey)?.push(name)
    }
  }

  return subNeighbourhoodsMap
}

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
