// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
// SCHEMA
import {
  fieldResearchSession as sessions,
  fieldResearchSessionLocation as sessionLocations,
} from '#lib/db/schema/fieldResearch.js'
// SERVICES
import { requireResearchSessionAccess } from '#lib/fieldResearch/access.js'
import { researchConfigurationVersion } from '#lib/fieldResearch/configuration.js'
import { readResearchSession } from '#lib/db/services/fieldResearch.js'
import { readMarkerDistricts } from '#lib/db/services/addressDivisions.js'
import { locationReadFields } from '#lib/db/services/locationReadProjection.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { LocationFootprintSchema } from '#lib/locations/footprint.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  isPhysicalBuildingParent,
  physicalBuildingMembers,
} from '#lib/db/services/physicalBuilding.js'
import type { PhysicalBuildingMember } from '#lib/locations/physicalBuilding.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
import { researchStreetAddresses } from '#lib/fieldResearch/locationStreets.js'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { canonicalLocationSQL } from '#lib/db/services/locationRedirect.js'
import { currentAddressLinks } from '#lib/db/services/buildingAddressLinks.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import {
  researchLocationDescendants,
  researchLocationDescendantsSQL,
  researchLocationInclusionSQL,
} from '#lib/db/services/fieldResearchLocations.js'

import { exteriorGalleryModel } from '#lib/locations/exterior/gallery.server.js'

import { hasLocationRelationshipsSQL } from '#lib/db/services/locationRelationshipReview.js'

const id = z.string().min(1).max(100)
const kind = z.enum(['premises', 'building', 'building_part'])

/** Search authorized Locations by kind within the session's owning organisation.
 * @param input Session, Location kind, query and cursor. @returns A paginated directory page.
 */
export const searchResearchLocations = guardedQuery(
  z.object({
    sessionId: id,
    kind,
    q: z.string().trim().min(1).max(200),
    after: z.string().optional(),
  }),
  async (input, ctx) => {
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    return listLocationResources(ctx.db, {
      kind: input.kind,
      q: input.q,
      after: input.after,
      organisationId: session.organisationId,
    })
  },
)

/** Read the explicitly selected Location identities and their latest readable names.
 * @param input Session identity and optional revision cache key. @returns The session's vetted Locations.
 */
