// THIRD PARTY
import { eq } from 'drizzle-orm'
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DB
import { divisionDefinition } from '#lib/db/schema/division.js'
// DOMAIN
import { readDivisionPolygons, type DivisionGeometry } from '#lib/divisions/geometry.js'
// TYPES
import type { EntityResponse } from '#lib/types.js'

/**
 * Loads one public geographic definition's mirrored polygons on demand.
 * @param params Stable division ID and client cache scope (not authorisation).
 * @param ctx Guarded database context.
 * @returns Geometry with its imported release, or null for an unknown definition.
 * @remarks This endpoint exposes public SaanSeoi geography, never feature membership or counts.
 */
export const getDivisionGeometry = guardedQuery(
  z.object({
    id: z.string().min(1).max(200),
    meta: z.object({ scope: z.string().optional() }).optional(),
  }),
  async (params, ctx): Promise<EntityResponse<DivisionGeometry>> => {
    const [definition] = await ctx.db
      .select()
      .from(divisionDefinition)
      .where(eq(divisionDefinition.id, params.id))
      .limit(1)
    return {
      data: definition
        ? {
            id: definition.id,
            apiReleaseSet: definition.apiReleaseSet,
            geometries: readDivisionPolygons(definition.attributes),
          }
        : null,
    }
  },
)
