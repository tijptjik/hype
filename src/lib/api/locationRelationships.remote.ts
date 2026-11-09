import {
  readRelationshipPage,
  reorderLocationAddresses,
  readLocationLineage,
} from '#lib/db/services/locationRelationshipReview.js'
import { scheduleFeatureMtr } from '#lib/api/services/feature-mtr.js'
import { reconcileLocationPlacements } from '#lib/db/services/locationPlacement.js'
// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { canManageSharedLocationIdentity } from '#lib/api/services/authz/location.js'
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DOMAIN
import {
  RelationshipInputSchema,
  TransitionInputSchema,
} from '#lib/locations/relationships.js'
// SERVICES
import {
  appendLocationRelationship,
  appendLocationTransition,
} from '#lib/db/services/locationRelationships.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

/** Require account access and current authority over an explicit correction scope.
 * @param ctx Current request. @param scope Organisation or authoritative shared scope.
 * @param write Whether this operation authors shared assertions. @returns Nothing when allowed.
 */
async function authorizeScope(
  ctx: GuardedBaseContext,
  scope: string | null,
  write: boolean,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (scope) await requireLocationOrganisationManager(ctx, scope)
  else if (
    write &&
    !canManageSharedLocationIdentity({ ...ctx.user, userRoles: ctx.userRoles })
  )
    error(403, 'INSUFFICIENT_ROLE')
}

/** Append a complete scoped relationship correction, retaining prior versions.
 * @param input Exact assertion with its expected predecessor. @returns Immutable assertion identity.
 */
export const saveLocationRelationship = guardedCommand(
  RelationshipInputSchema,
  async (input, ctx) => {
    await authorizeScope(ctx, input.scopeOrganisationId, true)
    const id = await appendLocationRelationship(ctx.db, input, ctx.user.id)
    const reconciliation =
      input.table === 'locationOccupancy'
        ? await reconcileLocationPlacements(ctx.db, {
            locationId: input.establishmentLocationId,
            scopeOrganisationId: input.scopeOrganisationId,
            actorId: ctx.user.id,
          })
        : null
    for (const featureId of reconciliation?.movedFeatureIds ?? [])
      scheduleFeatureMtr(ctx.event.locals.platform, featureId)
    return { id, reconciliation }
  },
)

/** Retain evidenced replacement/merge/split lineage without moving Features.
 * @param input Event, expected predecessor and all participants. @returns Exact event identity.
 */
export const saveLocationTransition = guardedCommand(
  TransitionInputSchema,
  async (input, ctx) => {
    await authorizeScope(ctx, input.scopeOrganisationId, true)
    return { id: await appendLocationTransition(ctx.db, input, ctx.user.id) }
  },
)

/** Resume a bounded reconciliation in an authorized relationship scope.
 * @param input Subject/canonical target and opaque Feature cursor. @returns Counts and continuation.
 */
export const reconcilePlacementPage = guardedCommand(
  z
    .strictObject({
      locationId: z.string().optional(),
      addressRevisionId: z.string().optional(),
      organisationId: z.string().nullable(),
      afterFeatureId: z.string().optional(),
    })
    .refine(v => Boolean(v.locationId) !== Boolean(v.addressRevisionId)),
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, true)
    const result = await reconcileLocationPlacements(ctx.db, {
      ...input,
      scopeOrganisationId: input.organisationId,
      actorId: ctx.user.id,
    })
    for (const featureId of result.movedFeatureIds)
      scheduleFeatureMtr(ctx.event.locals.platform, featureId)
    return result
  },
)

/** Page current or historical relationships using persisted endpoint visibility.
 * @param input Subject and authorized assertion scope. @returns Rows and continuation cursor.
 */
export const getRelationshipPage = guardedQuery(
  z.strictObject({
    locationId: z.string().min(1),
    organisationId: z.string().nullable(),
    table: z.enum(['locationAddress', 'locationMembership', 'locationOccupancy']),
    history: z.boolean().default(false),
    afterId: z.string().optional(),
  }),
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, false)
    return readRelationshipPage(ctx.db, { ...input, scope: input.organisationId })
  },
)
/** Commit one reviewed complete address ordering; no address or Feature is rewritten.
 * @param input Exact heads and ordering operation. @returns Immutable successor references.
 */
export const reorderAddresses = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1),
    organisationId: z.string().nullable(),
    expectedIds: z.array(z.string().min(1)).max(100),
    orderedIds: z.array(z.string().min(1)).max(100),
    operationId: z.string().min(1).max(100),
  }),
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, true)
    return reorderLocationAddresses(
      ctx.db,
      { ...input, scope: input.organisationId },
      ctx.user.id,
    )
  },
)
/** Read visible lineage independently of redirect identity resolution.
 * @param input Subject and authorized scope. @returns Visible immutable event page.
 */
export const getLocationLineage = guardedQuery(
  z.strictObject({
    locationId: z.string().min(1),
    organisationId: z.string().nullable(),
    history: z.boolean().default(false),
    afterId: z.string().optional(),
  }),
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, false)
    return readLocationLineage(ctx.db, { ...input, scope: input.organisationId })
  },
)
