// CONTENTS: Types and catalog; spatial candidate selection; geometry and route validation.
// DATA
import catalog from './mtr-catalog.json'
// GEOMETRY
import { decodePolyline6 } from './routeGeometry'

export type MtrPoint = readonly [number, number]
export type MtrExit = (typeof catalog.exits)[number]
export type MtrResolution = {
  status: 'ready' | 'unreachable' | 'unsupported'
  calculatedAt: string
  catalogVersion: string
  graphVersion: string
  candidatesChecked: number
  stationAssociation?: string
}
export type MtrAccess = {
  mtrStation: string | null
  mtrExit: string | null
  mtrDistance: number | null
  mtrResolution: MtrResolution
}
export type MtrRoute = (origin: MtrPoint, exit: MtrExit) => Promise<number | null>
export const mtrCatalog = catalog

/**
 * Measures a conservative great-circle lower bound for pedestrian route selection.
 * @param a - Longitude/latitude origin.
 * @param b - Longitude/latitude destination.
 * @returns Metres along the earth's surface.
 */
export function mtrAirDistance(a: MtrPoint, b: MtrPoint): number {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Finds the shortest routable MTR entrance across station boundaries.
 * @param point - Feature point in WGS84, or null for unsupported geometry.
 * @param route - Pedestrian routing adapter; null means inaccessible, errors abort.
 * @param graphVersion - Immutable routing graph identity used by this calculation.
 * @param exits - Station-linked entrances; injectable for deterministic tests.
 * @returns Core feature fields and calculation provenance.
 * @remarks Never substitutes straight-line distance for a failed walking route.
 * Stops only when remaining entrances cannot beat the current walking distance.
 */
export async function calculateMtrAccess(
  point: MtrPoint | null,
  route: MtrRoute,
  graphVersion: string,
  exits: readonly MtrExit[] = catalog.exits,
): Promise<MtrAccess> {
  const result: MtrAccess = {
    mtrStation: null,
    mtrExit: null,
    mtrDistance: null,
    mtrResolution: {
      status: 'unsupported',
      calculatedAt: new Date().toISOString(),
      catalogVersion: catalog.sourceSha256,
      graphVersion,
      candidatesChecked: 0,
    },
  }
  if (
    !point ||
    !point.every(Number.isFinite) ||
    point[0] < 113.7 ||
    point[0] > 114.6 ||
    point[1] < 22.1 ||
    point[1] > 22.6
  )
    return result
  result.mtrResolution.status = 'unreachable'
  const candidates = exits
    .map(exit => ({
      exit,
      lower: mtrAirDistance(point, exit.coordinates as [number, number]),
    }))
    .sort((a, b) => a.lower - b.lower || a.exit.id.localeCompare(b.exit.id))
  for (const { exit, lower } of candidates) {
    // Allow a small numerical tolerance; route adapters include endpoint connectors.
    if (result.mtrDistance !== null && lower > result.mtrDistance + 2) break
    const metres = await route(point, exit)
    result.mtrResolution.candidatesChecked++
    if (metres === null) continue
    if (!Number.isFinite(metres) || metres < 0)
      throw new Error('Invalid MTR route distance')
    const distance = Math.ceil(Math.max(metres, lower))
    if (result.mtrDistance === null || distance < result.mtrDistance) {
      result.mtrStation = exit.station
      result.mtrExit = exit.id
      result.mtrDistance = distance
      result.mtrResolution.status = 'ready'
      result.mtrResolution.stationAssociation = exit.association
    }
  }
  return result
}

/**
 * Reads a feature point without guessing a polygon/line access location.
 * @param geometry - Parsed GeoJSON feature geometry.
 * @returns Valid two-dimensional point or null.
 */
export function mtrFeaturePoint(geometry: unknown): MtrPoint | null {
  if (!geometry || typeof geometry !== 'object') return null
  const g = geometry as { type?: unknown; coordinates?: unknown }
  if (g.type !== 'Point' || !Array.isArray(g.coordinates) || g.coordinates.length < 2)
    return null
  const [lon, lat] = g.coordinates
  return typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat)
    ? [lon, lat]
    : null
}

/**
 * Validates a native Valhalla pedestrian result and adds short endpoint connectors.
 * @param payload - Native response or shared-service envelope.
 * @param origin - Requested feature point.
 * @param exit - Requested entrance point.
 * @returns Walking metres, or null for no path, ferry routes or excessive snapping.
 * @remarks A snap over 75m is not reliable entrance access. Engine failures throw.
 */
export function mtrRouteDistance(
  payload: unknown,
  origin: MtrPoint,
  exit: MtrPoint,
): number | null {
  const body = payload as {
    native?: unknown
    error_code?: number
    trip?: {
      status?: number
      units?: string
      summary?: { length?: number; has_ferry?: boolean }
      legs?: Array<{ shape?: string }>
    }
  }
  if (body?.native) return mtrRouteDistance(body.native, origin, exit)
  if ([171, 172, 442, 443, 444].includes(body?.error_code ?? 0)) return null
  const trip = body?.trip
  if (
    !trip ||
    trip.status !== 0 ||
    trip.units !== 'kilometers' ||
    !Number.isFinite(trip.summary?.length) ||
    !trip.legs?.length
  )
    throw new Error('Invalid MTR routing response')
  if (trip.summary?.has_ferry) return null
  const first = decodePolyline6(trip.legs[0].shape ?? '')
  const last = decodePolyline6(trip.legs.at(-1)?.shape ?? '')
  if (!first.length || !last.length) throw new Error('Missing MTR route geometry')
  const startSnap = mtrAirDistance(origin, first[0])
  const endSnap = mtrAirDistance(exit, last[last.length - 1])
  if (startSnap > 75 || endSnap > 75) return null
  return trip.summary!.length! * 1000 + startSnap + endSnap
}
