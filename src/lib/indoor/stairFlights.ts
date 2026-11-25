// VALIDATION
import { z } from 'zod'
// TYPES
import type { IndoorFeature } from './model'

const point = z.tuple([z.number().finite(), z.number().finite()])
const tread = z.tuple([point, point])
export const stairFlightsSchema = z
  .array(
    z.object({
      first: tread,
      last: tread,
      count: z.number().int().min(2).max(64),
      label: z.enum(['UP', 'DN']).optional(),
    }),
  )
  .min(1)
  .max(16)

/** Draw the tread spans recorded on the plan, retaining each printed flight label once.
 * @param unit Stair enclosure with optional reviewed flight geometry in map coordinates.
 * @returns Source-aligned treads or null when there is no reviewed flight.
 */
export function reviewedTreads(unit: IndoorFeature): IndoorFeature[] | null {
  const flights = stairFlightsSchema.safeParse(unit.properties.stair_flights)
  if (!flights.success) return null
  return flights.data.flatMap(flight =>
    Array.from({ length: flight.count }, (_, i) => {
      const ratio = i / (flight.count - 1)
      return {
        type: 'Feature' as const,
        properties: {
          level_id: unit.properties.level_id,
          unit_id: unit.properties.unit_id,
          flight_label: i === Math.floor(flight.count / 2) ? flight.label : undefined,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: flight.first.map(([x, y], side) => [
            x + (flight.last[side][0] - x) * ratio,
            y + (flight.last[side][1] - y) * ratio,
          ]),
        },
      }
    }),
  )
}
