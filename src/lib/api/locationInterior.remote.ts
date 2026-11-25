// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { eq, sql, desc, getTableColumns } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
import { authorizeExteriorLocation } from '#lib/locations/exterior/authorize.server.js'
// DATABASE
import { location, locationRevision } from '#lib/db/schema/location.js'
import { organisation } from '#lib/db/schema/organisation.js'
import { createLocalLocation } from '#lib/db/services/locationLocal.js'
import { relationshipScopeSql } from '#lib/db/services/locationRelationships.js'
import type { Database } from '#lib/types.js'
import { locationPremisesMap } from '#lib/db/schema/operator.js'
import { premisesMap } from '#lib/db/schema/premisesMap.js'
import { readMapBundle, saveMapDraft } from '#lib/db/services/premisesMap.js'
// DOMAIN
import { mapHash } from '#lib/indoor/releases.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'
import {
  floorplanExtractionSchema,
  floorplanBundle,
} from '#lib/indoor/floorplans/extraction.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. INTERIOR READS
// - readBuildingMap
// - getBuildingInteriorPreview
// - getLocationInterior
// 2. REVIEWED DRAFTS
// - saveLocationInterior
// 3. CANONICAL BUILDING PARTS
// - interiorParts
// - createLocationInteriorPart
// ---
/********************
 *  1. INTERIOR READS
 ************/
// +++ Interior Reads

const identity = z.object({ locationId: z.string().min(1).max(200) })

/** Find the map explicitly linked to a building after its ownership check.
 * @param db Authorized database. @param buildingId Building identity.
 * @returns The map with its current draft and publication pointers, if present.
 */
function readBuildingMap(
  db: Database,
  buildingId: string,
): Promise<typeof premisesMap.$inferSelect | undefined> {
  return db
    .select(getTableColumns(premisesMap))
    .from(locationPremisesMap)
    .innerJoin(premisesMap, eq(premisesMap.id, locationPremisesMap.mapId))
    .where(eq(locationPremisesMap.locationId, buildingId))
    .get()
}

/** Read only the viewable geometry for an embedded building-part profile.
 * @param input Containing building and revision advertised by the profile.
 * @returns The authorized interior data for the shared scene.
 */
export const getBuildingInteriorPreview = guardedQuery(
  identity.extend({ hash: z.string().regex(/^[a-f0-9]{64}$/) }),
  async (input, ctx) => {
    await authorizeExteriorLocation(ctx, input.locationId)
    // Pin the read to the advertised revision and recheck its visibility at fetch time.
    const map = await readBuildingMap(ctx.db, input.locationId)
    if (
      !map ||
      (input.hash !== map.publishedHash &&
        !(ctx.user.superAdmin && input.hash === map.draftHash))
    )
      error(404, 'Interior revision unavailable.')
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    return (await readMapBundle(bucket, map.id, input.hash)).data
  },
)

/** Read the building's existing indoor draft for the shared viewer. @param input Building ID. @returns Map metadata and draft bundle. */
export const getLocationInterior = guardedQuery(identity, async (input, ctx) => {
  await authorizeExteriorLocation(ctx, input.locationId)
  const map = (await readBuildingMap(ctx.db, input.locationId)) ?? null
  const hash = ctx.user.superAdmin
    ? (map?.draftHash ?? map?.publishedHash)
    : map?.publishedHash
  const bucket = premisesMapBucket(ctx.event.locals.platform)
  const bundle = hash && map ? await readMapBundle(bucket, map.id, hash) : null
  const jobId =
    bundle?.data.sourceDataset?.match(/^(?:gbp|footprint):([a-f0-9-]{36})$/)?.[1] ??
    null
  const reviewObject =
    ctx.user.superAdmin && jobId && hash
      ? await bucket.get(
          `interior-jobs/${input.locationId}/${jobId}/review-${hash}.json`,
        )
      : null
  const jobObject =
    ctx.user.superAdmin && jobId
      ? await bucket.get(`interior-jobs/${input.locationId}/${jobId}/result.json`)
      : null
  const job = jobObject ? await jobObject.json<{ pages: string[] }>() : null
  const building = await ctx.db
    .select()
    .from(location)
    .where(eq(location.id, input.locationId))
    .get()
  const parts = ctx.user.superAdmin
    ? await interiorParts(
        ctx.db,
        input.locationId,
        building?.ownerOrganisationId ?? null,
      )
    : []
  const organisations = ctx.user.superAdmin
    ? await ctx.db
        .select({
          id: organisation.id,
          name: sql<string>`COALESCE((SELECT name FROM organisationI18n WHERE organisationId=${organisation.id} ORDER BY CASE locale WHEN 'en' THEN 0 ELSE 1 END LIMIT 1),${organisation.id})`,
        })
        .from(organisation)
    : []
  return {
    parts,
    organisations,
    ownerOrganisationId: building?.ownerOrganisationId ?? null,
    canEdit: Boolean(ctx.user.superAdmin),
    map,
    bundle,
    review:
      reviewObject && jobId
        ? {
            jobId,
            pages: job?.pages ?? [],
            extraction: floorplanExtractionSchema.parse(await reviewObject.json()),
          }
        : null,
  }
})

