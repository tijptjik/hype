// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requirePlaceOrganisationManager } from '#lib/api/services/placeOwnership.js'
// DOMAIN
import { LocalPlaceAddressSchema } from '#lib/addresses/localPlaceAddress.js'
import { updateLocalPlaceAddress } from '#lib/db/services/placeLocal.js'
// DB
import { probePlaceIdentityScope } from '#lib/db/services/placeIdentityReview.js'
import { listPlaceResources } from '#lib/db/services/placeDirectory.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/**
 * Authorize private catalogue access using current persisted Organisation ownership.
 * @param ctx Current request account and roles.
 * @param organisationId Optional private owner; omission allows only shared Places.
 * @returns Nothing when authorized.
 * @remarks Public Feature visibility never grants access to private Place baselines.
 */
async function requireDirectoryAccess(
  ctx: GuardedBaseContext,
  organisationId?: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (!organisationId) return
  await requirePlaceOrganisationManager(ctx, organisationId)
}

/**
 * Browse shared Places and optionally one manageable Organisation's private Places.
 * @param input Literal search, authorized owner scope and stable ID cursor.
 * @returns A bounded page without source payloads or associated Features.
 */
export const getPlaces = guardedQuery(
  z.strictObject({
    scope: z.string().max(4000).optional(),
    organisationId: z.string().min(1).max(200).optional(),
    q: z.string().trim().max(200).optional(),
    after: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx, input.organisationId)
    return listPlaceResources(ctx.db, input)
  },
)

/**
 * Read a Place by its permanent HYPE ID, independently of a Feature.
 * @param input Stable Place identity.
 * @returns Latest retained facts, or null if missing or moved out of the authorized scope.
 * @remarks Redirects remain explicit; this does not follow or accept another identity.
 */
export const getPlace = guardedQuery(
  z.strictObject({
    id: z.string().min(1).max(200),
    scope: z.string().max(4000).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx)
    const scope = await probePlaceIdentityScope(ctx.db, input.id)
    if (!scope) return null
    await requireDirectoryAccess(ctx, scope.ownerOrganisationId ?? undefined)
    const result = await listPlaceResources(ctx.db, {
      id: input.id,
      organisationId: scope.ownerOrganisationId ?? undefined,
    })
    return result.data[0] ?? null
  },
)

/**
 * Save locally authored address content on a private Place's next immutable revision.
 * @param input Place identity, expected latest revision and SaanSeoi-shaped content.
 * @returns New revision; conflicts require reloading rather than overwriting another edit.
 */
export const saveLocalPlaceAddress = guardedCommand(
  z.strictObject({
    placeId: z.string().min(1),
    expectedRevisionId: z.string().min(1),
    address: LocalPlaceAddressSchema,
  }),
  async (input, ctx) => {
    const scope = await probePlaceIdentityScope(ctx.db, input.placeId)
    if (!scope?.ownerOrganisationId) error(403, 'PRIVATE_PLACE_REQUIRED')
    await requirePlaceOrganisationManager(ctx, scope.ownerOrganisationId)
    const result = await updateLocalPlaceAddress(ctx.db, {
      ...input,
      organisationId: scope.ownerOrganisationId,
      actorId: ctx.user.id,
    })
    if (!result) error(409, 'PLACE_CHANGED')
    return result
  },
)
