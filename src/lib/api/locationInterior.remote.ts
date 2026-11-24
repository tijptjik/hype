// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { eq } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
// DATABASE
import { locationPremisesMap } from '#lib/db/schema/operator.js'
import { premisesMap } from '#lib/db/schema/premisesMap.js'
import { readMapBundle, saveMapDraft } from '#lib/db/services/premisesMap.js'
// DOMAIN
import { mapHash } from '#lib/indoor/releases.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
import {
  floorplanExtractionSchema,
  floorplanBundle,
} from '#lib/indoor/floorplans/extraction.js'

const identity = z.object({ locationId: z.string().min(1).max(200) })
/** Read the building's existing indoor draft for the shared viewer. @param input Building ID. @returns Map metadata and draft bundle. */
export const getLocationInterior = guardedQuery(identity, async (input, ctx) => {
  await authorizeExteriorLocation(ctx, input.locationId)
  const link = await ctx.db
    .select()
    .from(locationPremisesMap)
    .where(eq(locationPremisesMap.locationId, input.locationId))
    .get()
  const map = link
    ? await ctx.db
        .select()
        .from(premisesMap)
        .where(eq(premisesMap.id, link.mapId))
        .get()
    : null
  const hash = ctx.user.superAdmin
    ? (map?.draftHash ?? map?.publishedHash)
    : map?.publishedHash
  const bucket = premisesMapBucket(ctx.event.locals.platform)
  const bundle = hash && map ? await readMapBundle(bucket, map.id, hash) : null
  const jobId = bundle?.data.sourceDataset?.startsWith('gbp:')
    ? bundle.data.sourceDataset.slice(4)
    : null
  const reviewObject =
    ctx.user.superAdmin && jobId && hash
      ? await bucket.get(
          `interior-jobs/${input.locationId}/${jobId}/review-${hash}.json`,
        )
      : null
  const jobObject =
    ctx.user.superAdmin && jobId
      ? await bucket.get(`interior-jobs/${input.locationId}/${jobId}/result.json`)
      : null
  const job = jobObject ? await jobObject.json<{ pages: string[] }>() : null
  return {
    canEdit: Boolean(ctx.user.superAdmin),
    map,
    bundle,
    review:
      reviewObject && jobId
        ? {
            jobId,
            pages: job?.pages ?? [],
            extraction: floorplanExtractionSchema.parse(await reviewObject.json()),
          }
        : null,
  }
})

/** Save reviewed extraction as an unpublished standard indoor-map draft.
 * @param input Building, extraction job, reviewed geometry and expected version. @returns Draft pointer.
 * @remarks No room becomes a canonical building part automatically; no publication or routing is inferred.
 */
export const saveLocationInterior = guardedCommand(
  identity.extend({
    jobId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    extraction: floorplanExtractionSchema,
    reviewed: z.literal(true),
  }),
  async (input, ctx) => {
    if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
    await authorizeExteriorLocation(ctx, input.locationId)
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const result = await bucket.get(
      `interior-jobs/${input.locationId}/${input.jobId}/result.json`,
    )
    if (!result) error(409, 'Extraction is not ready for review.')
    const source = await result.json<{ receipt: { pages: [number, number][] } }>()
    for (const floor of input.extraction.floors) {
      const dimensions = source.receipt.pages[floor.page - 1]
      if (
        !dimensions ||
        dimensions[0] !== floor.width ||
        dimensions[1] !== floor.height
      )
        error(400, 'Keep the original source-page dimensions.')
    }
    let link = await ctx.db
      .select()
      .from(locationPremisesMap)
      .where(eq(locationPremisesMap.locationId, input.locationId))
      .get()
    if (!link) {
      if (input.expectedVersion !== 0) error(409, 'Interior changed; refresh.')
      const mapId =
        'building-' +
        input.locationId
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 70) +
        '-' +
        crypto.randomUUID().slice(0, 8)
      // Link creation is atomic; a concurrent creator cannot leave a second map attached to the building.
      await ctx.db.batch([
        ctx.db.insert(premisesMap).values({
          id: mapId,
          code: mapId,
          name: 'Building interior',
          nameZh: '',
          kind: 'building',
          updatedBy: ctx.user.id,
          updatedAt: new Date().toISOString(),
        }),
        ctx.db
          .insert(locationPremisesMap)
          .values({ locationId: input.locationId, mapId, createdBy: ctx.user.id }),
      ])
      link = {
        locationId: input.locationId,
        mapId,
        createdBy: ctx.user.id,
        createdAt: new Date().toISOString(),
      }
    }
    const bundle = floorplanBundle(input.extraction)
    bundle.data.sourceDataset = `gbp:${input.jobId}`
    // Keep the editable reviewed source alongside the immutable map draft for later corrections.
    const reviewHash = await mapHash(JSON.stringify(bundle))
    await bucket.put(
      `interior-jobs/${input.locationId}/${input.jobId}/review-${reviewHash}.json`,
      JSON.stringify(input.extraction),
    )
    const saved = await saveMapDraft(ctx.db, bucket, {
      id: link.mapId,
      expectedVersion: input.expectedVersion,
      bundle,
      actorId: ctx.user.id,
    })
    return saved
  },
)
