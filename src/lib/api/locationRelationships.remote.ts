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
import { sql } from 'drizzle-orm'
// SOURCES
import { loadBuildingDetails } from '#lib/sources/saanseoi.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
import { BuildingSourceSchema } from '#lib/locations/buildingSource.js'
// SERVICES
import {
  currentAddressLinks,
  linkBuildingAddressRevisions,
} from '#lib/db/services/buildingAddressLinks.js'
import { canonicalLocationSQL } from '#lib/db/services/locationRedirect.js'
import { retainPublishedAddress } from '#lib/db/services/addressCanonical.js'
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

const buildingScope = z.strictObject({
  locationId: z.string().min(1).max(200),
  organisationId: z.string().nullable(),
})

/** Require a visible building and resolve its retained export reference, if any.
 * @param ctx Authorized request. @param input Target and authoring scope. @returns Verified building source or null for local buildings.
 */
async function reviewedBuilding(
  ctx: GuardedBaseContext,
  input: z.infer<typeof buildingScope>,
) {
  const row = await ctx.db.get<{ source: string | null }>(sql`SELECT
    (SELECT json_extract(v.rawSource,'$.buildingSource') FROM locationRevision v WHERE v.locationId=l.id
      AND json_extract(v.rawSource,'$.kind')='building-export-baseline' ORDER BY v.version DESC LIMIT 1) source
    FROM location l WHERE l.id=${input.locationId} AND l.matchingType='building' AND l.state!='redirect'
      AND (l.state!='manual' OR l.ownerOrganisationId IS ${input.organisationId})
      AND (${ctx.user.superAdmin ? 1 : 0}=1 OR l.state!='unresolved' OR l.ssId IS NOT NULL OR l.ownerOrganisationId IS NOT NULL)`)
  if (!row) error(404, 'Building unavailable in this scope.')
  return row.source ? BuildingSourceSchema.parse(JSON.parse(row.source)) : null
}

/** Load the footprint reference and identifiers already linked to this building.
 * @param input Building and scope. @returns Published footprint choices and currently linked publisher address IDs.
 */
export const getBuildingAddressReview = guardedQuery(
  buildingScope,
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, true)
    const source = await reviewedBuilding(ctx, input)
    const rows = await ctx.db.all<{
      id: string
    }>(sql`SELECT (SELECT json_extract(a.sourceKey,'$.id') FROM address a WHERE a.id=ar.addressId) id
    ${currentAddressLinks(input.organisationId)} AND ${canonicalLocationSQL(sql`r.locationId`)}=${input.locationId}
    AND EXISTS (SELECT 1 FROM address a WHERE a.id=ar.addressId AND json_extract(a.sourceKey,'$.provider')='saanseoi' AND json_extract(a.sourceKey,'$.family')='addresses')`)
    const choices = source
      ? (await loadBuildingDetails(source.id, source.release)).addresses
      : []
    return { choices, linked: rows.map(row => row.id) }
  },
)

/** Verify reviewed publisher addresses and attach the whole selection to one Building.
 * @param input Target building, scope and selected snapshot references. @returns Number of reviewed addresses.
 */
export const linkBuildingAddresses = guardedCommand(
  buildingScope.extend({
    addresses: z
      .array(
        z.strictObject({
          id: z
            .string()
            .regex(/^ss-[a-zA-Z0-9-]+$/)
            .max(200),
          snapshotId: z.string().min(1).max(200),
        }),
      )
      .min(1)
      .max(30),
  }),
  async (input, ctx) => {
    await authorizeScope(ctx, input.organisationId, true)
    await reviewedBuilding(ctx, input)
    const env = ctx.event.locals.platform?.env
    const endpoint = locationSourceEndpoint(
      env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY ?? '',
    )
    const revisions = []
    // Read authoritative content by ID and verify the snapshot the editor saw before adding any relationship.
    for (const item of input.addresses) {
      const url = new URL(
        '/addresses/v0.1/' + encodeURIComponent(item.id),
        endpoint.baseUrl,
      )
      url.search = new URLSearchParams({
        region: 'hk',
        domain: 'saanseoi',
        profile: 'full',
        locales: 'en,zh-hant,zh-hans',
      }).toString()
      const result = await ctx.event.fetch(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          ...(endpoint.apiKey ? { 'x-api-key': endpoint.apiKey } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })
      if (!result.ok) error(409, 'Address unavailable. Refresh the address choices.')
      const revision = await retainPublishedAddress(
        ctx.db,
        item.id,
        item.snapshotId,
        z.record(z.string(), z.unknown()).parse(await result.json()),
        sql`1`,
      )
      if (!revision)
        error(409, 'The published address changed. Refresh the address choices.')
      revisions.push(revision)
    }
    await linkBuildingAddressRevisions(
      ctx.db,
      input.locationId,
      input.organisationId,
      revisions,
      ctx.user.id,
    )
    return { count: revisions.length }
  },
)
