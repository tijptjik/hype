// TABLE OF CONTENTS
// 1. Authorized project queue
// 2. Canonical identity review
// 3. Reviewed Location lists
// ---
// SVELTE
import { error } from '@sveltejs/kit'
// THIRD PARTY
import { z } from 'zod'
import { sql } from 'drizzle-orm'
// API
import { guardedQuery, guardedCommand } from './server/guarded'
import {
  sharedLocationEditRights,
  requireLocationOrganisationManager,
} from './services/locationOwnership'
import { canManageSharedLocationIdentity } from './services/authz/location'
// SERVICES
import {
  pendingLocationReconciliation,
  readLocationReconciliationProgress,
  markLocationUnavailable,
  resetLocationUnavailable,
} from '#lib/db/services/locationReconciliation.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
import { findSaanSeoiPlace } from '#lib/locations/sourceLookup.js'
import { discoverLocationPublication } from '#lib/locations/publication.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
import { acceptReconciliationLocation } from '#lib/db/services/locationReconciliationAcceptance.js'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { authorizeFeatureUpdateForSubmission } from './services/authz/index.js'
import { readFeatureLocationBaseline } from '#lib/db/services/locationBaseline.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

type ProjectScope = { id: string; organisationId: string; name: string }
/** Resolve persisted project ancestry before exposing queue data. @param ctx Current request. @param ref Project ID or code. @returns Authorized project. */
async function scope(ctx: GuardedBaseContext, ref: string): Promise<ProjectScope> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const project = await ctx.db.get<ProjectScope>(
    sql`SELECT p.id,p.organisationId,coalesce((SELECT name FROM projectI18n WHERE projectId=p.id AND locale='en'),p.code) name FROM project p WHERE p.id=${ref} OR p.code=${ref} LIMIT 1`,
  )
  if (!project) error(404, 'PROJECT_NOT_FOUND')
  await requireLocationOrganisationManager(ctx, project.organisationId)
  return project
}

/** Read one unresolved Feature and authoritative progress. @param input Project, optional cursor or selected Feature. @returns Queue item, searchable fields and counts. @remarks Archived Features are excluded; skipped items remain unresolved and can be revisited. */
export const getLocationReconciliation = guardedQuery(
  z.strictObject({
    project: z.string().min(1).max(200),
    after: z.string().max(200).optional(),
    featureId: z.string().max(200).optional(),
  }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    const counts = await readLocationReconciliationProgress(ctx.db, project.id)
    const fields = await ctx.db.all<{ id: string; label: string }>(
      sql`SELECT DISTINCT p.id,coalesce(pi.label,p.id) label FROM featureProperty fp JOIN feature f ON f.id=fp.featureId JOIN property p ON p.id=fp.propertyId LEFT JOIN propertyI18n pi ON pi.propertyId=p.id AND pi.locale='en' WHERE f.projectId=${project.id} AND f.isArchived=0 AND p.dataType IN ('text','number','link') ORDER BY label,p.id`,
    )
    const row = await ctx.db.get<{
      id: string
      modifiedAt: string
      geometry: string
      name: string
      locationId: string | null
      associationVersion: string | null
      facts: string | null
      address: string | null
      addressProperties: string | null
    }>(
      sql`SELECT f.id,f.modifiedAt,f.geometry,coalesce((SELECT title FROM featureI18n WHERE featureId=f.id AND locale='en'),f.id) name,fl.locationId,fl.version associationVersion,lr.facts,(SELECT addressProperties FROM featureI18n WHERE featureId=f.id AND locale='en') addressProperties,(SELECT displayAddress FROM featureI18n WHERE featureId=f.id AND locale='en') address FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id LEFT JOIN location l ON l.id=fl.locationId LEFT JOIN locationRevisionContent lr ON lr.id=fl.factsRevisionId WHERE f.projectId=${project.id} AND f.isArchived=0 AND ${pendingLocationReconciliation} AND (${input.featureId ?? null} IS NULL OR f.id=${input.featureId ?? null}) AND (${input.after ?? null} IS NULL OR f.id>${input.after ?? null}) ORDER BY f.id LIMIT 1`,
    )
    if (!row) return { project, counts, fields, item: null }
    const facts = row.facts ? readLocationFacts(row.facts) : null
    const baseline = await readFeatureLocationBaseline(
      ctx.db,
      row.id,
      project.id,
      undefined,
      'explicit',
    )
    const properties = await ctx.db.all<{ id: string; value: string | null }>(
      sql`SELECT fp.propertyId id,coalesce((SELECT value FROM propertyValueI18n WHERE propertyValueId=fp.propertyValueId AND locale='en'),(SELECT value FROM featurePropertyI18n WHERE featureId=fp.featureId AND propertyId=fp.propertyId AND locale='en'),fp.value) value FROM featureProperty fp WHERE fp.featureId=${row.id}`,
    )
    const brand = await ctx.db.get<{ name: string }>(
      sql`SELECT i.name FROM locationSharedHead h JOIN identityCatalogue c ON c.id=json_extract(h.corrections,'$.brandId.choice.value') JOIN identityCatalogueI18n i ON i.catalogueId=c.id AND i.version=c.version AND i.locale='en' WHERE h.locationId=${row.locationId} AND json_extract(h.corrections,'$.brandId.choice.mode')='override' AND json_extract(h.corrections,'$.brandId.supersededBy') IS NULL LIMIT 1`,
    )
    return {
      project,
      counts,
      fields,
      item: {
        id: row.id,
        name: row.name,
        modifiedAt: row.modifiedAt,
        locationId: row.locationId,
        associationVersion: row.associationVersion,
        address: row.address,
        phoneNumber:
          baseline.status === 'ready'
            ? (baseline.baseline.effective.phoneNumber ?? [])
            : [],
        addressProperties: row.addressProperties
          ? (JSON.parse(row.addressProperties) as Record<string, unknown>)
          : {},
        geometry: (facts?.location.geometry ?? JSON.parse(row.geometry)) as {
          type: string
          coordinates: unknown
        },
        brand: brand?.name || facts?.brands?.[0]?.names.en || '',
        properties: properties.reduce<Record<string, string>>((values, property) => {
          if (property.value)
            values[property.id] = [values[property.id], property.value]
              .filter(Boolean)
              .join(' ')
          return values
        }, {}),
      },
    }
  },
)

