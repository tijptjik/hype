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
import {
  emptyFeatureAddress,
  getAddressDisplay,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { recorderIdentifierTags } from '#lib/fieldResearch/recorderIdentifier.js'
import { researchStreetAddresses } from '#lib/fieldResearch/locationStreets.js'
import { linkedAddressLabels } from './buildingAddressLinks'
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
 * @param ctx Request scope. @param id Session ID. @param includeArchived Allow super-admin archive review. @returns Authorised organisation ID.
 */
async function sessionOrganisation(
  ctx: Context,
  id: string,
  includeArchived = false,
): Promise<string> {
  const row = await ctx.db.get<{ organisationId: string }>(
    sql`SELECT s.organisationId FROM fieldResearchSession s WHERE s.id=${id} AND (s.isArchived=0 OR ${includeArchived && ctx.user.superAdmin ? 1 : 0}) AND ${researchProjectAccess(ctx, sql`s.projectId`)}`,
  )
  if (!row) error(403, 'Session unavailable')
  return row.organisationId
}

/** Choose a readable address and derive its street and number ordering from the same label.
 * @param source Effective location address. @param linked Current reviewed address labels in priority order.
 * @param kind Location type. @param names Retained names to exclude from address-only subtitles.
 * @returns Display address and natural ordering key, both empty when no address is recorded.
 */
function placeAddress(
  source: FeatureAddress['source'] | undefined,
  linked: (string | null)[],
  kind: RecorderPlace['kind'],
  names: Record<string, string>,
): Pick<RecorderPlace, 'address' | 'addressSortKey'> {
  const value = emptyFeatureAddress()
  const normalizedNames = Object.values(names).map(name => name.trim().toLowerCase())
  let address = ''
  if (source) {
    value.source = { ...value.source, ...source }
    const content = source.canonical?.content ?? source.authored
    for (const [locale, tag] of [
      ['en', 'en'],
      ['zhHant', 'zh-hant'],
      ['zhHans', 'zh-hans'],
    ] as const) {
      // Some imported buildings retain a numbered street only in the original formatted label.
      const candidate = (
        getAddressDisplay(value, locale, [], kind) ||
        (source.displayOverrides?.[tag] ?? content?.i18n[tag]?.formattedAddress)
      )?.trim()
      if (candidate && !normalizedNames.includes(candidate.toLowerCase())) {
        address = candidate
        break
      }
    }
  }
  address ||= linked.find(label => label?.trim())?.trim() ?? ''
  const [first] = researchStreetAddresses(address)
  return {
    address,
    addressSortKey: first.street
      ? [first.street, first.number].join(' ').trim()
      : address,
  }
}

/** Project assigned Locations and their unambiguous, readable building and premises context.
 * @param ctx Request scope. @param id Session ID. @param includeArchived Allow super-admin archive review. @returns Only assignments as selectable search results.
 * @remarks Walk asserted containment through nested parts and merged identities; UNION terminates cycles.
 */
export async function listRecorderLocations(
  ctx: Context,
  id: string,
  includeArchived = false,
): Promise<RecorderLocation[]> {
  const org = await sessionOrganisation(ctx, id, includeArchived)
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
  const assets = await ctx.db.all<{
    id: string
    position: string | null
    linked: string
    assetId: string | null
    sourceModelId: string | null
  }>(sql`SELECT l.id,${fields.location} position,
    ${linkedAddressLabels(sql`l.id`, org)} linked,e.assetId,e.sourceModelId
    FROM json_each(${reached}) ids JOIN location l ON l.id=ids.value
    LEFT JOIN locationExteriorModel e ON e.locationId=l.id
    LEFT JOIN locationRevisionContent r ON r.id=(SELECT current.id FROM locationRevision current WHERE current.locationId=l.id
      AND (l.state!='linked' OR current.origin='saanseoi') ORDER BY current.version DESC LIMIT 1)`)
  const assetsById = new Map(
    assets.map(row => {
      const position: {
        geometry?: { coordinates: MapPoint }
        address?: FeatureAddress['source']
      } | null = JSON.parse(row.position ?? 'null')
      return [
        row.id,
        {
          position,
          linked: JSON.parse(row.linked) as (string | null)[],
          exteriorUrl:
            row.assetId && row.sourceModelId
              ? `/api/location-exterior/${encodeURIComponent(row.id)}/${row.assetId}/${row.sourceModelId}.gltf`
              : null,
        },
      ] as const
    }),
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
    const asset = assetsById.get(row.id)
    const name = [names.en, ...Object.values(names)]
      .map(value => value?.trim())
      .find(value => value && value !== row.id)
    return {
      id: row.id,
      kind: row.kind,
      ...placeAddress(asset?.position?.address, asset?.linked ?? [], row.kind, names),
      point: asset?.position?.geometry?.coordinates ?? null,
      exteriorUrl: asset?.exteriorUrl ?? null,
      maps: maps.get(row.id) ?? [],
      name: name || (row.kind === 'building' ? 'Unnamed Building' : row.id),
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
      const building = parent('building')
      const displayOverrides = assetsById.get(self.id)?.position?.address
        ?.displayOverrides
      // Mobile selectors can show an assigned part's containing address without duplicating its building facts.
      const inheritAddress =
        self.kind === 'building_part' &&
        !location.address &&
        building?.address &&
        !Object.values(displayOverrides ?? {}).includes('')
      return {
        ...location,
        ...(inheritAddress
          ? { address: building.address, addressSortKey: building.addressSortKey }
          : {}),
        kind: self.kind,
        premises: parent('premises'),
        building,
        iconPath:
          self.kind === 'building_part' && Object.hasOwn(facilitySymbols, category)
            ? facilitySymbol(category, location.name).path
            : null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** Retain the original device identifier when a linked Feature is renamed. */
export const recorderCaptureTitle = sql`(SELECT json_extract(v.content,'$.translations.en.title.value') FROM featureRevision v
  WHERE v.featureId=f.id AND v.previousRevisionId IS NULL ORDER BY v.rowid LIMIT 1)`

/** Shared record-card fields for the scoped capture (r), Feature (f), session (s) and layer settings (sl). */
export const recorderCardFields = sql`s.code,
      coalesce(json_extract(sl.overrides,'$.titleTemplate'),json_extract(s.configuration,'$.titleTemplate')) titleTemplate,
      ${recorderCaptureTitle} captureTitle,
      (SELECT p.imageRevisionId FROM featureRevisionImage p JOIN image i ON i.id=p.imageId AND i.isArchived=0
       WHERE p.featureRevisionId=f.currentRevisionId ORDER BY (p.intent='canonical') DESC,p.position LIMIT 1) thumbnailRevision`

/** Read all captures for an authorised session in creation order.
 * @param ctx Request scope. @param id Session ID. @returns Record identities, oldest first.
 */
export async function listRecorderRecords(
  ctx: Context,
  id: string,
): Promise<RecorderRecord[]> {
  await sessionOrganisation(ctx, id)
  // During the archive rollout, older databases contain only active receipts.
  const columns = await ctx.db.all<{ name: string }>(
    sql`PRAGMA table_info(fieldResearchRecord)`,
  )
  const active = columns.some(column => column.name === 'archivedAt')
    ? sql`AND r.archivedAt IS NULL`
    : sql``
  // Prefer the current canonical photo, falling back to the first visible gallery entry.
  const rows = await ctx.db.all<
    Omit<RecorderRecord, 'pin' | 'identifierTags'> & {
      pin: string | null
      code: string | null
      captureTitle: string | null
      titleTemplate: string | null
    }
  >(sql`
    SELECT r.id,r.featureId,r.spatialRealm,r.locationId,r.pin,${recorderCardFields},
      (SELECT i.title FROM featureI18n i WHERE i.featureId=f.id ORDER BY i.locale='en' DESC LIMIT 1) title
    FROM fieldResearchRecord r JOIN fieldResearchSession s ON s.id=r.sessionId
    LEFT JOIN feature f ON f.id=r.featureId
    LEFT JOIN layer l ON l.id=f.layerId
    LEFT JOIN fieldResearchSessionLayer sl ON sl.sessionId=s.id AND sl.layerId=coalesce(l.historicalSourceLayerId,l.id)
    WHERE r.sessionId=${id} ${active} ORDER BY r.rowid`)
  return rows.map(({ code, titleTemplate, captureTitle, ...row }) => ({
    ...row,
    pin: row.pin ? JSON.parse(row.pin) : null,
    identifierTags: recorderIdentifierTags(
      captureTitle ?? row.title,
      code,
      titleTemplate,
    ),
  }))
}
