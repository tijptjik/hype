// VALIDATION
import { z } from 'zod'

const identifier = z.string().trim().min(1)
// Mutable aliases cannot pin historical geometry even when a revision token is present.
const immutableIdentifier = identifier.refine(
  value => !['latest', 'current'].includes(value.toLowerCase()),
  'An immutable release or geometry revision is required',
)
const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const ring = z
  .array(coordinate)
  .min(4)
  .refine(
    points =>
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1],
    'Polygon rings must be closed',
  )
const polygon = z.array(ring).min(1)

/** Optional physical extent, independent of the point used for map markers. */
export const LocationFootprintGeometrySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Polygon'), coordinates: polygon }),
  z.strictObject({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(polygon).min(1),
  }),
])

/** Authored geometry makes no claim of a canonical upstream identity or publication. */
export const LocalLocationFootprintSchema = z.strictObject({
  mode: z.literal('inline'),
  geometry: LocationFootprintGeometrySchema,
})

/** Shared by establishments, buildings and other Location kinds; never required.
 * @remarks References reserve the future pinned SaanSeoi geometry contract. They are
 * not download URLs and no downloader is enabled. Publisher identifiers remain in
 * the retained SaanSeoi response rather than a second HYPE building-source schema.
 */
export const LocationFootprintSchema = z.discriminatedUnion('mode', [
  LocalLocationFootprintSchema,
  // An immutable geometry reference avoids copying footprints for attribute-only revisions.
  z.strictObject({
    mode: z.literal('reference'),
    ssId: identifier,
    releaseId: immutableIdentifier,
    geometryRevisionId: immutableIdentifier,
  }),
])
export type LocationFootprint = z.infer<typeof LocationFootprintSchema>
