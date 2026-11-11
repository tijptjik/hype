// VALIDATION
import { z } from 'zod'
// TYPES
import type { LocationAddress } from '#lib/locations/model.js'

const sourcePoint = z.object({
  attributes: z.object({
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z.tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ]),
    }),
  }),
})

/** Read the address point from retained provider evidence, never from a user marker.
 * @param source Selected address publication and its original record.
 * @returns Provider longitude/latitude, or null when no source point is available.
 * @remarks Local authored addresses and geometry-only Location snapshots do not
 * establish an upstream address point. Historical snapshots are never rewritten.
 */
export function addressSourceCoordinates(
  source: LocationAddress,
): [number, number] | null {
  const parsed = sourcePoint.safeParse(source.rawSource.data)
  return parsed.success ? parsed.data.attributes.geometry.coordinates : null
}