// ---
/********************
 *  2. REVIEWED DRAFTS
 ************/
// +++ Reviewed Drafts
/** Save reviewed extraction as an unpublished standard indoor-map draft.
 * @param input Building, extraction job, reviewed geometry and expected version. @returns Draft pointer.
 * @remarks No room becomes a canonical building part automatically; no publication or routing is inferred.
 */
export const saveLocationInterior = guardedCommand(
  identity.extend({
    jobId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative(),
    extraction: floorplanExtractionSchema,
    reviewed: z.literal(true),
  }),
  async (input, ctx) => {
    if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
    await authorizeExteriorLocation(ctx, input.locationId)
    const bucket = premisesMapBucket(ctx.event.locals.platform)
    const result = await bucket.get(
      `interior-jobs/${input.locationId}/${input.jobId}/result.json`,
    )
    if (!result) error(409, 'Extraction is not ready for review.')
    const source = await result.json<{
      receipt: {
        pages: [number, number][]
        source?: {
          kind: string
          metresPerPixel?: number
          feature?: { properties: { csuid: string } }
        }
      }
    }>()
    for (const floor of input.extraction.floors) {
      const dimensions = source.receipt.pages[floor.page - 1]
      if (
        !dimensions ||
        dimensions[0] !== floor.width ||
        dimensions[1] !== floor.height
      )
        error(400, 'Keep the original source-page dimensions.')
    }
    let link = await ctx.db
      .select()
      .from(locationPremisesMap)
      .where(eq(locationPremisesMap.locationId, input.locationId))
      .get()
    if (!link) {
      if (input.expectedVersion !== 0) error(409, 'Interior changed; refresh.')
      const mapId =
        'building-' +
        input.locationId
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 70) +
        '-' +
        crypto.randomUUID().slice(0, 8)
      // Link creation is atomic; a concurrent creator cannot leave a second map attached to the building.
      await ctx.db.batch([
        ctx.db.insert(premisesMap).values({
          id: mapId,
          code: mapId,
          name: 'Building interior',
          nameZh: '',
          kind: 'building',
          updatedBy: ctx.user.id,
          updatedAt: new Date().toISOString(),
        }),
        ctx.db
          .insert(locationPremisesMap)
          .values({ locationId: input.locationId, mapId, createdBy: ctx.user.id }),
      ])
      link = {
        locationId: input.locationId,
        mapId,
        createdBy: ctx.user.id,
        createdAt: new Date().toISOString(),
      }
    }
    const building = await ctx.db
      .select()
      .from(location)
      .where(eq(location.id, input.locationId))
      .get()
    const parts = await interiorParts(
      ctx.db,
      input.locationId,
      building?.ownerOrganisationId ?? null,
    )
    const partsById = new Map(parts.map(part => [part.id, part]))
    // Every polygon association must stay inside this building and its explicitly selected floor.
    for (const floor of input.extraction.floors) {
      if (floor.locationId && !partsById.has(floor.locationId))
        error(400, 'Floor must belong to this building.')
      for (const unit of floor.units)
        if (unit.locationId) {
          const part = partsById.get(unit.locationId)
          if (
            !floor.locationId ||
            unit.locationId === floor.locationId ||
            !part?.parents.includes(floor.locationId)
          )
            error(400, 'Unit must belong to the selected canonical floor.')
        }
    }
    const bundle = floorplanBundle(input.extraction)
    const footprint = source.receipt.source?.kind === 'map-footprint'
    bundle.data.sourceDataset = `${footprint ? 'footprint' : 'gbp'}:${input.jobId}`
    if (footprint) {
      bundle.data.source = 'Reviewed Lands Department building footprint draft'
      for (const feature of bundle.data.level_polygon.features) {
        feature.properties.source_footprint_id =
          source.receipt.source?.feature?.properties.csuid
        feature.properties.source_metres_per_pixel =
          source.receipt.source?.metresPerPixel
      }
    }
    // Keep the editable reviewed source alongside the immutable map draft for later corrections.
    const reviewHash = await mapHash(JSON.stringify(bundle))
    await bucket.put(
      `interior-jobs/${input.locationId}/${input.jobId}/review-${reviewHash}.json`,
      JSON.stringify(input.extraction),
    )
    const saved = await saveMapDraft(ctx.db, bucket, {
      id: link.mapId,
      expectedVersion: input.expectedVersion,
      bundle,
      actorId: ctx.user.id,
    })
    return saved
  },
)

