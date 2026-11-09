// THIRD PARTY
import { eq } from 'drizzle-orm'
import { z } from 'zod'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DB
import { divisionDefinition } from '#lib/db/schema/division.js'
// DOMAIN
import type { DivisionGeometry } from '#lib/divisions/geometry.js'
import { readMirroredDivisionPolygons } from '#lib/db/services/divisionGeometry.js'
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
            geometries: await readMirroredDivisionPolygons(
              ctx.db,
              definition.id,
              definition.attributes,
            ),
          }
        : null,
    }
  },
)

/** Read a public division label for an explicit source address relationship.
 * @param input Source division identity.
 * @returns Classification and localized names, without polygon geometry.
 * @remarks Does not infer membership or expose private resource data.
 */
export const getAddressDivisionLabel = guardedQuery(
  z.strictObject({ id: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const [row] = await ctx.db
      .select({ attributes: divisionDefinition.attributes })
      .from(divisionDefinition)
      .where(eq(divisionDefinition.id, input.id))
      .limit(1)
    const parsed = z
      .object({
        class: z.string(),
        category: z.string().optional(),
        level: z.number().nullable().optional(),
        names: z
          .record(z.string(), z.object({ name: z.string().nullable() }))
          .optional(),
        i18n: z
          .record(z.string(), z.object({ name: z.string().nullable() }))
          .optional(),
      })
      .safeParse(row?.attributes)
    if (!parsed.success || parsed.data.class === 'city') return null
    return {
      id: input.id,
      class: parsed.data.class,
      category: parsed.data.category ?? '',
      level: parsed.data.level ?? null,
      names: parsed.data.names ?? parsed.data.i18n ?? {},
    }
  },
)
