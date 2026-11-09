import { sql } from 'drizzle-orm'
import { sharedLocationEditRights } from './services/locationOwnership'
// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { canAccessAdminPanel } from '#lib/api/services/authz/user.js'
// DOMAIN
import { AccessibilitySaveSchema } from '#lib/locations/accessibility.js'
// SERVICES
import {
  readLocationAccessibility,
  saveLocationAccessibility,
} from '#lib/db/services/locationAccessibility.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/** Allow every non-anonymous admin-panel contributor to edit these shared observations.
 * @param ctx Fresh session and persisted roles. @returns Nothing when permitted.
 * @remarks This grants no authority over identity, addresses, private Locations or source snapshots.
 */
function requireContributor(ctx: GuardedBaseContext): void {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (!canAccessAdminPanel({ ...ctx.user, userRoles: ctx.userRoles }))
    error(403, 'INSUFFICIENT_ROLE')
}

/** Read shared direct observations and separately labelled venue signals.
 * @param input Exact Location ID. @returns Current view, or null for a private/unsupported Location.
 */
export const getLocationAccessibility = guardedQuery(
  z.strictObject({ locationId: z.string().min(1).max(200) }),
  async (input, ctx) => {
    requireContributor(ctx)
    return readLocationAccessibility(ctx.db, input.locationId)
  },
)

/** Publish a revision of shared accessibility values from any authorized admin.
 * @param input Four independent values and concurrency tokens. @returns New revision ID.
 * @remarks No evidence is collected; actor and edit date are retained for ordinary history.
 */
export const updateLocationAccessibility = guardedCommand(
  AccessibilitySaveSchema,
  async (input, ctx) => {
    requireContributor(ctx)
    const projects = await ctx.db.all<{ projectId: string }>(
      sql`SELECT DISTINCT f.projectId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id WHERE fl.locationId=${input.locationId}`,
    )
    let rights = { canEdit: false, superAdmin: Boolean(ctx.user.superAdmin) }
    for (const project of projects) {
      rights = await sharedLocationEditRights(ctx, project.projectId)
      if (rights.canEdit || rights.superAdmin) break
    }
    if (!rights.canEdit && !rights.superAdmin)
      error(403, 'SHARED_LOCATION_EDIT_FORBIDDEN')
    try {
      const id = await saveLocationAccessibility(ctx.db, input, ctx.user.id, rights)
      // The revision is committed; a refresh failure must not invite a duplicate save.
      try {
        await getLocationAccessibility({ locationId: input.locationId }).refresh()
      } catch (refreshError) {
        console.error(
          'Accessibility revision saved, but query refresh failed:',
          refreshError,
        )
      }
      return { id }
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'ACCESSIBILITY_CHANGED')
        error(409, 'ACCESSIBILITY_CHANGED')
      throw cause
    }
  },
)
