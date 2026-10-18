// TYPES
import type { MultiLineString } from 'geojson'

/**
 * Decodes Valhalla's polyline6 into GeoJSON longitude/latitude order.
 * @param shape - An encoded native leg using six decimal places.
 * @returns Ordered WGS84 positions for one leg.
 * @remarks Rejects truncated, overflowing or out-of-range geometry rather than drawing a false route.
 */
export function decodePolyline6(shape: string): [number, number][] {
  let index = 0
  let latitude = 0
  let longitude = 0
  const coordinates: [number, number][] = []

  /** Reads one bounded signed coordinate delta. @returns The decoded integer delta. */
  function delta(): number {
    let value = 0
    let shift = 0
    while (true) {
      if (index >= shape.length || shift > 30) throw new Error('Invalid route shape')
      const part = shape.charCodeAt(index++) - 63
      if (part < 0 || part > 63) throw new Error('Invalid route shape')
      value += (part & 31) * 2 ** shift
      if (part < 32) return value % 2 ? -(Math.floor(value / 2) + 1) : value / 2
      shift += 5
    }
  }

  // Native shapes encode latitude first; GeoJSON positions require longitude first.
  while (index < shape.length) {
    latitude += delta()
    longitude += delta()
    const lat = latitude / 1e6
    const lon = longitude / 1e6
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
      throw new Error('Invalid route shape')
    coordinates.push([lon, lat])
  }
  if (!coordinates.length) throw new Error('Route shape has no positions')
  // A zero-distance journey can contain one position; repeat it for valid line geometry.
  if (coordinates.length === 1) coordinates.push([...coordinates[0]])
  return coordinates
}

/**
 * Computes fit bounds across every leg without connecting separate legs.
 * @param geometry - Validated native journey geometry.
 * @returns Southwest/northeast corners in GeoJSON order.
 */
export function getRouteBounds(
  geometry: MultiLineString,
): [[number, number], [number, number]] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const leg of geometry.coordinates) {
    for (const [lon, lat] of leg) {
      west = Math.min(west, lon)
      south = Math.min(south, lat)
      east = Math.max(east, lon)
      north = Math.max(north, lat)
    }
  }
  return [
    [west, south],
    [east, north],
  ]
}
