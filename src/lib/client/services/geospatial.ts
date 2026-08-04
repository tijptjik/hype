// I18N
import { getI18n, getLocaleKey, toLocaleKey } from '$lib/i18n'
// DATA
import neighbourhoods from '$lib/map/neighbourhoods.json'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type {
  Locale,
  LocaleKey,
  NeighbourhoodResource,
  NeighbourhoodJSON,
} from '$lib/types'
import type { LngLatLike } from 'maplibre-gl'

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
//    - startCircularFlight(appCtx: AppCtx, center: [number, number], radiusKm?: number)
//      Starts circular flight animation around center point
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

// ═══════════════════════
// 3. ANIMATION
// ═══════════════════════

/**
 * Starts a circular flight animation around a center point.
 * Completes a 5km circle in two minutes by default and loops continuously.
 *
 * @param appCtx - Application context containing the active map.
 * @param center - Center coordinate for the circular flight.
 * @param radiusKm - Radius of the circular flight in kilometres.
 * @param durationMs - Duration of one complete orbit in milliseconds.
 * @returns A cleanup function, or `undefined` when no map is available.
 * @remarks Non-positive `durationMs` values use the 120000ms default duration.
 */
export function startCircularFlight(
  appCtx: AppCtx,
  center: [number, number],
  radiusKm: number = 5,
  durationMs: number = 120000,
): (() => void) | void {
  const map = appCtx.map
  if (!map) return

  const totalDuration = durationMs > 0 ? durationMs : 120000
  const longitudeRadius = radiusKm / 111.32
  const latitudeRadius = longitudeRadius / Math.cos((center[1] * Math.PI) / 180)
  const bearingDegreesPerRadian = 180 / Math.PI
  let startTime: number | null = null
  let animationId: number | null = null
  let isStopped = false

  const animate = (currentTime: number) => {
    if (isStopped || appCtx.map !== map) return
    if (startTime === null) startTime = currentTime

    // Keep the camera update on one browser frame and avoid work until the map is ready.
    const elapsed = (currentTime - startTime) % totalDuration
    const progress = elapsed / totalDuration
    const angleRad = progress * 2 * Math.PI

    map.jumpTo({
      center: [
        center[0] + longitudeRadius * Math.cos(angleRad),
        center[1] + latitudeRadius * Math.sin(angleRad),
      ],
      zoom: 14,
      bearing: (angleRad + Math.PI / 2) * bearingDegreesPerRadian,
      pitch: 45,
    })

    animationId = requestAnimationFrame(animate)
  }

  const start = (): void => {
    if (!isStopped) animationId = requestAnimationFrame(animate)
  }

  if (map.loaded()) {
    start()
  } else {
    map.once('load', start)
  }

  return () => {
    isStopped = true
    map.off('load', start)
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
    }
  }
}
