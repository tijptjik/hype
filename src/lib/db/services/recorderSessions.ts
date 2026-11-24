// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { researchConfigurationVersion } from '#lib/fieldResearch/configuration.js'
import { researchProjectAccess } from '#lib/fieldResearch/access.js'
import {
  facilityCategory,
  facilitySymbol,
  facilitySymbols,
} from '#lib/indoor/facilities.js'
import { locationFacilityNames } from '#lib/locations/facilityNames.js'
import { locationReadFields } from './locationReadProjection'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  RecorderLocation,
  RecorderRecord,
  RecorderPlace,
  RecorderMap,
  MapPoint,
  RecorderOption,
  RecorderSession,
} from '#lib/fieldResearch/recorder.js'

// TABLE OF CONTENTS
// 1. Session visibility and ordering
// 2. Assigned Locations and their known ancestors
// 3. Record list and capture

type Actor = Parameters<typeof researchProjectAccess>[0]
type Context = Actor & { db: Database }

/** Limit every mobile operation to visible sessions in the contributor's project scope.
 * @param actor Request identity and current roles. @returns SQL predicate for session alias s.
 */
function visible(actor: Actor) {
  return sql`s.isArchived=0 AND ${researchProjectAccess(actor, sql`s.projectId`)}`
}

/** List shared sessions in activity order with a stable tie breaker.
 * @param ctx Request database and identity. @returns Internal session names and capture state.
 */
export async function listRecorderSessions(ctx: Context): Promise<RecorderSession[]> {
  const rows = await ctx.db.all<
    RecorderOption & {
      updatedAt: string
      completed: number
      version: number
      configured: number
      defaultLayerId: string | null
      choices: string
    }
  >(
    sql`SELECT s.id,s.name,s.updatedAt,s.status='completed' completed,s.configurationVersion version,s.layerId defaultLayerId,
      (s.configuration IS NOT NULL AND s.code IS NOT NULL) configured,
      (SELECT json_group_array(json_object('id',l.id,'name',coalesce((SELECT name FROM layerI18n WHERE layerId=l.id ORDER BY locale='en' DESC LIMIT 1),l.id)))
       FROM fieldResearchSessionLayer sl JOIN layer l ON l.id=sl.layerId AND l.projectId=s.projectId AND l.organisationId=s.organisationId AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL WHERE sl.sessionId=s.id) choices
      FROM fieldResearchSession s WHERE ${visible(ctx)} ORDER BY s.updatedAt DESC,s.id`,
  )
  return rows.map(({ version, configured, choices, ...row }) => {
    const layers: RecorderOption[] = JSON.parse(choices)
    let captureIssue: string | null = null
    if (version !== researchConfigurationVersion)
      captureIssue =
        'Update this session to the current schema in Field Sessions before recording.'
    else if (!configured || !layers.length)
      captureIssue = 'Configure the session and a recording layer in Field Sessions.'
    return { ...row, layers, completed: Boolean(row.completed), captureIssue }
  })
}

/** Resolve the organisation for a direct mobile session request.
 * @param ctx Request scope. @param id Session ID. @returns Authorised organisation ID.
 */
async function sessionOrganisation(ctx: Context, id: string): Promise<string> {
  const row = await ctx.db.get<{ organisationId: string }>(
    sql`SELECT s.organisationId FROM fieldResearchSession s WHERE s.id=${id} AND ${visible(ctx)}`,
  )
  if (!row) error(403, 'Session unavailable')
  return row.organisationId
}

/** Project assigned Locations and their unambiguous, readable building and premises context.
 * @param ctx Request scope. @param id Session ID. @returns Only assignments as selectable search results.
 * @remarks Walk asserted containment through nested parts and merged identities; UNION terminates cycles.
 */
