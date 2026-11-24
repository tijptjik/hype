// SVELTEKIT
import { error } from '@sveltejs/kit'
// DOMAIN
import {
  recorderMaps,
  type MapPoint,
  type RecorderPlacement,
} from '#lib/fieldResearch/recorder.js'
import { contains } from '#lib/indoor/navigation/geometry.js'
// SERVICES
import { readMapBundle } from './premisesMap'
import { listRecorderLocations } from './recorderSessions'
// TYPES
import type { R2Bucket } from '@cloudflare/workers-types'

/** Verify the selected place and floor against this session before the capture transaction.
 * @param ctx Authenticated recorder context. @param sessionId Owning session.
 * @param placement Device selection. @param bucket Published drawing storage.
 * @returns Geographic feature coordinates, when the verified drawing supplies them.
 */
export async function resolveRecorderPoint(
  ctx: Parameters<typeof listRecorderLocations>[0],
  sessionId: string,
  placement?: RecorderPlacement,
  bucket?: R2Bucket,
): Promise<MapPoint | null> {
  if (!placement) return null
  const { locationId, spatialRealm, pin } = placement
  if (pin && (pin.realm !== spatialRealm || !locationId))
    error(400, 'Choose a location for this pin.')
  if (!locationId) return null
  const places = await listRecorderLocations(ctx, sessionId)
  const place =
    places.find(row => row.id === locationId) ??
    places
      .flatMap(row => [row.building, row.premises])
      .find(row => row?.id === locationId)
  if (!place) error(409, 'This location is no longer available to the session.')
  if (!pin || pin.realm === 'exterior') return pin?.point ?? null

  // Keep a pixel drawing in its own coordinate space. Only geographic releases can populate Feature geometry.
  const links = recorderMaps(place).filter(
    map => map.id === pin.mapId && map.hash === pin.hash,
  )
  if (!bucket || !links.length)
    error(409, 'Reopen the map to select the current drawing.')
  const { data } = await readMapBundle(bucket, pin.mapId, pin.hash)
  const floor = data.level_polygon.features.find(
    row => row.properties.level_id === pin.floorId,
  )
  if (!floor || !contains(pin.point, floor))
    error(400, 'The pin must be inside the selected floor.')
  const units = place.maps.filter(map => map.id === pin.mapId && map.unitId)
  if (
    units.length &&
    !data.unit_polygon.features.some(
      feature =>
        feature.properties.level_id === pin.floorId &&
        units.some(map => map.unitId === feature.properties.unit_id) &&
        contains(pin.point, feature),
    )
  )
    error(400, 'Place the pin inside the selected building part.')
  return data.coordinateSpace === 'image-pixels' ? null : pin.point
}
