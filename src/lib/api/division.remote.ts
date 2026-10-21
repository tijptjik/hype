// THIRD PARTY
import { eq } from 'drizzle-orm'
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DB
import { divisionDefinition } from '#lib/db/schema/division.js'
// DOMAIN
import { readDivisionPolygons, type DivisionGeometry } from '#lib/divisions/geometry.js'
import { readAddressDivisionContext } from '#lib/db/services/addressDivisions.js'
// TYPES
import type { EntityResponse } from '#lib/types.js'

/** Resolve public geography for an address marker, independently of Feature visibility.
 * @param input Current WGS84 marker point. @returns Memberships and interpretive selection options.
 * @remarks Read-only; it never changes the saved marker or its canonical Address evidence.
 */
export const getAddressDivisionContext = guardedQuery(
  z.strictObject({
    coordinates: z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  }),
  (input, ctx) => readAddressDivisionContext(ctx.db, input.coordinates),
)

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