export async function listRecorderLocations(
  ctx: Context,
  id: string,
): Promise<RecorderLocation[]> {
  const org = await sessionOrganisation(ctx, id)
  const fields = await locationReadFields(
    ctx.db,
    sql`l.id`,
    sql`r.facts`,
    sql`${org}`,
    sql`r.id`,
  )
  type Row = {
    origin: string
    id: string
    kind: RecorderLocation['kind']
    names: string
    category: string | null
  }
  // Resolve only redirect chains when expanding incoming edges, keeping the common child-ID lookup indexed.
  const rows = await ctx.db.all<Row>(sql`WITH RECURSIVE
    redirects(alias,id) AS (
      SELECT id,redirectTargetId FROM location WHERE redirectTargetId IS NOT NULL
      UNION SELECT d.alias,l.redirectTargetId FROM redirects d JOIN location l ON l.id=d.id WHERE l.redirectTargetId IS NOT NULL
    ), aliases(alias,id) AS (
      SELECT d.alias,d.id FROM redirects d JOIN location l ON l.id=d.id WHERE l.state!='redirect'
    ), picked(id) AS (
      SELECT DISTINCT coalesce(a.id,sl.locationId) FROM fieldResearchSessionLocation sl
      LEFT JOIN aliases a ON a.alias=sl.locationId WHERE sl.sessionId=${id}
    ), ancestry(origin,id,kind) AS (
      SELECT l.id,l.id,l.matchingType FROM picked JOIN location l ON l.id=picked.id
      WHERE l.matchingType IN ('building_part','building','premises') AND l.state!='redirect'
        AND (l.state!='manual' OR l.ownerOrganisationId=${org})
      UNION
      SELECT c.origin,p.id,p.matchingType FROM ancestry c
      JOIN locationMembershipHead m ON m.childLocationId IN (SELECT c.id UNION ALL SELECT alias FROM aliases WHERE id=c.id)
      LEFT JOIN aliases a ON a.alias=m.parentLocationId JOIN location p ON p.id=coalesce(a.id,m.parentLocationId)
      WHERE m.assertionState='asserted' AND m.membershipState='current'
        AND (m.effectiveFrom IS NULL OR m.effectiveFrom<=date('now')) AND (m.effectiveTo IS NULL OR m.effectiveTo>date('now'))
        AND (m.scopeOrganisationId=${org} OR (m.scopeOrganisationId IS NULL AND NOT EXISTS (
          SELECT 1 FROM locationMembershipHead scoped WHERE scoped.relationshipId=m.relationshipId AND scoped.scopeOrganisationId=${org}
        ))) AND p.state!='redirect' AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${org})
        AND ((c.kind='building_part' AND p.matchingType IN ('building_part','building','premises')) OR (c.kind='building' AND p.matchingType='premises'))
    ), labels AS MATERIALIZED (
      SELECT l.id,${fields.names} names,json_extract(r.rawSource,'$.record.rawSource.properties.unit_category') category
      FROM (SELECT DISTINCT id FROM ancestry) reached JOIN location l ON l.id=reached.id
      LEFT JOIN locationRevision r ON r.id=(SELECT current.id FROM locationRevision current WHERE current.locationId=l.id
        AND (l.state!='linked' OR current.origin='saanseoi') ORDER BY current.version DESC LIMIT 1)
    )
    SELECT a.origin,a.id,a.kind,labels.names,labels.category FROM ancestry a JOIN labels ON labels.id=a.id`)
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const group = groups.get(row.origin)
    if (group) group.push(row)
    else groups.set(row.origin, [row])
  }
  // Bind the reachable identity set once. Geometry and translated labels use independent D1 budgets.
  const reached = JSON.stringify([...new Set(rows.map(row => row.id))])
  const points = await ctx.db.all<{
    id: string
    point: string | null
  }>(sql`SELECT l.id,json_extract(${fields.location},'$.geometry.coordinates') point
    FROM json_each(${reached}) ids JOIN location l ON l.id=ids.value
    LEFT JOIN locationRevision r ON r.id=(SELECT current.id FROM locationRevision current WHERE current.locationId=l.id
      AND (l.state!='linked' OR current.origin='saanseoi') ORDER BY current.version DESC LIMIT 1)`)
  const coordinates = new Map(
    points.map(row => [row.id, row.point ? (JSON.parse(row.point) as MapPoint) : null]),
  )
  const links = await ctx.db.all<
    RecorderMap & { locationId: string }
  >(sql`WITH reached(id) AS (SELECT value FROM json_each(${reached})),
    links(locationId,mapId,unitId) AS (
      SELECT l.locationId,l.mapId,NULL FROM locationPremisesMap l JOIN reached r ON r.id=l.locationId
      UNION ALL SELECT u.locationId,u.mapId,u.unitId FROM premisesMapUnit u JOIN reached r ON r.id=u.locationId
    ) SELECT links.locationId,m.id,m.name,m.publishedHash hash,links.unitId FROM links JOIN premisesMap m ON m.id=links.mapId WHERE m.publishedHash IS NOT NULL ORDER BY m.name,m.id,links.unitId`)
  const maps = new Map<string, RecorderMap[]>()
  for (const { locationId, ...map } of links) {
    const group = maps.get(locationId) ?? []
    group.push(map)
    maps.set(locationId, group)
  }
  /** Choose a readable retained label in any available language.
   * @param row Projected location. @returns Identity and display name.
   */
  function option(row: Row): RecorderPlace {
    const names = locationFacilityNames(row.kind, JSON.parse(row.names ?? '{}'))
    return {
      id: row.id,
      point: coordinates.get(row.id) ?? null,
      maps: maps.get(row.id) ?? [],
      name: names.en || Object.values(names).find(Boolean) || row.id,
    }
  }
  return rows
    .filter(row => row.origin === row.id)
    .map(self => {
      const group = groups.get(self.id) ?? []
      const location = option(self)
      const parent = (kind: Row['kind']) => {
        const matches = group.filter(row => row.id !== self.id && row.kind === kind)
        return matches.length === 1 ? option(matches[0]) : null
      }
      const category = facilityCategory(
        self.category === 'lift' ? 'elevator' : (self.category ?? ''),
        location.name,
      )
      return {
        ...location,
        kind: self.kind,
        premises: parent('premises'),
        building: parent('building'),
        iconPath:
          self.kind === 'building_part' && Object.hasOwn(facilitySymbols, category)
            ? facilitySymbol(category, location.name).path
            : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** Read all captures for an authorised session in creation order.
 * @param ctx Request scope. @param id Session ID. @returns Record identities, oldest first.
 */
export async function listRecorderRecords(
  ctx: Context,
  id: string,
): Promise<RecorderRecord[]> {
  await sessionOrganisation(ctx, id)
  const rows = await ctx.db.all<Omit<RecorderRecord, 'pin'> & { pin: string | null }>(
    sql`SELECT r.id,r.featureId,r.spatialRealm,r.locationId,r.pin,(SELECT i.title FROM featureI18n i WHERE i.featureId=r.featureId ORDER BY i.locale='en' DESC LIMIT 1) title FROM fieldResearchRecord r WHERE r.sessionId=${id} ORDER BY r.rowid`,
  )
  return rows.map(row => ({ ...row, pin: row.pin ? JSON.parse(row.pin) : null }))
}