export const getResearchLocations = guardedQuery(
  z.object({
    sessionId: id,
    revision: z.number().int().nonnegative().optional(),
    includeDistricts: z.boolean().optional(),
  }),
  async (input, ctx) => {
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    // Read effective names and addresses, including organisation corrections.
    const fields = await locationReadFields(
      ctx.db,
      sql`l.id`,
      sql`r.facts`,
      sql`scope.organisationId`,
      sql`r.id`,
    )
    // Read retained selections on databases that predate the membership backfill.
    // Once migrated, only effective membership assertions can expose a member.
    const members = sql`CASE WHEN EXISTS(
      SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='location_composition_member'
    ) THEN ${physicalBuildingMembers(sql`l.id`, session.organisationId)}
    WHEN l.ownerOrganisationId=scope.organisationId THEN (
      SELECT json_group_array(json(member)) FROM (
        SELECT v.rawSource->'$.member' member FROM locationRevision v
        WHERE v.locationId=l.id AND json_extract(v.rawSource,'$.kind')='physical-building-member'
        ORDER BY v.version
      )
    ) ELSE '[]' END`
    const rows = await ctx.db.all<{
      id: string
      kind: string
      names: string
      confirmedUnnamed: number | null
      footprint: string | null
      location: string
      linkedAddresses: string
      members: string
      editableParent: number
      hasRelationships: number
      inclusion: string
      assetId: string | null
      frontViewId: string | null
      sourceModelId: string | null
      interiorMaps: string
    }>(
      sql`WITH scope(organisationId) AS (VALUES (${session.organisationId}))
        SELECT l.id,l.matchingType kind,
          CASE WHEN l.matchingType='building' THEN ${hasLocationRelationshipsSQL(sql`sl.locationId`, sql`scope.organisationId`)} ELSE 0 END hasRelationships,
          CASE WHEN l.matchingType IN ('building','premises') THEN ${researchLocationInclusionSQL(sql`sl.locationId`, session.organisationId, sql`sl.sessionId`)} ELSE '{"total":0,"included":0}' END inclusion,
          exterior.assetId,exterior.sourceModelId,
          (SELECT a.alignment->>'$.frontViewId' FROM locationExteriorAlignment a
           WHERE a.locationId=exterior.locationId AND a.assetId=exterior.assetId AND a.geometryId=exterior.assetId
           ORDER BY a.revision DESC LIMIT 1) frontViewId,
          (SELECT json_group_array(json_object('id',id,'name',name,'hash',publishedHash)) FROM (
            SELECT m.id,m.name,m.publishedHash FROM locationPremisesMap link JOIN premisesMap m ON m.id=link.mapId
            WHERE link.locationId=l.id AND m.publishedHash IS NOT NULL
            UNION
            SELECT m.id,m.name,m.publishedHash FROM premisesMapUnit unit JOIN premisesMap m ON m.id=unit.mapId
            WHERE unit.locationId=l.id AND m.publishedHash IS NOT NULL ORDER BY name,id
          )) interiorMaps,
          (l.ownerOrganisationId=scope.organisationId AND l.state='unresolved' AND l.matchingType='building'
           AND ${isPhysicalBuildingParent(sql`l.id`)}) editableParent,
          CASE WHEN l.matchingType='building' THEN ${members} ELSE '[]' END members,
          (SELECT json_group_array(json(i18n)) FROM (
            SELECT coalesce(ar.components->'$.i18n','{}') i18n ${currentAddressLinks(session.organisationId)}
            AND ${canonicalLocationSQL(sql`r.locationId`)}=l.id
            ORDER BY r.priority IS NULL,r.priority,r.relationshipId)) linkedAddresses,
          coalesce(json_extract(r.facts,'$.common.footprint'),json_extract(r.facts,'$.footprint')) footprint,
          ${fields.names} names,${fields.confirmedUnnamed} confirmedUnnamed,${fields.location} location
        FROM scope CROSS JOIN fieldResearchSessionLocation sl JOIN location l ON l.id=sl.locationId
        LEFT JOIN locationExteriorModel exterior ON exterior.locationId=l.id
        LEFT JOIN locationRevisionContent r ON r.locationId=l.id AND r.version=(
          SELECT max(version) FROM locationRevisionContent WHERE locationId=l.id AND (l.state!='linked' OR origin='saanseoi'))
        WHERE sl.sessionId=${input.sessionId} AND l.state!='redirect'
          AND (l.state!='manual' OR l.ownerOrganisationId=${session.organisationId}) ORDER BY l.id`,
    )
    const exteriors = await Promise.all(
      rows.map(row => exteriorGalleryModel(ctx.db, ctx.event.locals.platform, row)),
    )
    const locations = rows.map((row, index) => {
      const names: Record<string, string> = JSON.parse(row.names ?? '{}')
      const location: {
        address?: FeatureAddress['source']
        geometry?: { coordinates?: [number, number] }
      } = JSON.parse(row.location ?? '{}')
      const addressValue = emptyFeatureAddress()
      if (location.address) addressValue.source = location.address
      const address = getAddressDisplay(addressValue, 'en', [], row.kind)
      const footprint = LocationFootprintSchema.safeParse(
        JSON.parse(row.footprint ?? 'null'),
      )
      const members = JSON.parse(row.members) as PhysicalBuildingMember[]
      const interiorMaps = JSON.parse(row.interiorMaps) as {
        id: string
        name: string
        hash: string
      }[]
      const choices = JSON.parse(row.linkedAddresses) as LocalLocationAddress['i18n'][]
      const linked = choices.flatMap(locales => {
        const value = locales.en ?? Object.values(locales)[0]
        if (!value) return []
        return researchStreetAddresses(
          value.formattedAddress ?? '',
          value.streetName ?? '',
          value.buildingNumberExpression ||
            [value.buildingNumberFrom, value.buildingNumberTo]
              .filter(Boolean)
              .join(value.buildingNumberConnector || '-'),
        )
      })
      // Prefer the existing English presentation and use a structured local street when only Chinese is available.
      const streetLocale =
        (['en', 'zhHant', 'zhHans'] as const).find(locale =>
          addressComponentValue(addressValue, locale, 'streetName'),
        ) ?? 'en'
      const primary = researchStreetAddresses(
        address || getAddressDisplay(addressValue, streetLocale, [], row.kind),
        addressComponentValue(addressValue, streetLocale, 'streetName'),
        addressComponentValue(addressValue, streetLocale, 'buildingNumberExpression'),
      )
      // The physical building's default display already summarizes its member addresses by street.
      const memberAddresses = members.flatMap(member =>
        member.addresses.flatMap(candidate => {
          const locale = candidate.display.en ? 'en' : Object.keys(candidate.display)[0]
          const street = candidate.streets?.[locale]
          return researchStreetAddresses(
            candidate.display[locale] ?? '',
            street?.name,
            street?.number,
          ).filter(
            entry =>
              entry.street && !primary.some(line => line.street === entry.street),
          )
        }),
      )
      const streetAddresses = [
        ...linked,
        ...memberAddresses,
        ...primary.filter(
          line => line.street || (!linked.length && !memberAddresses.length),
        ),
      ]
      return {
        id: row.id,
        kind: row.kind,
        names,
        confirmedUnnamed: row.confirmedUnnamed === 1,
        address,
        canEditPhysicalBuilding: Boolean(row.editableParent),
        hasRelationships: Boolean(row.hasRelationships),
        inclusion: JSON.parse(row.inclusion) as { total: number; included: number },
        hasExteriorMap: Boolean(row.assetId),
        ...exteriors[index],
        hasInteriorMap: interiorMaps.length > 0,
        interiorMaps,
        members: members.map(member => ({
          locationId: member.childLocationId,
          source: member.source,
          outlineRole: member.outlineRole,
          coordinates: member.coordinates,
          addresses: member.addresses.map(({ id, display, streets }) => ({
            id,
            display,
            streets,
          })),
        })),
        linkedAddresses: linked.map(entry => entry.label),
        streetAddresses,
        coordinates: location.geometry?.coordinates ?? null,
        footprint:
          footprint.success && footprint.data.mode === 'inline'
            ? footprint.data.geometry
            : null,
      }
    })
    // Only District grouping needs the published boundary geometry.
    const districts = input.includeDistricts
      ? await readMarkerDistricts(ctx.db, locations)
      : null
    return locations.map(location => ({
      ...location,
      districts: districts?.get(location.id) ?? [],
    }))
  },
)

