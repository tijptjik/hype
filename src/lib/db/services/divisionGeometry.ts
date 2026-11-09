// DRIZZLE
import { eq } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// DB
import { divisionGeometryPart } from '#lib/db/schema/division.js'
// DOMAIN
import { divisionPolygonSchema, readDivisionPolygons } from '#lib/divisions/geometry.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { DivisionGeometry } from '#lib/divisions/geometry.js'

/** Read exact catalogue polygons, including definitions split to respect D1's row limit.
 * @param db Request-local database.
 * @param id Stable division identity.
 * @param attributes Mirrored metadata, including the external-geometry flag.
 * @returns Validated membership polygons without simplifying their coordinates.
 */
export async function readMirroredDivisionPolygons(
  db: Database,
  id: string,
  attributes: unknown,
): Promise<DivisionGeometry['geometries']> {
  if (
    !z.object({ membershipGeometryExternal: z.literal(true) }).safeParse(attributes)
      .success
  )
    return readDivisionPolygons(attributes)
  const rows = await db
    .select({ geometries: divisionGeometryPart.geometries })
    .from(divisionGeometryPart)
    .where(eq(divisionGeometryPart.divisionId, id))
    .orderBy(divisionGeometryPart.part)
  return rows.flatMap(row => z.array(divisionPolygonSchema).parse(row.geometries))
}
