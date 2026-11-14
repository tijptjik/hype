import { locationReadFields } from './locationReadProjection'
import { sharedLocationFacts } from './locationShared'
// SNAPSHOT CONTRACT
// DRIZZLE
import { and, eq, gt, or, sql } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// LOCATION
import { locationTaxonomy } from '#lib/locations/taxonomy.js'
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
    publication?: 'published' | 'draft'
    excludeCanonicalDrafts?: boolean
    includeCount?: boolean
    organisationId?: string
    /** Narrow index results without changing detail-read authorization scope. */
    restrictToOrganisation?: boolean
    kind?: LocationKind
    brandId?: string
    upstream?: boolean
    linkedFeatures?: boolean
    buildingId?: string
    q?: string
    after?: string
    id?: string
    lifecycleStatus?: LifecycleStatus
  },
): Promise<{
  data: LocationResource[]
  nextCursor: string | null
  totalCount: number | null
}> {
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
  const canonicalDraft = sql`${locationTable.state}='unresolved' AND ${locationTable.ssId} IS NULL AND ${locationTable.ownerOrganisationId} IS NULL`
  const match = and(
    input.excludeCanonicalDrafts ? sql`NOT (${canonicalDraft})` : undefined,
    input.publication === 'draft'
      ? canonicalDraft
      : input.publication === 'published'
        ? sql`${locationTable.ssId} IS NOT NULL`
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
    // A parent-part picker only offers explicit members of the selected building.
    input.buildingId
      ? sql`EXISTS(SELECT 1 FROM locationMembershipHead m WHERE m.childLocationId=${locationTable.id}
      AND m.parentLocationId=${input.buildingId} AND m.assertionState='asserted' AND m.membershipState='current'
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
          eq(locationTable.ssId, input.q),
          sql`EXISTS (SELECT 1 FROM json_each(${fields.names}) n WHERE n.type='text' AND instr(lower(n.value), lower(${input.q}))>0)`,
        )
      : undefined,
  )
  // Count the complete scope without hydrating facts, labels or associated records.
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(locationTable)
  const counted = input.includeCount
    ? await (input.q || input.lifecycleStatus
        ? countQuery.leftJoin(locationRevision, revisionJoin).where(match)
        : countQuery.where(match))
    : null
  const totalCount = counted === null ? null : Number(counted[0]?.count ?? 0)
  // Fence ownership before pagination; never search superseded revisions or raw payloads.
  const rows = await db
    .select({
      id: locationTable.id,
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
    .leftJoin(locationRevision, revisionJoin)
    .where(and(match, input.after ? gt(locationTable.id, input.after) : undefined))
    .orderBy(locationTable.id)
    .limit(26)
  const data = await Promise.all(
    rows
      .slice(0, 25)
      .map(
        async ({
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
          return {
            ...row,
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
  return { data, totalCount, nextCursor: rows.length > 25 ? data.at(-1)!.id : null }
}
