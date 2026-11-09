// DOMAIN
import { normalizeNameSearch } from '#lib/addresses/nameSearch.js'
import { applyAddressAbbreviations } from '#lib/addresses/formatting.js'
// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Geometry, Position } from 'geojson'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'

export type MapStreetHint = { names: string[]; distance: number }
export type NearbyStreet = { street: AddressName; distance: number }

/** Measure the shortest local ground distance to a road segment.
 * @param pin Feature pin. @param a Segment start. @param b Segment end.
 * @returns Distance in metres using a local tangent plane.
 */
function segmentDistance(pin: number[], a: Position, b: Position): number {
  const scale = (Math.PI * 6371008.8) / 180
  const xScale = scale * Math.cos((pin[1] * Math.PI) / 180)
  const ax = (a[0] - pin[0]) * xScale,
    ay = (a[1] - pin[1]) * scale
  const bx = (b[0] - pin[0]) * xScale,
    by = (b[1] - pin[1]) * scale
  const dx = bx - ax,
    dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/** Extract nearby road names from loaded vector geometry, including hidden labels.
 * @param features Road-source features. @param pin Feature pin.
 * @param radius Maximum ground distance in metres.
 * @returns Name hints with distance to the road, never an invented address point.
 */
export function sampleStreetHints(
  features: { geometry: Geometry; properties: Record<string, unknown> | null }[],
  pin: [number, number],
  radius = 100,
): MapStreetHint[] {
  return features.flatMap(feature => {
    const lines =
      feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiLineString'
          ? feature.geometry.coordinates
          : []
    const distances = lines.flatMap(line =>
      line.slice(1).map((end, index) => segmentDistance(pin, line[index], end)),
    )
    const distance = Math.min(...distances)
    if (!Number.isFinite(distance) || distance > radius) return []
    const names = Object.entries(feature.properties ?? {}).flatMap(([key, value]) =>
      /^(?:name|name[:_](?:en|zh|zh[-_]Hant|zh[-_]Hans))$/i.test(key) &&
      typeof value === 'string' &&
      value.trim()
        ? [value.trim()]
        : [],
    )
    return names.length ? [{ names, distance }] : []
  })
}

/** Join sampled names to published street names, without fuzzy address matching.
 * @param hints Loaded road names and distances. @param streets Canonical vocabulary.
 * @returns Deduplicated nearest-first canonical streets; unmatched labels are omitted.
 */
export function matchStreetHints(
  hints: MapStreetHint[],
  streets: AddressName[],
): NearbyStreet[] {
  const key = (name: string): string =>
    normalizeNameSearch(applyAddressAbbreviations(name))
  const byName = new Map<string, AddressName[]>()
  for (const street of streets)
    for (const name of Object.values(street.names)) {
      const normalized = key(name)
      if (normalized)
        byName.set(normalized, [...(byName.get(normalized) ?? []), street])
    }
  const matches = new Map<string, NearbyStreet>()
  for (const hint of hints)
    for (const name of hint.names) {
      const candidates = byName.get(key(name)) ?? []
      // A shared name cannot identify a unique canonical street from text alone.
      const unique = [
        ...new Map(candidates.map(street => [street.id, street])).values(),
      ]
      if (unique.length !== 1) continue
      const street = unique[0]
      if (!matches.has(street.id) || matches.get(street.id)!.distance > hint.distance)
        matches.set(street.id, { street, distance: hint.distance })
    }
  return [...matches.values()].sort((a, b) => a.distance - b.distance)
}

/** Sample the owning map's loaded road tiles without changing its camera.
 * @param map Map instance. @param pin Feature pin.
 * @returns Road-name hints within 100 metres, or none while tiles are unavailable.
 * @remarks Source queries include roads whose labels collide or are hidden by styling.
 */
export function nearbyStreetHints(
  map: MapLibreMap,
  pin: [number, number],
): MapStreetHint[] {
  if (!map.isStyleLoaded() || map.getZoom() < 14) return []
  const sources = new Map<string, { source: string; sourceLayer: string }>()
  for (const layer of map.getStyle().layers) {
    if (
      'source' in layer &&
      typeof layer.source === 'string' &&
      'source-layer' in layer &&
      ['roads', 'transportation', 'transportation_name'].includes(
        layer['source-layer'] ?? '',
      )
    ) {
      const sourceLayer = layer['source-layer']!
      sources.set(`${layer.source}:${sourceLayer}`, {
        source: layer.source,
        sourceLayer,
      })
    }
  }
  return sampleStreetHints(
    [...sources.values()].flatMap(({ source, sourceLayer }) =>
      map.querySourceFeatures(source, { sourceLayer }),
    ),
    pin,
  )
}
