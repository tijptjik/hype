// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
// DOMAIN
import {
  LIFECYCLE_STATUSES,
  OperatingStatusSchema,
  BuildingStatusSchema,
} from '#lib/locations/lifecycle.js'
import { LocationKindSchema } from '#lib/locations/kinds.js'
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { updateLocalLocationAddress } from '#lib/db/services/locationLocal.js'
import { LocalLocationFootprintSchema } from '#lib/locations/footprint.js'
// DB
import { and, eq, ne } from 'drizzle-orm'
import { location as locationTable } from '#lib/db/schema/location.js'
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
 * Browse shared Locations or the Locations owned by or associated with an Organisation.
 * @param input Literal search, kind, authorized Organisation scope and stable ID cursor.
 * @returns A bounded page without source payloads or associated Features.
 */
export const getLocations = guardedQuery(
  z.strictObject({
    includeCount: z.boolean().default(true),
    scope: z.string().max(4000).optional(),
    organisationId: z.string().min(1).max(200).optional(),
    q: z.string().trim().max(200).optional(),
    lifecycleStatus: z.enum(LIFECYCLE_STATUSES).optional(),
    kind: LocationKindSchema.optional(),
    after: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx, input.organisationId)
    return listLocationResources(ctx.db, {
      ...input,
      restrictToOrganisation: Boolean(input.organisationId),
    })
  },
)

/** Resolve a public discovery source to an existing shared Location details target.
 * @param input Stable source identity from the accepted discovery result.
 * @returns The permanent HYPE ID, or null if no shared Location has been imported.
 * @remarks Read-only: never materializes source records or exposes private manual identities.
 */
export const getSharedLocationIdBySource = guardedQuery(
  z.strictObject({ ssId: z.string().min(1).max(200) }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx)
    const row = await ctx.db
      .select({ id: locationTable.id })
      .from(locationTable)
      .where(and(eq(locationTable.ssId, input.ssId), ne(locationTable.state, 'manual')))
      .get()
    return row?.id ?? null
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
    organisationId: z.string().min(1).max(200).optional(),
    scope: z.string().max(4000).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx)
    const scope = await probeLocationIdentityScope(ctx.db, input.id)
    if (!scope) return null
    const identity = scope
    await requireDirectoryAccess(
      ctx,
      identity.state === 'manual'
        ? (scope.ownerOrganisationId ?? undefined)
        : input.organisationId,
    )
    let editingOrganisationId = input.organisationId ?? null
    if (!editingOrganisationId && identity.ssId === null && scope.ownerOrganisationId) {
      try {
        await requireLocationOrganisationManager(ctx, scope.ownerOrganisationId)
        editingOrganisationId = scope.ownerOrganisationId
      } catch {
        /* Shared reads do not grant the curator's authority. */
      }
    }
    if (editingOrganisationId)
      await requireLocationOrganisationManager(ctx, editingOrganisationId)
    const result = await listLocationResources(ctx.db, {
      id: input.id,
      organisationId: editingOrganisationId ?? undefined,
    })
    const resource = result.data[0]
    return resource
      ? {
          ...resource,
          editingOrganisationId,
          canEditAddress:
            editingOrganisationId !== null && identity.state !== 'redirect',
        }
      : null
  },
)

/**
 * Save authored address and marker edits in the Location's authorized authoring scope.
 * @param input Location identity, expected revisions and changed name/address groups.
 * @returns New revision; conflicts require reloading rather than overwriting another edit.
 * @remarks Name-only edits retain canonical address evidence. Source-linked edits remain Organisation corrections.
 */
export const saveLocalLocationAddress = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1),
    expectedRevisionId: z.string().min(1),
    organisationId: z.string().min(1).optional(),
    expectedOrganisationRevision: z.string().min(1).nullable().optional(),
    footprint: LocalLocationFootprintSchema.nullable().optional(),
    operatingStatus: OperatingStatusSchema.nullable().optional(),
    buildingStatus: BuildingStatusSchema.nullable().optional(),
    successorLocationId: z.string().trim().min(1).max(200).nullable().optional(),
    address: LocalLocationAddressSchema.optional(),
    coordinates: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .optional(),
    parseSource: z.record(z.string().max(32), z.string().max(4000)).optional(),
  }),
  async (input, ctx) => {
    const scope = await probeLocationIdentityScope(ctx.db, input.locationId)
    if (!scope) error(404, 'LOCATION_NOT_FOUND')
    const identity = scope
    if (!identity || identity.state === 'redirect') error(404, 'LOCATION_NOT_FOUND')
    const organisationId =
      input.organisationId ??
      (identity.ssId === null ? scope.ownerOrganisationId : null)
    if (!organisationId) error(403, 'ORGANISATION_CONTEXT_REQUIRED')
    await requireLocationOrganisationManager(ctx, organisationId)
    if (identity.state === 'manual' && scope.ownerOrganisationId !== organisationId)
      error(403, 'INSUFFICIENT_ROLE')
    const result = await updateLocalLocationAddress(ctx.db, {
      ...input,
      organisationId,
      actorId: ctx.user.id,
    })
    if (!result) error(409, 'LOCATION_CHANGED')
    return result
  },
)
