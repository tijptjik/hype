// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  recorderMaps,
  type MapPoint,
  type RecorderPlacement,
} from '#lib/fieldResearch/recorder.js'
import { polygonPercent } from '#lib/fieldResearch/recorderCoordinates.js'
import { contains } from '#lib/indoor/navigation/geometry.js'
// SERVICES
import { readMapBundle } from './premisesMap'
import { listRecorderLocations } from './recorderSessions'
// TYPES
import type { MapObjectReader } from '#lib/indoor/server/storage.js'
import type { R2Bucket } from '@cloudflare/workers-types'

export type RecorderPlacementStorage = MapObjectReader & Partial<Pick<R2Bucket, 'head'>>

/** Verify the selected place and floor against this session before the capture transaction.
 * @param ctx Authenticated recorder context. @param sessionId Owning session.
 * @param placement Device selection. @param bucket Published drawing storage.
 * @returns Geographic feature coordinates, when the verified drawing supplies them.
 */
export async function resolveRecorderPoint(
  ctx: Parameters<typeof listRecorderLocations>[0],
  sessionId: string,
  placement?: RecorderPlacement,
  bucket?: RecorderPlacementStorage,
): Promise<MapPoint | null> {
  if (!placement) return null
  const { locationId, spatialRealm, pin } = placement
  if (pin && (pin.realm !== spatialRealm || !locationId))
    error(400, 'Choose a location for this pin.')
  if (!locationId) return null
  const places = await listRecorderLocations(ctx, sessionId)
  const assignedPlace = places.find(row => row.id === locationId)
  const place =
    assignedPlace ??
    places
      .flatMap(row => [row.building, row.premises])
      .find(row => row?.id === locationId)
  if (!place) error(409, 'This location is no longer available to the session.')
  if (!pin) return null
  if (pin.realm === 'exterior') {
    if ('point' in pin) return pin.point
    const owner = place.exteriorUrl ? place : assignedPlace?.building
    if (!owner || owner.exteriorUrl?.split('/').at(-2) !== pin.assetId)
      error(409, 'Reopen the current exterior model before placing a marker.')
    if (
      pin.geometryId !== pin.assetId &&
      (!/^comparison-[a-f0-9]{64}\.glb$/.test(pin.geometryId) ||
        !(await bucket?.head?.(`location-exteriors/${pin.assetId}/${pin.geometryId}`)))
    )
      error(409, 'The selected facade imagery is unavailable.')
    if (pin.alignmentRevision > 0) {
      const alignment = await ctx.db.get<{ alignment: string }>(sql`
        SELECT alignment FROM locationExteriorAlignment WHERE assetId=${pin.assetId}
          AND geometryId=${pin.geometryId} AND revision=${pin.alignmentRevision}
          AND locationId=${owner.id}`)
      if (
        !alignment ||
        (pin.floorId &&
          !JSON.parse(alignment.alignment).lines.some(
            (line: { id: string }) => line.id === pin.floorId,
          ))
      )
        error(409, 'The selected facade floor is unavailable.')
    } else if (pin.floorId || pin.floorLabel)
      error(400, 'A facade floor needs a reviewed alignment.')
    // Facade percentages belong to a vertical surface, never to geographic Feature geometry.
    return null
  }

  // Keep a pixel drawing in its own coordinate space. Only geographic releases can populate Feature geometry.
  const children = places.filter(row => (row.building ?? row.premises)?.id === place.id)
  const links = [...recorderMaps(place), ...children.flatMap(recorderMaps)].filter(
    map => map.id === pin.mapId && map.hash === pin.hash,
  )
  if (!bucket || !links.length)
    error(409, 'Reopen the map to select the current drawing.')
  const { data } = await readMapBundle(bucket, pin.mapId, pin.hash)
  const floor = data.level_polygon.features.find(
    row => row.properties.level_id === pin.floorId,
  )
  if (!floor || (pin.point && !contains(pin.point, floor)))
    error(400, 'The pin must be inside the selected floor.')
  const units = place.maps.filter(map => map.id === pin.mapId && map.unitId)
  const point = pin.point
  const polygon = pin.unitId
    ? data.unit_polygon.features.find(
        row =>
          row.properties.level_id === pin.floorId &&
          row.properties.unit_id === pin.unitId,
      )
    : floor
  if (
    !polygon ||
    (pin.unitLocationId &&
      pin.unitLocationId !== polygon.properties.canonical_location_id) ||
    (pin.unitAddress && pin.unitAddress !== polygon.properties.unit_address_en) ||
    (point && !contains(point, polygon)) ||
    (pin.unitId && units.length && !units.some(row => row.unitId === pin.unitId))
  )
    error(400, 'Choose a polygon on the selected floor.')
  if (pin.percent) {
    if (!point) error(400, 'A percentage marker needs a drawing position.')
    const expected = polygonPercent(
      polygon,
      point,
      data.coordinateSpace === 'image-pixels',
    )
    if (
      expected.some(
        (n, i) => !Number.isFinite(n) || Math.abs(n - pin.percent![i]) > 1e-5,
      )
    )
      error(400, 'Marker percentages do not match the drawing position.')
  }
  if (!point) return null
  if (
    units.length &&
    !data.unit_polygon.features.some(
      feature =>
        feature.properties.level_id === pin.floorId &&
        units.some(map => map.unitId === feature.properties.unit_id) &&
        contains(point, feature),
    )
  )
    error(400, 'Place the pin inside the selected building part.')
  return data.coordinateSpace === 'image-pixels' ? null : pin.point
}
