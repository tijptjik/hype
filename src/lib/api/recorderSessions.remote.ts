// SVELTEKIT
import { command, getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { mapIdSchema, releaseHashSchema } from '#lib/indoor/releases.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
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

const placement = z.object({
  spatialRealm: z.enum(['interior', 'exterior']),
  locationId: sessionId.nullable(),
  pin: z
    .discriminatedUnion('realm', [
      z.object({
        realm: z.literal('exterior'),
        point: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
      }),
      z.object({
        realm: z.literal('interior'),
        mapId: mapIdSchema,
        hash: releaseHashSchema,
        floorId: z.string().min(1).max(200),
        point: z.tuple([z.number(), z.number()]),
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
    const bucket =
      input.placement?.pin?.realm === 'interior'
        ? premisesMapBucket(getRequestEvent().locals.platform)
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
