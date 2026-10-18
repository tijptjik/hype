// THIRD PARTY
import { z } from 'zod'

const position = z.array(z.number().finite()).min(2)
const ring = z.array(position).min(4)
/** Membership polygons only; label points cannot highlight territory. */
export const divisionPolygonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ring).min(1)).min(1),
  }),
])
export type DivisionGeometry = {
  id: string
  apiReleaseSet: string
  geometries: z.infer<typeof divisionPolygonSchema>[]
}

/**
 * Reads validated membership geometry without interpreting missing polygons as territory.
 * @param attributes Mirrored source definition attributes.
 * @returns Validated polygons, or an empty list for unavailable geometry.
 */
export function readDivisionPolygons(
  attributes: unknown,
): DivisionGeometry['geometries'] {
  const result = z
    .object({
      membershipGeometry: z.array(z.object({ geometry: divisionPolygonSchema })),
    })
    .safeParse(attributes)
  return result.success ? result.data.membershipGeometry.map(area => area.geometry) : []
}
