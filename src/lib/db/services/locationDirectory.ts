import {
  currentAddressLinks,
  linkedAddressLabels,
  sharedBuildingSourceId,
} from './buildingAddressLinks'
import { canonicalLocationSQL } from './locationRedirect'
import { isPhysicalBuildingParent } from './physicalBuilding'
import { relationshipScopeSql } from './locationRelationships'
import { locationBuildingPartContext } from './locationBuildingPart'
import { locationReadFields } from './locationReadProjection'
import { sharedLocationFacts } from './locationShared'
// SNAPSHOT CONTRACT
// DRIZZLE
import { ne, and, eq, gt, lt, asc, desc, or, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
import {
  operator,
  locationOperator,
  operatorI18n,
  locationPremisesMap,
} from '../schema/operator'
import { premisesMap as premisesMapTable } from '../schema/premisesMap'
import { availablePremisesMap } from '#lib/indoor/registry.js'
// LOCATION
import type { LocationSortKey } from '#lib/locations/sorting.js'
import {
  placeTaxonomyPath,
  type PlaceTaxonomyNode,
} from '#lib/locations/placeTaxonomy.js'
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
import { locationFacilityNames } from '#lib/locations/facilityNames.js'
import { locationSourceReference, type LocationKind } from '#lib/locations/kinds.js'
// VALIDATION
import type { LifecycleStatus } from '#lib/locations/lifecycle.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationResource } from '#lib/locations/resource.js'

/**
 * Read a bounded page of standalone Location projections within an authorized scope.
 * @param db Request-local database.
 * @param input Authorized owner scope, optional Organisation subset, kind/lifecycle, literal search and ID cursor.
 * @returns Latest facts only, without raw provenance or associated Feature identities.
 * @remarks Authorization precedes this query; ownership is fenced in the read itself.
 */
export async function listLocationResources(
  db: Database,
  input: {
    /** Trusted bounded identity cohort, passed with one JSON binding. */
    ids?: string[]
    publication?: 'all' | 'published' | 'draft'
    physicalParents?: { excludeLocationId?: string }
    parentOfParts?: boolean
    sortBy?: LocationSortKey
    sortOrder?: 'asc' | 'desc'
    locale?: 'en' | 'zh-hant' | 'zh-hans'
    excludeCanonicalDrafts?: boolean
    includeCount?: boolean
    organisationId?: string
    /** Narrow index results without changing detail-read authorization scope. */
    restrictToOrganisation?: boolean
    kind?: LocationKind
    brandId?: string
    taxonomyCategory?: string
    upstream?: boolean
    linkedFeatures?: boolean
    buildingId?: string
    q?: string
    /** Include retained address labels when discovering reconciliation candidates. */
    searchAddress?: boolean
    /** Include explicitly reviewed building addresses in discovery and presentation. */
    linkedBuildingAddresses?: boolean
    after?: string
    id?: string
    lifecycleStatus?: LifecycleStatus
  },
): Promise<{
  data: LocationResource[]
  nextCursor: string | null
  totalCount: number | null
}> {
  const mapRegistry = (await db.select().from(premisesMapTable)).map(m => ({
    id: m.id,
    code: m.code,
    kind: m.kind,
    basePath: `/api/premises-maps/${m.id}`,
    enabled: Boolean(m.publishedHash),
    ready: Boolean(m.publishedHash),
  }))
  const fields = await locationReadFields(
    db,
    locationTable.id,
    locationRevision.facts,
    sql`${input.organisationId ?? null}`,
    locationRevision.id,
  )
  const revisionJoin = and(
    eq(locationRevision.locationId, locationTable.id),
    sql`${locationRevision.version} = (SELECT max(r.version) FROM locationRevisionContent r WHERE r.locationId=${locationTable.id} AND (${locationTable.state}!='linked' OR r.origin='saanseoi'))`,
  )
  const linked = sql`EXISTS(SELECT 1 FROM featureLocation fl JOIN feature f ON f.id=fl.featureId JOIN project p ON p.id=f.projectId WHERE fl.locationId=${locationTable.id} AND (${input.organisationId ?? null} IS NULL OR p.organisationId=${input.organisationId ?? null}))`
  // Expand the selected taxonomy branch into one JSON parameter, keeping the query bounded.
  const categoryNode = input.taxonomyCategory
    ? placeTaxonomyPath(input.taxonomyCategory).at(-1)
    : undefined
  /** Collect a category branch without expanding SQL bindings. @param node Taxonomy root. @returns Exact descendant keys. */
  const categoryKeys = (node: PlaceTaxonomyNode): string[] => [
    node.name,
    ...(node.children ?? []).flatMap(categoryKeys),
  ]
  const categoryValues = JSON.stringify(categoryNode ? categoryKeys(categoryNode) : [])
  const canonicalDraft = sql`${locationTable.state}='unresolved' AND ${locationTable.ssId} IS NULL AND ${locationTable.ownerOrganisationId} IS NULL`
  const match = and(
    input.ids
      ? sql`${locationTable.id} IN (SELECT value FROM json_each(${JSON.stringify(input.ids)}))`
      : undefined,
    input.excludeCanonicalDrafts ? sql`NOT (${canonicalDraft})` : undefined,
    input.publication === 'draft'
      ? canonicalDraft
      : input.publication === 'published'
        ? sql`${locationTable.ssId} IS NOT NULL`
        : undefined,
    input.taxonomyCategory
      ? sql`EXISTS(SELECT 1 FROM json_each(${categoryValues}) category WHERE category.value = coalesce(json_extract(${locationRevision.rawSource},'$.resource.attributes.taxonomy.primary'),json_extract(${locationRevision.rawSource},'$.resource.attributes.taxonomyPrimary')))`
      : undefined,
    sql`${locationTable.state} != 'redirect'`,
    input.brandId
      ? sql`EXISTS(SELECT 1 FROM locationSharedHead h WHERE h.locationId=${locationTable.id} AND json_extract(h.corrections,'$.brandId.supersededBy') IS NULL AND json_extract(h.corrections,'$.brandId.choice.mode')='override' AND json_extract(h.corrections,'$.brandId.choice.value')=${input.brandId})`
      : undefined,
    input.upstream === undefined
      ? undefined
      : input.upstream
        ? sql`${locationTable.ssId} IS NOT NULL`
        : sql`${locationTable.ssId} IS NULL`,
    input.linkedFeatures === undefined
      ? undefined
      : input.linkedFeatures
        ? linked
        : sql`NOT (${linked})`,
    input.physicalParents?.excludeLocationId
      ? ne(locationTable.id, input.physicalParents.excludeLocationId)
      : undefined,
    input.physicalParents
      ? sql`${locationTable.state}='unresolved'
        AND ${locationTable.ssId} IS NULL AND ${locationTable.ownerOrganisationId}=${input.organisationId ?? null}
        AND ${locationTable.kind}='building' AND ${isPhysicalBuildingParent(locationTable.id)}`
      : undefined,
    // Offer actual accessible parents with current, effective building-part membership.
    input.parentOfParts
      ? sql`EXISTS(SELECT 1 FROM locationMembershipHead m JOIN location c ON c.id=m.childLocationId
        WHERE m.parentLocationId=${locationTable.id} AND c.matchingType='building_part' AND c.state!='redirect'
        AND (c.state!='manual' OR c.ownerOrganisationId=${input.organisationId ?? null})
        AND (${input.excludeCanonicalDrafts ? 1 : 0}=0 OR NOT(c.state='unresolved' AND c.ssId IS NULL AND c.ownerOrganisationId IS NULL))
        AND m.assertionState='asserted' AND m.membershipState='current'
        AND (m.effectiveFrom IS NULL OR m.effectiveFrom<=date('now'))
        AND (m.effectiveTo IS NULL OR m.effectiveTo>date('now'))
        AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=${input.organisationId ?? null}))`
      : undefined,
    // A parent-part picker only offers explicit members of the selected building.
    input.buildingId
      ? sql`EXISTS(SELECT 1 FROM locationMembershipHead m WHERE m.childLocationId=${locationTable.id}
      AND m.parentLocationId=${input.buildingId} AND m.assertionState='asserted' AND m.membershipState='current'
      AND (m.effectiveFrom IS NULL OR m.effectiveFrom<=date('now'))
      AND (m.effectiveTo IS NULL OR m.effectiveTo>date('now'))
      AND (m.scopeOrganisationId IS NULL OR m.scopeOrganisationId=${input.organisationId ?? null}))`
      : undefined,
    input.organisationId
      ? or(
          sql`${locationTable.state} != 'manual'`,
          eq(locationTable.ownerOrganisationId, input.organisationId),
        )
      : sql`${locationTable.state} != 'manual'`,
    // Organisation indexes include owned records and current Feature associations only.
    input.restrictToOrganisation && input.organisationId
      ? or(
          eq(locationTable.ownerOrganisationId, input.organisationId),
          sql`EXISTS (SELECT 1 FROM featureLocation fl
                JOIN feature f ON f.id=fl.featureId
                JOIN project p ON p.id=f.projectId
                WHERE fl.locationId=${locationTable.id} AND p.organisationId=${input.organisationId})`,
        )
      : undefined,
    input.kind ? eq(locationTable.kind, input.kind) : undefined,
    // Filter the scoped effective assertion before pagination, retaining historic rows by default.
    input.lifecycleStatus
      ? sql`COALESCE(${fields.operatingStatus},${fields.buildingStatus},'unknown')=${input.lifecycleStatus}`
      : undefined,
    input.id ? eq(locationTable.id, input.id) : undefined,
    input.q
      ? or(
          eq(locationTable.id, input.q),
          input.linkedBuildingAddresses
            ? sql`${locationTable.id} IN (SELECT ${canonicalLocationSQL(sql`r.locationId`)}
              ${currentAddressLinks(input.organisationId ?? null)} AND EXISTS (
                SELECT 1 FROM json_each(ar.components,'$.i18n') i WHERE
                instr(lower(json_extract(i.value,'$.formattedAddress')),lower(${input.q}))>0))`
            : undefined,
          eq(locationTable.ssId, input.q),
          input.searchAddress
            ? sql`(EXISTS (SELECT 1 FROM json_tree(${locationRevision.facts}) a WHERE a.type='text' AND (a.fullkey LIKE '%address%' OR a.fullkey LIKE '%Address%') AND instr(replace(lower(a.value),' ',''),replace(lower(${input.q}),' ',''))>0) OR EXISTS (SELECT 1 FROM json_each(${fields.names}) n WHERE n.type='text' AND instr(replace(replace(lower(n.value),'-',''),' ',''),replace(replace(lower(${input.q}),'-',''),' ',''))>0))`
            : undefined,
          sql`EXISTS (SELECT 1 FROM json_each(${fields.names}) n WHERE n.type='text' AND instr(lower(n.value), lower(${input.q}))>0)`,
        )
      : undefined,
  )
  // Count the complete scope without hydrating facts, labels or associated records.
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(locationTable)
  const counted = input.includeCount
    ? await (input.q || input.lifecycleStatus || input.taxonomyCategory
        ? countQuery.leftJoin(locationRevision, revisionJoin).where(match)
        : countQuery.where(match))
    : null
  const totalCount = counted === null ? null : Number(counted[0]?.count ?? 0)
  const sortBy = input.sortBy ?? 'id'
  const sortOrder = input.sortOrder ?? 'asc'
  const locale = input.locale ?? 'en'
  const name = sql`coalesce(json_extract(${fields.names},${'$.' + JSON.stringify(locale)}),json_extract(${fields.names},'$.en'),'')`
  const parentFields =
    sortBy === 'address'
      ? await locationReadFields(
          db,
          sql`p.id`,
          sql`pr.facts`,
          sql`${input.organisationId ?? null}`,
          sql`pr.id`,
        )
      : null
  const parentLabel = parentFields
    ? sql`coalesce(json_extract(${parentFields.location},${'$.address.displayOverrides.' + JSON.stringify(locale)}),json_extract(${parentFields.location},${'$.address.authored.i18n.' + JSON.stringify(locale) + '.formattedAddress'}),json_extract(${parentFields.location},${'$.address.fallbackDisplay.' + JSON.stringify(locale)}),json_extract(${parentFields.names},${'$.' + JSON.stringify(locale)}),json_extract(${parentFields.names},'$.en'))`
    : sql`NULL`
  const physical = sql`p.matchingType='building'`
  const parentAddress = parentFields
    ? sql`(SELECT CASE WHEN count(DISTINCT p.id)=1 THEN max(${parentLabel}) WHEN count(DISTINCT CASE WHEN ${physical} THEN p.id END)=1 THEN max(CASE WHEN ${physical} THEN ${parentLabel} END) END FROM locationMembershipHead r JOIN location p ON p.id=r.parentLocationId JOIN locationRevisionContent pr ON pr.locationId=p.id AND pr.version=(SELECT max(version) FROM locationRevision WHERE locationId=p.id) WHERE r.childLocationId=${locationTable.id} AND r.assertionState='asserted' AND r.membershipState='current' AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now')) AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now')) AND ${relationshipScopeSql('locationMembership', input.organisationId ?? null)} AND p.state!='redirect' AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${input.organisationId ?? null}))`
    : sql`NULL`
  const address = sql`coalesce(json_extract(${fields.location},${'$.address.displayOverrides.' + JSON.stringify(locale)}),json_extract(${fields.location},${'$.address.authored.i18n.' + JSON.stringify(locale) + '.formattedAddress'}),json_extract(${fields.location},${'$.address.fallbackDisplay.' + JSON.stringify(locale)}),json_extract(${fields.location},'$.address.fallbackDisplay.en'),CASE WHEN ${locationTable.kind}='building_part' THEN ${name}||', '||${parentAddress} END,'')`
  const expressions: Record<LocationSortKey, SQL> = {
    name,
    address,
    kind: sql`${locationTable.kind}`,
    lifecycle: sql`coalesce(${fields.operatingStatus},${fields.buildingStatus},'unknown')`,
    publication: sql`CASE WHEN ${locationTable.ssId} IS NOT NULL THEN 'published' WHEN ${canonicalDraft} THEN 'draft' ELSE 'private' END`,
    created: sql`${locationTable.createdAt}`,
    updated: sql`coalesce(${locationRevision.createdAt},${locationTable.createdAt})`,
    id: sql`${locationTable.id}`,
  }
  // Drizzle escapes repeated projection constants and scope values as SQL literals; avoid D1's 100-binding limit in the expanded effective-address expression.
  const sortExpression = expressions[sortBy].inlineParams()
  // Fence ownership and current-revision classification before pagination; never search superseded revisions.
  const directory = db
    .select({
      sortValue:
        sql<string>`${sortBy === 'id' ? sortExpression : sql`lower(coalesce(${sortExpression},''))`}`.as(
          'sortValue',
        ),
      id: locationTable.id,
    })
    .from(locationTable)
    .leftJoin(locationRevision, revisionJoin)
    .where(match)
    .as('directory')
  let cursor: { value: string; id: string } | undefined
  if (input.after) {
    if (!input.sortBy) cursor = { value: input.after, id: input.after }
    else {
      const parsed = JSON.parse(input.after)
      if (
        parsed.by !== sortBy ||
        parsed.order !== sortOrder ||
        parsed.locale !== locale ||
        typeof parsed.value !== 'string' ||
        typeof parsed.id !== 'string'
      )
        throw new Error('LOCATION_SORT_CURSOR_MISMATCH')
      cursor = parsed
    }
  }
  const compare = sortOrder === 'desc' ? lt : gt
  const order = sortOrder === 'desc' ? desc : asc
  // Page by the ordered value plus stable ID so equal names never skip or repeat rows.
  const rows = await db
    .select({
      sortValue: directory.sortValue,
      id: locationTable.id,
      addressChoices: input.linkedBuildingAddresses
        ? linkedAddressLabels(locationTable.id, input.organisationId ?? null)
        : sql<string | null>`NULL`,
      catalogueBuildingId: input.linkedBuildingAddresses
        ? sharedBuildingSourceId(locationTable.id, locationTable.state)
        : sql<null>`NULL`,
      operatorId: operator.id,
      operatorReferenceCode: locationOperator.referenceCode,
      premisesMapId: locationPremisesMap.mapId,
      operatorLogo: operator.logo,
      operatorWebsite: operator.website,
      operatorNames: sql<string>`(SELECT json_group_object(locale,name) FROM ${operatorI18n} WHERE ${operatorI18n.operatorId}=${operator.id})`,
      draftVersion: sql<
        string | null
      >`CASE WHEN ${canonicalDraft} THEN ${locationRevision.contentHash} END`,
      hasLinkedFeatures: sql<boolean>`${linked}`.mapWith(Boolean),
      ssId: locationTable.ssId,
      kind: locationTable.kind,
      state: locationTable.state,
      sourceAvailability: locationTable.sourceAvailability,
      ownerOrganisationId: locationTable.ownerOrganisationId,
      ownerOrganisationNames: sql<string>`(SELECT json_group_object(locale, COALESCE(NULLIF(nameShort,''),name)) FROM organisationI18n WHERE organisationId=${locationTable.ownerOrganisationId})`,
      editingOrganisationNames: sql<string>`(SELECT json_group_object(locale, COALESCE(NULLIF(nameShort,''),name)) FROM organisationI18n WHERE organisationId=${input.organisationId ?? null})`,
      revisionId: locationRevision.id,
      createdAt: locationTable.createdAt,
      revisionCreatedAt: locationRevision.createdAt,
      origin: locationRevision.origin,
      version: locationRevision.version,
      apiVersion: locationRevision.apiVersion,
      releaseId: locationRevision.releaseId,
      snapshotId: locationRevision.snapshotId,
      facts: locationRevision.facts,
      organisationOverrides: sql<
        string | null
      >`(SELECT overrides FROM organisationLocationHead WHERE locationId=${locationTable.id} AND organisationId=${input.organisationId ?? null})`,
      organisationRevision: sql<
        string | null
      >`(SELECT revision FROM organisationLocationHead WHERE locationId=${locationTable.id} AND organisationId=${input.organisationId ?? null})`,
    })
    .from(locationTable)
    .innerJoin(directory, eq(directory.id, locationTable.id))
    .leftJoin(locationRevision, revisionJoin)
    .leftJoin(locationOperator, eq(locationOperator.locationId, locationTable.id))
    .leftJoin(locationPremisesMap, eq(locationPremisesMap.locationId, locationTable.id))
    .leftJoin(operator, eq(operator.id, locationOperator.operatorId))
    .where(
      cursor
        ? or(
            compare(directory.sortValue, cursor.value),
            and(
              eq(directory.sortValue, cursor.value),
              compare(directory.id, cursor.id),
            ),
          )
        : undefined,
    )
    .orderBy(order(directory.sortValue), order(directory.id))
    .limit(26)
  const data = await Promise.all(
    rows
      .slice(0, 25)
      .map(
        async ({
          sortValue: _sortValue,
          operatorId,
          operatorReferenceCode,
          operatorLogo,
          operatorWebsite,
          operatorNames,
          organisationOverrides,
          ownerOrganisationNames,
          editingOrganisationNames,
          createdAt,
          revisionCreatedAt,
          origin,
          version,
          apiVersion,
          releaseId,
          snapshotId,
          addressChoices,
          catalogueBuildingId,
          ...row
        }) => {
          let facts =
            row.facts === null
              ? null
              : (
                  await sharedLocationFacts(
                    db,
                    row.id,
                    LocationFactsSchema.parse(row.facts),
                  )
                ).facts
          if (facts && organisationOverrides) {
            const effective = resolveFeatureLocation(
              facts,
              facts.location,
              JSON.parse(organisationOverrides) as FeatureLocationOverrides,
            )
            facts = {
              ...facts,

              ...(effective.footprint !== undefined
                ? { footprint: effective.footprint }
                : {}),
              names: Object.fromEntries(
                Object.entries(effective.names).filter(
                  (pair): pair is [string, string] => pair[1] !== null,
                ),
              ),
              confirmedUnnamed: effective.confirmedUnnamed,
              branch: effective.branch ?? undefined,
              format: effective.format ?? undefined,
              branchId: effective.branchId ?? undefined,
              brandId: effective.brandId,
              groupId: effective.groupId,
              phoneNumber: effective.phoneNumber ?? [],
              websites: effective.websites,
              socials: effective.socials,
              accessibility: effective.accessibility,
              brands: effective.brands ?? [],
              ...(effective.operatingStatus !== undefined
                ? { operatingStatus: effective.operatingStatus }
                : {}),
              ...(effective.buildingStatus !== undefined
                ? { buildingStatus: effective.buildingStatus }
                : {}),
              ...(effective.successorLocationId !== undefined
                ? { successorLocationId: effective.successorLocationId }
                : {}),
              location: effective.location ?? facts.location,
            }
          }
          // Present imported facility labels consistently without rewriting retained source facts.
          if (facts)
            facts = { ...facts, names: locationFacilityNames(row.kind, facts.names) }
          const partContext =
            row.kind === 'building_part'
              ? await locationBuildingPartContext(db, row.id, input.organisationId)
              : {}
          return {
            ...row,
            ...partContext,
            ...(addressChoices
              ? {
                  linkedAddresses: JSON.parse(addressChoices) as string[],
                  catalogueBuildingId,
                }
              : {}),
            premisesMap: availablePremisesMap(row.premisesMapId, mapRegistry),
            operator: operatorId
              ? {
                  id: operatorId,
                  referenceCode: operatorReferenceCode,
                  names: JSON.parse(operatorNames),
                  logo: operatorLogo,
                  website: operatorWebsite,
                }
              : null,
            taxonomy: locationTaxonomy(row.kind),
            ownerOrganisationNames: JSON.parse(ownerOrganisationNames),
            editingOrganisationNames: JSON.parse(editingOrganisationNames),
            metadata: {
              createdAt,
              revisionCreatedAt,
              origin,
              version,
              apiVersion,
              releaseId,
              snapshotId,
            },
            editingOrganisationId: input.organisationId ?? null,
            sourceReference: locationSourceReference(row.ssId),
            facts,
          }
        },
      ),
  )
  const last = rows[24]
  return {
    data,
    totalCount,
    nextCursor:
      rows.length > 25 && last
        ? input.sortBy
          ? JSON.stringify({
              by: sortBy,
              order: sortOrder,
              locale,
              value: last.sortValue,
              id: last.id,
            })
          : last.id
        : null,
  }
}
