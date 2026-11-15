// DOMAIN
import {
  connectionSchema,
  type MapBundle,
  type MapConnection,
  type EntranceSide,
} from './releases'
// TYPES
import type { IndoorFeature } from './model'
import type { MapCorrection, CorrectionResult } from './corrections'

/** Identify a pair independently of drawing direction. @param connection Pair. @returns Stable endpoint identity. */
export function connectionIdentity(connection: MapConnection): string {
  return JSON.stringify([connection.from, connection.to].sort())
}

/** Normalize orientation and ignore publication evidence when comparing curation values.
 * @param connection Connection or absent upstream value. @returns Stable JSON suitable for correction storage.
 */
export function connectionValue(connection: MapConnection | undefined): string | null {
  if (!connection) return null
  const reverse = connection.from > connection.to
  return JSON.stringify({
    from: reverse ? connection.to : connection.from,
    to: reverse ? connection.from : connection.to,
    fromLevel: reverse ? connection.toLevel : connection.fromLevel,
    toLevel: reverse ? connection.fromLevel : connection.toLevel,
    category: connection.category,
    direction:
      connection.direction === 'forward' && reverse ? 'reverse' : connection.direction,
    enabled: connection.enabled,
    fromEntrance: (reverse ? connection.toEntrance : connection.fromEntrance) ?? null,
    toEntrance: (reverse ? connection.fromEntrance : connection.toEntrance) ?? null,
  })
}

/** List numbered outer boundary edges for explicit entrance selection.
 * @param feature Endpoint geometry. @returns Side references and source coordinates; holes are not entrances.
 */
export function entranceEdges(
  feature: IndoorFeature,
): { side: EntranceSide; start: number[]; end: number[] }[] {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : []
  return polygons.flatMap((polygon, polygonIndex) =>
    polygon[0].slice(0, -1).map((start, edgeIndex) => ({
      side: { polygonIndex, edgeIndex },
      start,
      end: polygon[0][edgeIndex + 1],
    })),
  )
}

/** Assess both endpoint identities, geometry and ancestry before replaying a connection.
 * @param source Fresh source. @param baseline Original source. @param correction Stored connection JSON.
 * @returns Replay or review outcome. @remarks No endpoint or entrance edge is transferred by proximity.
 */
export function assessConnectionCorrection(
  source: MapBundle,
  baseline: MapBundle | undefined,
  correction: MapCorrection,
): CorrectionResult {
  const connection = connectionSchema.parse(JSON.parse(correction.correctedValue))
  if (!baseline) return 'baseline-unavailable'
  for (const id of [connection.from, connection.to]) {
    const matches = source.data.unit_polygon.features.filter(
      f => f.properties.unit_id === id,
    )
    const originals = baseline.data.unit_polygon.features.filter(
      f => f.properties.unit_id === id,
    )
    if (matches.length !== 1) return 'missing'
    if (originals.length !== 1) return 'baseline-unavailable'
    const target = matches[0],
      original = originals[0]
    if (
      JSON.stringify(target.geometry) !== JSON.stringify(original.geometry) ||
      ['level_id', 'venue_id', 'building_id', 'unit_category'].some(
        key => target.properties[key] !== original.properties[key],
      )
    )
      return 'changed'
    const levelId = target.properties.level_id
    const level = source.data.level_polygon.features.find(
      f => f.properties.level_id === levelId,
    )
    const oldLevel = baseline.data.level_polygon.features.find(
      f => f.properties.level_id === levelId,
    )
    if (
      !level ||
      !oldLevel ||
      ['level_ordinal', 'level_z_value'].some(
        key => level.properties[key] !== oldLevel.properties[key],
      )
    )
      return 'changed'
  }
  const current = source.data.connections?.find(
    c => connectionIdentity(c) === correction.sourceEntityId,
  )
  const original = correction.originalValue
    ? connectionSchema.parse(JSON.parse(correction.originalValue))
    : undefined
  if (connectionValue(current) === connectionValue(connection))
    return connectionValue(original) === connectionValue(connection)
      ? 'applied'
      : 'upstream-adopted'
  if (connectionValue(current) !== connectionValue(original)) return 'changed'
  return 'applied'
}

/** Replace only the exact curated pair in a derived resource. @param bundle Mutable output. @param correction Saved connection. @returns Nothing. */
export function applyConnectionCorrection(
  bundle: MapBundle,
  correction: MapCorrection,
): void {
  const connection = connectionSchema.parse(JSON.parse(correction.correctedValue))
  bundle.data.connections = [
    ...(bundle.data.connections ?? []).filter(
      c => connectionIdentity(c) !== correction.sourceEntityId,
    ),
    connection,
  ]
}
