// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { desc, eq } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// SCHEMA
import { premisesMap, premisesMapPublication } from '#lib/db/schema/premisesMap.js'
// DOMAIN
import { mapIdSchema, releaseHashSchema } from '#lib/indoor/releases.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
import {
  readMapBundle,
  saveMapDraft,
  publishMapDraft,
} from '#lib/db/services/premisesMap.js'
import type { GuardedBaseContext } from './guarded.types'

/** Require site-wide authority for shared physical maps. @param ctx Authenticated request. @returns Nothing on success. */
function authorize(ctx: GuardedBaseContext): void {
  if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
}
/** List editable map metadata. @param input No parameters. @returns Administrative map pointers. */
export const listPremisesMaps = guardedQuery(z.object({}), async (_input, ctx) => {
  authorize(ctx)
  return ctx.db.select().from(premisesMap)
})
/** Read one draft and its publication history. @param input Map ID. @returns Draft content and concurrency versions. */
export const getPremisesMapDraft = guardedQuery(
  z.object({ id: mapIdSchema }),
  async (input, ctx) => {
    authorize(ctx)
    const map = await ctx.db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, input.id))
      .get()
    if (!map) error(404, 'MAP_NOT_FOUND')
    const hash = map.draftHash ?? map.publishedHash
    return {
      map,
      bundle: hash
        ? await readMapBundle(
            premisesMapBucket(ctx.event.locals.platform),
            input.id,
            hash,
          )
        : null,
      history: await ctx.db
        .select()
        .from(premisesMapPublication)
        .where(eq(premisesMapPublication.mapId, input.id))
        .orderBy(desc(premisesMapPublication.version))
        .limit(100),
    }
  },
)
/** Save an unpublished geometry/connection draft. @param input Full bundle with optimistic version. @returns Saved draft pointer. */
export const savePremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    expectedVersion: z.number().int().nonnegative(),
    bundle: z.unknown(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    return saveMapDraft(ctx.db, premisesMapBucket(ctx.event.locals.platform), {
      ...input,
      actorId: ctx.user.id,
    })
  },
)
/** Publish only the exact reviewed draft. @param input Draft hash and both version fences. @returns New publication number. */
export const publishPremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    hash: releaseHashSchema,
    expectedDraftVersion: z.number().int().nonnegative(),
    expectedPublishedVersion: z.number().int().nonnegative(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    return publishMapDraft(ctx.db, premisesMapBucket(ctx.event.locals.platform), {
      ...input,
      actorId: ctx.user.id,
    })
  },
)
/** Restore a previously published release as a new unpublished draft. @param input Published hash and draft version. @returns Saved draft pointer; publishing remains separate. */
export const restorePremisesMapDraft = guardedCommand(
  z.object({
    id: mapIdSchema,
    hash: releaseHashSchema,
    expectedVersion: z.number().int().nonnegative(),
  }),
  async (input, ctx) => {
    authorize(ctx)
    const history = await ctx.db
      .select()
      .from(premisesMapPublication)
      .where(eq(premisesMapPublication.mapId, input.id))
    if (!history.some(r => r.hash === input.hash)) error(400, 'UNKNOWN_PUBLICATION')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    return saveMapDraft(ctx.db, bucket, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      bundle: await readMapBundle(bucket, input.id, input.hash),
      actorId: ctx.user.id,
    })
  },
)
