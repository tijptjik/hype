// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { canManageSharedLocationIdentity } from '#lib/api/services/authz/location.js'
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DOMAIN
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { updateLocalLocationAddress } from '#lib/db/services/locationLocal.js'
// DB
import { probeLocationIdentityScope } from '#lib/db/services/locationIdentityReview.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/**
 * Authorize private catalogue access using current persisted Organisation ownership.
 * @param ctx Current request account and roles.
 * @param organisationId Optional private owner; omission allows only shared Locations.
 * @returns Nothing when authorized.
 * @remarks Public Feature visibility never grants access to private Location baselines.
 */
async function requireDirectoryAccess(
  ctx: GuardedBaseContext,
  organisationId?: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (!organisationId) return
  await requireLocationOrganisationManager(ctx, organisationId)
}

/**
 * Browse shared Locations and optionally one manageable Organisation's private Locations.
 * @param input Literal search, authorized owner scope and stable ID cursor.
 * @returns A bounded page without source payloads or associated Features.
 */
export const getLocations = guardedQuery(
  z.strictObject({
    scope: z.string().max(4000).optional(),
    organisationId: z.string().min(1).max(200).optional(),
    q: z.string().trim().max(200).optional(),
    after: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx, input.organisationId)
    return listLocationResources(ctx.db, input)
  },
)

/**
 * Read a Location by its permanent HYPE ID, independently of a Feature.
 * @param input Stable Location identity.
 * @returns Latest retained facts, or null if missing or moved out of the authorized scope.
 * @remarks Redirects remain explicit; this does not follow or accept another identity.
 */
export const getLocation = guardedQuery(
  z.strictObject({
    id: z.string().min(1).max(200),
    scope: z.string().max(4000).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx)
    const scope = await probeLocationIdentityScope(ctx.db, input.id)
    if (!scope) return null
    await requireDirectoryAccess(ctx, scope.ownerOrganisationId ?? undefined)
    const result = await listLocationResources(ctx.db, {
      id: input.id,
      organisationId: scope.ownerOrganisationId ?? undefined,
    })
    const resource = result.data[0]
    return resource
      ? {
          ...resource,
          canEditAddress:
            scope.ownerOrganisationId !== null ||
            canManageSharedLocationIdentity({
              isAnonymous: ctx.user.isAnonymous,
              userRoles: ctx.userRoles,
            }),
        }
      : null
  },
)

/**
 * Save locally authored address content on a private Location's next immutable revision.
 * @param input Location identity, expected latest revision and SaanSeoi-shaped content.
 * @returns New revision; conflicts require reloading rather than overwriting another edit.
 */
export const saveLocalLocationAddress = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1),
    expectedRevisionId: z.string().min(1),
    address: LocalLocationAddressSchema,
    parseSource: z.record(z.string().max(32), z.string().max(4000)).optional(),
  }),
  async (input, ctx) => {
    const scope = await probeLocationIdentityScope(ctx.db, input.locationId)
    if (!scope) error(404, 'LOCATION_NOT_FOUND')
    if (scope.ownerOrganisationId)
      await requireLocationOrganisationManager(ctx, scope.ownerOrganisationId)
    else if (
      !canManageSharedLocationIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    const result = await updateLocalLocationAddress(ctx.db, {
      ...input,
      organisationId: scope.ownerOrganisationId,
      actorId: ctx.user.id,
    })
    if (!result) error(409, 'LOCATION_CHANGED')
    return result
  },
)
