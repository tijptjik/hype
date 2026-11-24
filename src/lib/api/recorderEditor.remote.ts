// SVELTEKIT
import { command, getRequestEvent, query } from '$app/server'
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { setupRequestHandler } from './index'
// DOMAIN
import { researchFeatureDefaultsSchema } from '#lib/fieldResearch/configuration.js'
// SERVICES
import {
  readRecorderEditor,
  saveRecorderEditor,
} from '#lib/db/services/recorderEditor.js'

/** Resolve current device roles. @returns Authenticated database context. */
async function context() {
  const event = getRequestEvent()
  const ctx = await setupRequestHandler({ ...event, platform: event.locals.platform })
  if (ctx.user.isAnonymous) error(403, 'Sign in to HYPE')
  return ctx
}
/** @param id Shared record identity. @returns Status and field editor. */
export const recorderEditor = query(z.string().min(1).max(100), async id =>
  readRecorderEditor(await context(), id),
)
/** @param input Versioned record edits. @returns Persisted editor state. */
export const saveRecorder = command(
  z.object({
    id: z.string().min(1).max(100),
    revisionId: z.string().min(1).max(100),
    version: z.number().int().nonnegative(),
    modifiedAt: z.string().min(1).max(100),
    status: researchFeatureDefaultsSchema,
    values: z.record(
      z.string().min(1).max(100),
      z.union([
        z.string().max(50000),
        z.number().finite(),
        z.boolean(),
        z.array(z.string().max(200)).max(100),
        z.null(),
      ]),
    ),
  }),
  async input => saveRecorderEditor(await context(), input),
)
