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
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
import { LocationNamesEditSchema } from '#lib/locations/validation.js'
import { LocationKindSchema } from '#lib/locations/kinds.js'
import { locationDiscoveryTypes } from '#lib/locations/kinds.js'
import { searchSaanSeoiPlaces } from '#lib/locations/sourceClient.js'
import { readSaanSeoiPlacePreview } from '#lib/locations/sourcePreview.js'
import { searchNearbySaanSeoiPlaces } from '#lib/locations/nearbySource.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
import { AddressDivisionOverridesSchema } from '#lib/addresses/divisions.js'
import { updateLocalLocationAddress } from '#lib/db/services/locationLocal.js'
import { LocalLocationFootprintSchema } from '#lib/locations/footprint.js'
// DB
import { probeLocationIdentityScope } from '#lib/db/services/locationIdentityReview.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import { listLocationLinkedFeatures } from '#lib/db/services/locationFeatures.js'
import { authorizeFeatureAdminReadForProbe } from '#lib/api/services/authz/feature.js'
// TYPES
import { location as locationTable } from '#lib/db/schema/location.js'
import { and, eq, ne } from 'drizzle-orm'
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
 * Browse shared Locations or Locations owned by or associated with a manageable Organisation.
 * @param input Literal search, kind/lifecycle filters, authorized Organisation and stable ID cursor.
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

/** Read current Feature links through each Feature's normal admin read policy.
 * @param input Location identity, owner context, locale and accessible-row cursor.
 * @returns Readable Feature names and parent context, never private associations from another scope.
 * @remarks Location ownership alone grants no Feature access. Every page reauthorizes both scopes.
 */
export const getLocationLinkedFeatures = guardedQuery(
  z.strictObject({
    locationId: z.string().min(1).max(200),
    organisationId: z.string().min(1).max(200).optional(),
    scope: z.string().max(4000).optional(),
    view: z.enum(['associated', 'placed', 'past']).optional(),
    locale: z.enum(['en', 'zhHant', 'zhHans']),
    after: z.string().min(1).max(200).optional(),
  }),
  async (input, ctx) => {
    await requireDirectoryAccess(ctx, input.organisationId)
    const identity = await probeLocationIdentityScope(ctx.db, input.locationId)
    if (!identity) return { data: [], nextCursor: null }
    if (identity.state === 'manual')
      await requireDirectoryAccess(ctx, identity.ownerOrganisationId ?? undefined)
    return listLocationLinkedFeatures(ctx.db, {
      ...input,
      canRead: probe =>
        authorizeFeatureAdminReadForProbe({
          user: ctx.user,
          userRoles: ctx.userRoles,
          probe,
        }).allowed,
    })
  },
)

/**
 * Save names, footprint, authored address and marker edits in the Location's authorized authoring scope.
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
    names: LocationNamesEditSchema.optional(),
    operatingStatus: OperatingStatusSchema.nullable().optional(),
    buildingStatus: BuildingStatusSchema.nullable().optional(),
    successorLocationId: z.string().trim().min(1).max(200).nullable().optional(),
    kind: LocationKindSchema.optional(),
    expectedKind: LocationKindSchema.optional(),
    address: LocalLocationAddressSchema.optional(),
    coordinates: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .optional(),
    divisionOverrides: AddressDivisionOverridesSchema.optional(),
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

/** Search read-only Place details for the type-aware standalone Location editor.
 * @param input Persisted Location scope, draft type and bounded text query.
 * @returns Verified latest-source previews with explicit partial coverage.
 * @remarks No preview is imported or linked as canonical identity. Writes and identity reviews remain separate.
 */
export const searchDirectoryLocationPlaces = guardedQuery(
  z.strictObject({
    locationId: z.string().min(1),
    organisationId: z.string().min(1),
    kind: LocationKindSchema,
    q: z.string().trim().min(1).max(200).optional(),
    coordinates: z.tuple([
      z.number().finite().min(113.7).max(114.6),
      z.number().finite().min(22.1).max(22.6),
    ]),
    locale: z.enum(['en', 'zh-hant', 'zh-hans']),
  }),
  async (input, ctx) => {
    await requireLocationOrganisationManager(ctx, input.organisationId)
    const identity = await probeLocationIdentityScope(ctx.db, input.locationId)
    if (!identity || identity.state === 'redirect') error(404, 'LOCATION_NOT_FOUND')
    if (
      identity.state === 'manual' &&
      identity.ownerOrganisationId !== input.organisationId
    )
      error(403, 'INSUFFICIENT_ROLE')
    if (!locationDiscoveryTypes(input.kind).includes('establishment'))
      return { rows: [], partial: false, limited: false }
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const client = { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch }
    const discovery = input.q
      ? {
          candidates: await searchSaanSeoiPlaces(client, {
            q: input.q,
            locale: input.locale,
            limit: 10,
          }),
          partial: false,
          limited: false,
        }
      : await searchNearbySaanSeoiPlaces(client, {
          coordinates: input.coordinates,
          radius: 300,
        })
    const candidates = discovery.candidates.slice(0, 10)
    const rows: {
      id: string
      facts: import('#lib/locations/model.js').LocationFacts
    }[] = []
    let partial = discovery.partial
    // Bound detail requests and retain successful previews when another candidate fails.
    for (let start = 0; start < candidates.length; start += 3) {
      const settled = await Promise.allSettled(
        candidates.slice(start, start + 3).map(async candidate => ({
          id: candidate.placeId,
          facts: await readSaanSeoiPlacePreview(client, {
            ssId: candidate.placeId,
            resourceReleaseId: candidate.resourceReleaseId,
          }),
        })),
      )
      for (const row of settled)
        if (row.status === 'fulfilled') rows.push(row.value)
        else partial = true
    }
    return {
      rows,
      partial,
      limited: discovery.limited || candidates.length === 10,
    }
  },
)
