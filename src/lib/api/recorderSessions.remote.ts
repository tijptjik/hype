// SVELTEKIT
import { command, getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
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

/** @param input Session and retry-stable capture identity. @returns Persisted record identity. */
export const recordFeature = command(
  z.object({
    sessionId,
    id: z.uuid(),
    layerId: sessionId.optional(),
  }),
  async input => {
    const ctx = await recorderContext()
    return createRecorderRecord(ctx, input.sessionId, input.id, input.layerId)
  },
)
