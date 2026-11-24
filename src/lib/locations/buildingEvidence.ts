// VALIDATION
import { z } from 'zod'
// GEOMETRY
import polygonClipping from 'polygon-clipping'
// DOMAIN
import { BuildingSourceSchema } from './buildingSource.js'
import { LocationFootprintGeometrySchema } from './footprint.js'

// TOC: Evidence contract | Reviewed geometry
/** References describe contributing evidence, never equivalent upstream identities. */
export const BuildingEvidenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('saanseoi'),
    source: BuildingSourceSchema,
  }),
  z.object({
    type: z.literal('location'),
    locationId: z.string().min(1).max(200),
    revisionId: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal('map'),
    source: z.string().min(1).max(200),
    id: z.string().min(1).max(200),
    geometry: LocationFootprintGeometrySchema,
  }),
])
export type BuildingEvidence = z.infer<typeof BuildingEvidenceSchema>

/** Union reviewed map pieces without filling gaps or inventing a bounding rectangle.
 * @param evidence Explicitly selected evidence. @returns Combined outline, or null without geometry.
 */
export function combineBuildingOutlines(
  evidence: BuildingEvidence[],
): z.infer<typeof LocationFootprintGeometrySchema> | null {
  const pieces = evidence.flatMap(item =>
    item.type === 'map'
      ? [
          item.geometry.type === 'Polygon'
            ? [item.geometry.coordinates]
            : item.geometry.coordinates,
        ]
      : [],
  )
  if (!pieces.length) return null
  return LocationFootprintGeometrySchema.parse({
    type: 'MultiPolygon',
    coordinates: polygonClipping.union(pieces[0], ...pieces.slice(1)),
  })
}