// ---
/********************
 *  3. CANONICAL BUILDING PARTS
 ************/
// +++ Canonical Building Parts
/** List current building parts using explicit membership, retaining labels and nesting.
 * @param db Authorized database. @param buildingId Owning building. @param scope Private owner scope.
 * @returns Current parts and their current parent identities.
 */
async function interiorParts(
  db: Database,
  buildingId: string,
  scope: string | null,
): Promise<{ id: string; name: string; parents: string[] }[]> {
  const pageSize = 250
  const parts = new Map<string, { id: string; name: string; parents: string[] }>()
  const membership = sql`r.assertionState='asserted' AND r.membershipState='current'
    AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now'))
    AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
    AND ${relationshipScopeSql('locationMembership', scope)}`
  let after: string | undefined
  // The parent/relationship index orders scoped heads. Independent assertions may describe the same part.
  for (;;) {
    const rows = await db.all<{
      relationshipId: string
      id: string
      name: string
      parents: string
    }>(sql`
      SELECT r.relationshipId, l.id,
        coalesce((SELECT coalesce(json_extract(c.facts,'$.i18n.en.name'), json_extract(c.facts,'$.names.en'))
          FROM locationRevisionContent c WHERE c.locationId=l.id ORDER BY c.version DESC LIMIT 1), l.id) name,
        (SELECT json_group_array(parentLocationId) FROM (
          SELECT DISTINCT r.parentLocationId FROM locationMembershipHead r
          WHERE r.childLocationId=l.id AND ${membership} ORDER BY r.parentLocationId
        )) parents
      FROM locationMembershipHead r JOIN location l ON l.id=r.childLocationId
      WHERE r.parentLocationId=${buildingId} AND ${membership}
        AND l.class='building_part' AND l.state!='redirect'
        AND (l.state!='manual' OR l.ownerOrganisationId IS ${scope})
        ${after === undefined ? sql`` : sql`AND r.relationshipId>${after}`}
      ORDER BY r.relationshipId LIMIT ${pageSize}`)
    for (const { id, name, parents } of rows) {
      parts.set(id, { id, name, parents: JSON.parse(parents) })
    }
    if (rows.length < pageSize) return [...parts.values()]
    after = rows[rows.length - 1].relationshipId
  }
}

/** Explicitly create a physical Floor or Unit identity; extraction never creates identities automatically.
 * @param input Building, owning organisation, name and optional parent Floor. @returns New canonical part identity.
 * @remarks Unit membership is fenced by the existing atomic building-part authoring service.
 */
export const createLocationInteriorPart = guardedCommand(
  identity.extend({
    organisationId: z.string().min(1),
    label: z.string().trim().min(1).max(200),
    floorId: z.string().min(1).optional(),
  }),
  async (input, ctx) => {
    if (!ctx.user.superAdmin || ctx.user.isAnonymous) error(403, 'SUPER_ADMIN_REQUIRED')
    await authorizeExteriorLocation(ctx, input.locationId)
    const building = await ctx.db
      .select()
      .from(location)
      .where(eq(location.id, input.locationId))
      .get()
    if (
      !building ||
      (building.state === 'manual' &&
        building.ownerOrganisationId !== input.organisationId)
    )
      error(400, 'Use the building owner organisation.')
    if (
      !(await ctx.db
        .select({ id: organisation.id })
        .from(organisation)
        .where(eq(organisation.id, input.organisationId))
        .get())
    )
      error(400, 'Organisation unavailable.')
    if (
      input.floorId &&
      !(
        await interiorParts(ctx.db, input.locationId, building.ownerOrganisationId)
      ).some(part => part.id === input.floorId)
    )
      error(400, 'Floor must belong to this building.')
    const revision = await ctx.db
      .select()
      .from(locationRevision)
      .where(eq(locationRevision.locationId, input.locationId))
      .orderBy(desc(locationRevision.version))
      .get()
    if (!revision) error(400, 'Building has no retained position.')
    return createLocalLocation(
      ctx.db,
      input.organisationId,
      {
        state: building.state === 'manual' ? 'manual' : 'unresolved',
        kind: 'building_part',
        buildingId: input.locationId,
        parentPartId: input.floorId,
        facts: {
          names: { en: input.label },
          phoneNumber: [],
          brands: [],
          location: {
            geometry: revision.facts.location.geometry,
            address: {
              status: 'unresolved',
              address2dId: null,
              address3dId: null,
              address3dUnitId: null,
              snapshotId: null,
              rawSource: {},
              fallbackDisplay: {},
            },
          },
        },
      },
      ctx.user.id,
    )
  },
)
