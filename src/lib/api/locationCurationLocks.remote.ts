// FRAMEWORK
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
// DOMAIN
import { CurationOpenFieldsSchema } from '#lib/locations/curationLocks.js'
// SERVICES
import {
  readLocationCurationLocks,
  saveLocationCurationLocks,
} from '#lib/db/services/locationCurationLocks.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

/** Require authenticated platform authority independently of ordinary community edit rights.
 * @param ctx Current server session. @returns Nothing; rejects all non-SuperAdmin callers.
 */
function requireLockManager(ctx: GuardedBaseContext): void {
  if (ctx.user.isAnonymous || !ctx.user.superAdmin)
    error(403, 'CURATION_LOCK_SUPERADMIN_REQUIRED')
}
const identity = z.strictObject({ locationId: z.string().min(1).max(200) })

/** Read the current boolean controls for the SuperAdmin lock dialog.
 * @param input Location identity. @returns Current immutable lock head.
 */
export const getCommunityCurationLocks = guardedQuery(identity, async (input, ctx) => {
  requireLockManager(ctx)
  return readLocationCurationLocks(ctx.db, input.locationId)
})

/** Save field openness without altering community values or Organisation acceptance.
 * @param input Location, displayed lock revision and desired boolean controls.
 * @returns Saved lock head; stale dialogs must reload before changing controls.
 */
export const setCommunityCurationLocks = guardedCommand(
  identity.extend({
    expectedRevision: z.string().min(1).nullable(),
    openFields: CurationOpenFieldsSchema,
  }),
  async (input, ctx) => {
    requireLockManager(ctx)
    const saved = await saveLocationCurationLocks(ctx.db, {
      ...input,
      actorId: ctx.user.id,
      superAdmin: true,
    })
    if (!saved) error(409, 'COMMUNITY_CURATION_LOCKS_CHANGED')
    return saved
  },
)