/** Select a Location and optionally its explicitly related buildings and parts.
 * @param input Session revision, selected identity and expansion mode. @returns Number of identities selected.
 * @remarks Only current effective assertions visible to this organisation are followed; no proximity match is inferred.
 */
export const addResearchLocation = guardedCommand(
  z.object({
    sessionId: id,
    revision: z.number().int().nonnegative(),
    locationId: id,
    mode: z.enum(['single', 'buildings', 'buildings_and_parts', 'building_and_parts']),
  }),
  async (input, ctx) => {
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    const root = await ctx.db.get<{ kind: string }>(
      sql`SELECT matchingType kind FROM location WHERE id=${input.locationId} AND state!='redirect' AND (state!='manual' OR ownerOrganisationId=${session.organisationId})`,
    )
    if (!root || !['premises', 'building', 'building_part'].includes(root.kind))
      error(400, 'Choose an accessible premises, building or building part.')
    if (
      (input.mode === 'buildings' || input.mode === 'buildings_and_parts') &&
      root.kind !== 'premises'
    )
      error(400, 'Choose a premises.')
    if (input.mode === 'building_and_parts' && root.kind !== 'building')
      error(400, 'Choose a building.')
    const includeParts =
      input.mode === 'buildings_and_parts' || input.mode === 'building_and_parts'
    const descendants =
      input.mode === 'single'
        ? []
        : await researchLocationDescendants(
            ctx.db,
            input.locationId,
            session.organisationId,
            includeParts,
          )
    if (descendants.length > 5000)
      error(400, 'Too many Locations; add a smaller selection.')
    const ids =
      input.mode === 'single'
        ? [input.locationId]
        : descendants
            .filter(
              row => row.id !== input.locationId || input.mode === 'building_and_parts',
            )
            .map(row => row.id)
    if (!ids.length) return { count: 0 }
    // Each insert uses two bindings; the bounded chunks retain a single revision-fenced transaction.
    const inserts = []
    for (let start = 0; start < ids.length; start += 40)
      inserts.push(
        ctx.db
          .insert(sessionLocations)
          .values(
            ids
              .slice(start, start + 40)
              .map(locationId => ({ sessionId: input.sessionId, locationId })),
          )
          .onConflictDoNothing(),
      )
    const containmentGuard =
      input.mode === 'single'
        ? sql`1`
        : sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(ids)}) selected WHERE selected.value NOT IN (SELECT id FROM (${researchLocationDescendantsSQL(input.locationId, session.organisationId, includeParts)})))`
    const committed = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision} AND configurationVersion=${researchConfigurationVersion} AND status!='completed' AND isArchived=0) AND EXISTS(SELECT 1 FROM location root WHERE root.id=${input.locationId} AND root.matchingType=${root.kind} AND root.state!='redirect' AND (root.state!='manual' OR root.ownerOrganisationId=${session.organisationId})) AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(ids)}) picked LEFT JOIN location l ON l.id=picked.value WHERE l.id IS NULL OR l.state='redirect' OR (l.state='manual' AND l.ownerOrganisationId IS NOT ${session.organisationId})) AND ${containmentGuard}`,
      [
        ...inserts,
        ctx.db
          .update(sessions)
          .set({
            revision: sql`${sessions.revision}+1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sessions.id, input.sessionId)),
      ],
    )
    if (!committed) error(409, 'The session or Locations changed. Refresh and retry.')
    return { count: ids.length }
  },
)

/** Remove one explicitly selected Location without affecting other choices.
 * @param input Session revision and Location identity. @returns Nothing.
 */
export const removeResearchLocation = guardedCommand(
  z.object({ sessionId: id, revision: z.number().int().nonnegative(), locationId: id }),
  async (input, ctx) => {
    await requireResearchSessionAccess(ctx, input.sessionId)
    const committed = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision} AND configurationVersion=${researchConfigurationVersion} AND status!='completed' AND isArchived=0)`,
      [
        ctx.db
          .delete(sessionLocations)
          .where(
            and(
              eq(sessionLocations.sessionId, input.sessionId),
              eq(sessionLocations.locationId, input.locationId),
            ),
          ),
        ctx.db
          .update(sessions)
          .set({
            revision: sql`${sessions.revision}+1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sessions.id, input.sessionId)),
      ],
    )
    if (!committed) error(409, 'The session changed. Refresh and retry.')
  },
)

/** Add selected building parts together with one session revision.
 * @param input Session revision and selected parts. @returns Number selected.
 */
export const addResearchParts = guardedCommand(
  z.object({
    sessionId: id,
    revision: z.number().int().nonnegative(),
    locationIds: z.array(id).min(1).max(500),
  }),
  async (input, ctx) => {
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    const ids = [...new Set(input.locationIds)]
    const inserts = []
    for (let start = 0; start < ids.length; start += 40)
      inserts.push(
        ctx.db
          .insert(sessionLocations)
          .values(
            ids
              .slice(start, start + 40)
              .map(locationId => ({ sessionId: input.sessionId, locationId })),
          )
          .onConflictDoNothing(),
      )
    const committed = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision} AND configurationVersion=${researchConfigurationVersion} AND status!='completed' AND isArchived=0) AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(ids)}) picked LEFT JOIN location l ON l.id=picked.value WHERE l.id IS NULL OR l.matchingType!='building_part' OR l.state='redirect' OR (l.state='manual' AND l.ownerOrganisationId IS NOT ${session.organisationId}))`,
      [
        ...inserts,
        ctx.db
          .update(sessions)
          .set({
            revision: sql`${sessions.revision}+1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sessions.id, input.sessionId)),
      ],
    )
    if (!committed) error(409, 'The session or Locations changed. Refresh and retry.')
    return { count: ids.length }
  },
)
