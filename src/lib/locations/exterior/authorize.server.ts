// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
// DATABASE
import { location } from '#lib/db/schema/location.js'
import { probeLocationIdentityScope } from '#lib/db/services/locationIdentityReview.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
import { isCanonicalLocationDraft } from '#lib/locations/canonicalDraft.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/** Apply the Location directory's ownership boundary before accessing a building model.
 * @param ctx Request context. @param locationId Location identity. @returns Nothing.
 */
export async function authorizeExteriorLocation(
  ctx: GuardedBaseContext,
  locationId: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const identity = await probeLocationIdentityScope(ctx.db, locationId)
  if (!identity || identity.state === 'redirect') error(404, 'LOCATION_NOT_FOUND')
  if (isCanonicalLocationDraft(identity) && !ctx.user.superAdmin)
    error(403, 'SUPER_ADMIN_REQUIRED')
  if (identity.state === 'manual' && identity.ownerOrganisationId)
    await requireLocationOrganisationManager(ctx, identity.ownerOrganisationId)
  const building = await ctx.db
    .select({ kind: location.entityKind, class: location.class })
    .from(location)
    .where(eq(location.id, locationId))
    .get()
  if (building?.kind !== 'built' || building.class !== 'building')
    error(404, 'BUILDING_NOT_FOUND')
}
