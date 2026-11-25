// SVELTEKIT
import { command, getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { mapIdSchema, releaseHashSchema } from '#lib/indoor/releases.js'
import { premisesMapStorage } from '#lib/indoor/server/storage.js'
import { textureComparisonBucket } from '#lib/locations/exterior/textureComparison.server.js'
import { setupRequestHandler } from '#lib/api/index.js'
// SERVICES
import { createRecorderRecord } from '#lib/db/services/fieldResearchFeature.js'
import {
  listRecorderLocations,
  listRecorderRecords,
  listRecorderSessions,
} from '#lib/db/services/recorderSessions.js'

const sessionId = z.string().min(1).max(100)

/** Resolve the device cookie and current contributor roles for every request.
 * @returns Authenticated, request-local database context.
 */
async function recorderContext() {
  const event = getRequestEvent()
  const ctx = await setupRequestHandler({ ...event, platform: event.locals.platform })
  if (ctx.user.isAnonymous) error(403, 'Sign in to HYPE')
  return ctx
}

/** @returns Sessions available to the signed-in device. */
export const recorderSessions = query(async () =>
  listRecorderSessions(await recorderContext()),
)

/** @param id Session identity. @returns Vetted Locations and known context. */
export const recorderLocations = query(sessionId, async id =>
  listRecorderLocations(await recorderContext(), id),
)

/** @param id Session identity. @returns Shared capture identities in insertion order. */
export const recorderRecords = query(sessionId, async id =>
  listRecorderRecords(await recorderContext(), id),
)

const percent = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)])
const placement = z.object({
  spatialRealm: z.enum(['interior', 'exterior']).nullable(),
  locationId: sessionId.nullable(),
  pin: z
    .union([
      z.object({
        realm: z.literal('exterior'),
        surface: z.literal('facade'),
        assetId: z.uuid(),
        geometryId: z.union([
          z.uuid(),
          z.string().regex(/^comparison-[a-f0-9]{64}\.glb$/),
        ]),
        facadeId: z.string().regex(/^view-\d{1,5}$/),
        direction: z.enum([
          'North',
          'Northeast',
          'East',
          'Southeast',
          'South',
          'Southwest',
          'West',
          'Northwest',
        ]),
        percent: percent.nullable(),
        blend: z.number().min(0).max(2),
        alignmentRevision: z.number().int().nonnegative(),
        floorId: sessionId.optional(),
        floorLabel: z.string().max(1000).optional(),
      }),
      z.object({
        realm: z.literal('exterior'),
        point: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      }),
      z.object({
        realm: z.literal('interior'),
        mapId: mapIdSchema,
        hash: releaseHashSchema,
        floorId: z.string().min(1).max(200),
        point: z.tuple([z.number(), z.number()]).nullable(),
        percent: percent.optional(),
        unitId: z.string().min(1).max(200).optional(),
        unitLabel: z.string().max(1000).optional(),
        unitAddress: z.string().max(2000).optional(),
        unitLocationId: sessionId.optional(),
        unitCategory: z.string().max(200).optional(),
      }),
    ])
    .nullable(),
})

/** @param input Session and retry-stable capture identity. @returns Persisted record identity. */
export const recordFeature = command(
  z.object({
    sessionId,
    id: z.uuid(),
    layerId: sessionId.optional(),
    placement: placement.optional(),
  }),
  async input => {
    const ctx = await recorderContext()
    const pin = input.placement?.pin
    const platform = getRequestEvent().locals.platform
    const bucket =
      pin?.realm === 'interior'
        ? premisesMapStorage(platform)
        : pin && 'surface' in pin && pin.geometryId !== pin.assetId
          ? textureComparisonBucket(platform)
          : undefined
    return createRecorderRecord(
      ctx,
      input.sessionId,
      input.id,
      input.layerId,
      input.placement,
      bucket,
    )
  },
)