/** Capture the selected canonical identity without creating a duplicate Location. @param input Project, Feature, retained Location and exact source release. @returns Review ID and canonical details. @remarks Rechecks Location ownership, association and source release; acceptance remains explicit. */
export const prepareReconciliationMatch = guardedCommand(
  z.strictObject({
    project: z.string().min(1),
    featureId: z.string().min(1),
    locationId: z.string().min(1),
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    const row = await ctx.db.get<{ ownerOrganisationId: string | null }>(
      sql`SELECT l.ownerOrganisationId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId WHERE f.id=${input.featureId} AND f.projectId=${project.id} AND f.isArchived=0 AND l.id=${input.locationId} AND l.state IN ('unresolved','manual')`,
    )
    if (!row) error(409, 'LOCATION_ASSOCIATION_CHANGED')
    if (row.ownerOrganisationId)
      await requireLocationOrganisationManager(ctx, row.ownerOrganisationId)
    else if (
      !canManageSharedLocationIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    const baseline = await readLocationIdentityBaseline(
      ctx.db,
      input.locationId,
      row.ownerOrganisationId,
    )
    if (!baseline) error(409, 'LOCATION_IDENTITY_CHANGED')
    const env = ctx.event.locals.platform?.env
    const client = {
      ...locationSourceEndpoint(
        env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY ?? '',
      ),
      fetch: ctx.event.fetch,
    }
    if (!client.apiKey) error(503, 'LOCATION_SOURCE_UNAVAILABLE')
    const publication = await discoverLocationPublication(client)
    const found = await findSaanSeoiPlace(client, publication.pin, input.ssId)
    if (!found) error(404, 'LOCATION_SOURCE_NOT_FOUND')
    if (found.projection.releaseId !== input.resourceReleaseId)
      error(409, 'LOCATION_SOURCE_CHANGED')
    const reviewId = await captureLocationIdentityReview(
      ctx.db,
      baseline,
      found.projection,
      ctx.user.id,
    )
    if (!reviewId) error(409, 'LOCATION_IDENTITY_CHANGED')
    return { reviewId, facts: found.projection.facts }
  },
)

/** Explicitly accept that the current Location has no available upstream match.
 * @param input Project, current Feature and retained Location identity.
 * @returns Server-generated last manual match timestamp.
 * @remarks Merely searching or skipping never calls this command; authorization and association are rechecked.
 */
export const markReconciliationUnavailable = guardedCommand(
  z.strictObject({
    project: z.string().min(1).max(200),
    featureId: z.string().min(1).max(200),
    locationId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    const row = await ctx.db.get<{ ownerOrganisationId: string | null }>(sql`
      SELECT l.ownerOrganisationId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
        JOIN location l ON l.id=fl.locationId
      WHERE f.id=${input.featureId} AND f.projectId=${project.id} AND f.isArchived=0
        AND l.id=${input.locationId} AND l.state IN ('unresolved','manual') AND l.ssId IS NULL
    `)
    if (!row) error(409, 'LOCATION_ASSOCIATION_CHANGED')
    if (row.ownerOrganisationId)
      await requireLocationOrganisationManager(ctx, row.ownerOrganisationId)
    else if (
      !canManageSharedLocationIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    const result = await markLocationUnavailable(ctx.db, {
      projectId: project.id,
      featureId: input.featureId,
      locationId: input.locationId,
      ownerOrganisationId: row.ownerOrganisationId,
    })
    if (!result) error(409, 'LOCATION_ASSOCIATION_CHANGED')
    return result
  },
)

/** Clear an accepted unavailable disposition so the Location can be reviewed again.
 * @param input Project, current Feature and retained Location identity.
 * @returns The Location identity whose disposition was cleared.
 * @remarks Merely searching or skipping never calls this command; authorization and association are rechecked.
 */
export const resetReconciliationUnavailable = guardedCommand(
  z.strictObject({
    project: z.string().min(1).max(200),
    featureId: z.string().min(1).max(200),
    locationId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    const row = await ctx.db.get<{ ownerOrganisationId: string | null }>(sql`
      SELECT l.ownerOrganisationId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
        JOIN location l ON l.id=fl.locationId
      WHERE f.id=${input.featureId} AND f.projectId=${project.id} AND f.isArchived=0
        AND l.id=${input.locationId} AND l.state IN ('unresolved','manual') AND l.ssId IS NULL
    `)
    if (!row) error(409, 'LOCATION_ASSOCIATION_CHANGED')
    if (row.ownerOrganisationId)
      await requireLocationOrganisationManager(ctx, row.ownerOrganisationId)
    else if (
      !canManageSharedLocationIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    const result = await resetLocationUnavailable(ctx.db, {
      projectId: project.id,
      featureId: input.featureId,
      locationId: input.locationId,
      ownerOrganisationId: row.ownerOrganisationId,
    })
    if (!result) error(409, 'LOCATION_ASSOCIATION_CHANGED')
    return result
  },
)

/** List accepted unavailable Features using the same authorized project boundary.
 * @param input Project reference. @returns Feature rows and retained Location identities.
 * @remarks Resetting a shared Location returns all its associated Features to review.
 */
export const getUnavailableReconciliation = guardedQuery(
  z.strictObject({ project: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    return ctx.db.all<{
      id: string
      name: string
      address: string | null
      locationId: string
      lastManualMatchAttemptAt: string
    }>(sql`
      SELECT f.id,coalesce(i.title,f.id) name,i.displayAddress address,l.id locationId,l.lastManualMatchAttemptAt
      FROM feature f JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId
      LEFT JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
      WHERE f.projectId=${project.id} AND f.isArchived=0 AND l.lastManualMatchAttemptAt IS NOT NULL
        AND (l.state!='linked' OR l.ssId IS NULL)
      ORDER BY name,f.id
    `)
  },
)

/** Read upstream identities already associated with active Features in this project.
 * @param input Project reference. @returns Source identities for marker status.
 * @remarks Fresh local status is kept separate from cached upstream search results.
 */
export const getReconciliationLinkedSources = guardedQuery(
  z.strictObject({ project: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    return ctx.db.all<{ ssId: string }>(sql`
      SELECT DISTINCT l.ssId FROM feature f
      JOIN featureLocation fl ON fl.featureId=f.id
      JOIN location l ON l.id=fl.locationId
      WHERE f.projectId=${project.id} AND f.isArchived=0
        AND l.state='linked' AND l.ssId IS NOT NULL
    `)
  },
)

/** List matched Features within the authorized project.
 * @param input Project reference. @returns Rows with the recorded match date when known.
 * @remarks Baseline imports have no reliable association date; ordinary facts updates do not reset it.
 */
export const getMatchedReconciliation = guardedQuery(
  z.strictObject({ project: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    // Start at the current uninterrupted association, then account for later identity acceptance.
    return ctx.db.all<{
      id: string
      name: string
      address: string | null
      locationId: string
      matchedAt: string | null
    }>(sql`
      SELECT f.id,coalesce(i.title,f.id) name,i.displayAddress address,l.id locationId,
        (SELECT CASE
          WHEN h.action='baseline' THEN
            (SELECT max(ih.createdAt) FROM locationIdentityHistory ih
             WHERE ih.locationId=l.id AND ih.ssId=l.ssId AND ih.createdAt>h.createdAt
               AND (ih.previousState!='linked' OR ih.previousSsId IS NOT ih.ssId))
          ELSE max(h.createdAt,coalesce(
            (SELECT max(ih.createdAt) FROM locationIdentityHistory ih
             WHERE ih.locationId=l.id AND ih.ssId=l.ssId
               AND (ih.previousState!='linked' OR ih.previousSsId IS NOT ih.ssId)),h.createdAt))
          END
         FROM featureLocationHistory h
         WHERE h.featureId=f.id AND h.locationId=l.id AND h.action!='unlink'
           AND h.id>coalesce((SELECT max(prior.id) FROM featureLocationHistory prior
             WHERE prior.featureId=f.id AND (prior.locationId!=l.id OR prior.action='unlink')),0)
         ORDER BY h.id LIMIT 1) matchedAt
      FROM feature f JOIN featureLocation fl ON fl.featureId=f.id JOIN location l ON l.id=fl.locationId
      LEFT JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
      WHERE f.projectId=${project.id} AND f.isArchived=0 AND l.state='linked' AND l.ssId IS NOT NULL
      ORDER BY name,f.id
    `)
  },
)

/** Accept the reviewed upstream association with missing-phone community curation.
 * @param input Persisted source revision and Feature concurrency pins. @returns Association receipt.
 * @remarks HK Foodworks authorship is resolved and authorized server-side; source facts are never supplied by clients.
 */
export const acceptReconciliationMatch = guardedCommand(
  z.strictObject({
    project: z.string().min(1),
    featureId: z.string().min(1),
    locationId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedFeatureModifiedAt: z.string().min(1),
    expectedRevision: z.string().nullable(),
  }),
  async (input, ctx) => {
    const project = await scope(ctx, input.project)
    const feature = await probeFeatureForUpdate(ctx.db, input.featureId)
    if (!feature || feature.projectId !== project.id) error(404, 'FEATURE_NOT_FOUND')
    const decision = authorizeFeatureUpdateForSubmission({
      user: ctx.user,
      userRoles: ctx.userRoles,
      resource: feature,
      submittedData: {
        i18n: true,
        properties: true,
        geometry: true,
        addressMeta: true,
      },
    })
    if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
    const result = await acceptReconciliationLocation(ctx.db, {
      ...input,
      projectId: project.id,
      actorId: ctx.user.id,
      scopeGuard: buildFeatureCommandScopeGuard(ctx.db, input.featureId, feature),
      authorizePhoneCuration: async () => {
        const author = await ctx.db.get<{ id: string }>(
          sql`SELECT id FROM organisation WHERE code='hkfoodworks'`,
        )
        if (!author) error(409, 'CURATION_AUTHOR_ORGANISATION_MISSING')
        await requireLocationOrganisationManager(ctx, author.id)
        const rights = await sharedLocationEditRights(ctx, project.id)
        if (!rights.canEdit && !rights.superAdmin) error(403, 'INSUFFICIENT_ROLE')
        return { organisationId: author.id, rights }
      },
    })
    if (!result) error(409, 'LOCATION_LINK_CHANGED')
    return result
  },
)
