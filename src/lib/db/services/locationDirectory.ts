// SNAPSHOT CONTRACT
import { locationFactsFieldSql } from './locationFactsSql'
// DRIZZLE
import { and, eq, gt, or, sql } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
// LOCATION
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
    includeCount?: boolean
    organisationId?: string
    /** Narrow index results without changing detail-read authorization scope. */
    restrictToOrganisation?: boolean
    kind?: LocationKind
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
  const revisionJoin = and(
    eq(locationRevision.locationId, locationTable.id),
    sql`${locationRevision.version} = (SELECT max(r.version) FROM locationRevision r WHERE r.locationId=${locationTable.id} AND (${locationTable.state}!='linked' OR r.origin='saanseoi'))`,
  )
  const match = and(
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
      ? sql`COALESCE(
          CASE WHEN EXISTS(SELECT 1 FROM organisationLocationHead o WHERE o.locationId=${locationTable.id} AND o.organisationId=${input.organisationId ?? null} AND json_extract(o.overrides,'$.operatingStatus.mode')='override')
            THEN (SELECT json_extract(o.overrides,'$.operatingStatus.value') FROM organisationLocationHead o WHERE o.locationId=${locationTable.id} AND o.organisationId=${input.organisationId ?? null})
            ELSE ${locationFactsFieldSql(locationRevision.facts, 'operatingStatus')} END,
          CASE WHEN EXISTS(SELECT 1 FROM organisationLocationHead o WHERE o.locationId=${locationTable.id} AND o.organisationId=${input.organisationId ?? null} AND json_extract(o.overrides,'$.buildingStatus.mode')='override')
            THEN (SELECT json_extract(o.overrides,'$.buildingStatus.value') FROM organisationLocationHead o WHERE o.locationId=${locationTable.id} AND o.organisationId=${input.organisationId ?? null})
            ELSE ${locationFactsFieldSql(locationRevision.facts, 'buildingStatus')} END,
          'unknown')=${input.lifecycleStatus}`
      : undefined,
    input.id ? eq(locationTable.id, input.id) : undefined,
    input.q
      ? or(
          eq(locationTable.id, input.q),
          eq(locationTable.ssId, input.q),
          sql`EXISTS (SELECT 1 FROM json_each(${locationFactsFieldSql(locationRevision.facts, 'names')}) n WHERE n.type='text' AND instr(lower(n.value), lower(${input.q}))>0)`,
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
  const data = rows
    .slice(0, 25)
    .map(
      ({
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
        let facts = row.facts === null ? null : LocationFactsSchema.parse(row.facts)
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
            phoneNumber: effective.phoneNumber ?? [],
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
    )
  return { data, totalCount, nextCursor: rows.length > 25 ? data.at(-1)!.id : null }
}
