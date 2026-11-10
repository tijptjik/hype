// DRIZZLE
import { and, eq, gt, sql } from 'drizzle-orm'
// RELATIONSHIPS
import { canonicalLocationSQL } from './locationRedirect'
// SCHEMA
import { feature } from '#lib/db/schema/feature.js'
import { project } from '#lib/db/schema/project.js'
import { organisation } from '#lib/db/schema/organisation.js'
// TYPES
import type { Database, LocaleKey } from '#lib/types.js'
import type { FeatureAuthTarget } from '#lib/api/services/authz/feature.js'

export type LocationLinkedFeature = {
  id: string
  title: string
  projectId: string
  projectName: string
  layerId: string
  layerName: string
  isPublished: boolean
  isArchived: boolean
  isDraft: boolean
}
export type LocationLinkedFeaturePage = {
  data: LocationLinkedFeature[]
  nextCursor: string | null
}

/** List current reverse associations without granting Feature access through a Location.
 * @param db Request-local database.
 * @param input Location ID, locale, cursor, and the caller's normal Feature read decision.
 * @returns Up to 25 readable Feature summaries and an accessible-row cursor.
 * @remarks Past placements use exact retained relationship references and current Feature authority. Permissions are evaluated before output pagination. Bounded internal scans include
 * drafts and archived rows when authorized; historical or unlinked associations are excluded. Associated building/part listings include current scoped physical descendants and current occupants, deduplicated before pagination. Former and unconfirmed occupants are excluded; placed/past views retain exact accepted placement semantics.
 */
export async function listLocationLinkedFeatures(
  db: Database,
  input: {
    locationId: string
    view?: 'associated' | 'placed' | 'past'
    locale: LocaleKey
    after?: string
    canRead: (
      probe: FeatureAuthTarget & { isPublished: boolean; isArchived: boolean },
    ) => boolean
  },
): Promise<LocationLinkedFeaturePage> {
  const visible: LocationLinkedFeature[] = []
  let after = input.after
  do {
    // Hydrate only a bounded set of current links; ancestry is read from the persisted Project.
    const rows = await db
      .select({
        id: feature.id,
        projectId: feature.projectId,
        layerId: feature.layerId,
        organisationId: project.organisationId,
        resourceHubId: organisation.hubId,
        isPublished: feature.isPublished,
        isArchived: feature.isArchived,
        isDraft: feature.isDraft,
        title: sql<string>`coalesce((SELECT title FROM featureI18n WHERE featureId=${feature.id} AND title!='' ORDER BY CASE locale WHEN ${input.locale} THEN 0 WHEN 'en' THEN 1 ELSE 2 END,locale LIMIT 1),${feature.id})`,
        projectName: sql<string>`coalesce((SELECT coalesce(nullif(nameShort,''),name) FROM projectI18n WHERE projectId=${feature.projectId} ORDER BY CASE locale WHEN ${input.locale} THEN 0 WHEN 'en' THEN 1 ELSE 2 END,locale LIMIT 1),${feature.projectId})`,
        layerName: sql<string>`coalesce((SELECT coalesce(nullif(nameShort,''),name) FROM layerI18n WHERE layerId=${feature.layerId} ORDER BY CASE locale WHEN ${input.locale} THEN 0 WHEN 'en' THEN 1 ELSE 2 END,locale LIMIT 1),${feature.layerId})`,
      })
      .from(feature)
      .innerJoin(project, eq(project.id, feature.projectId))
      .innerJoin(organisation, eq(organisation.id, project.organisationId))
      .where(
        and(
          input.view === 'placed'
            ? sql`EXISTS(SELECT 1 FROM featureLocationMembership m WHERE m.featureId=${feature.id} AND m.containerLocationId=${input.locationId})`
            : input.view === 'past'
              ? sql`EXISTS(SELECT 1 FROM featureLocationHistory h WHERE h.featureId=${feature.id}
                AND NOT EXISTS(SELECT 1 FROM featureLocation live WHERE live.featureId=h.featureId AND live.version=h.version)
                AND (h.locationId=${input.locationId}
                  OR EXISTS(SELECT 1 FROM locationOccupancy o WHERE o.id=h.occupancyRevisionId AND o.containerLocationId=${input.locationId})
                  OR EXISTS(SELECT 1 FROM locationMembership m JOIN json_each(h.membershipRevisionIds) j ON j.value=m.id WHERE m.parentLocationId=${input.locationId} OR m.childLocationId=${input.locationId})))`
              : sql`EXISTS(
                WITH RECURSIVE physical(id) AS (
                  SELECT ${input.locationId}
                  UNION
                  SELECT ${canonicalLocationSQL(sql`m.childLocationId`)} FROM physical p
                  JOIN location parent ON parent.id=p.id AND parent.matchingType IN ('building','building_part')
                  JOIN locationMembershipHead m ON ${canonicalLocationSQL(sql`m.parentLocationId`)}=p.id
                  JOIN location child ON child.id=${canonicalLocationSQL(sql`m.childLocationId`)} AND child.matchingType='building_part'
                  WHERE m.assertionState='asserted' AND m.membershipState='current'
                    AND (child.state!='manual' OR child.ownerOrganisationId=${project.organisationId})
                    AND (m.scopeOrganisationId=${project.organisationId} OR (m.scopeOrganisationId IS NULL AND NOT EXISTS(
                      SELECT 1 FROM locationMembershipHead override WHERE override.relationshipId=m.relationshipId AND override.scopeOrganisationId=${project.organisationId})))
                ), related(id) AS (
                  SELECT id FROM physical
                  UNION
                  SELECT ${canonicalLocationSQL(sql`o.establishmentLocationId`)} FROM locationOccupancyHead o
                  JOIN physical p ON p.id=${canonicalLocationSQL(sql`o.containerLocationId`)}
                  JOIN location container ON container.id=p.id AND container.matchingType IN ('building','building_part')
                  JOIN location tenant ON tenant.id=${canonicalLocationSQL(sql`o.establishmentLocationId`)}
                  WHERE o.assertionState='asserted' AND o.occupancyState='current'
                    AND (tenant.state!='manual' OR tenant.ownerOrganisationId=${project.organisationId})
                    AND (o.scopeOrganisationId=${project.organisationId} OR (o.scopeOrganisationId IS NULL AND NOT EXISTS(
                      SELECT 1 FROM locationOccupancyHead override WHERE override.relationshipId=o.relationshipId AND override.scopeOrganisationId=${project.organisationId})))
                ) SELECT 1 FROM featureLocation linked JOIN related r ON r.id=linked.locationId WHERE linked.featureId=${feature.id})`,
          after ? gt(feature.id, after) : undefined,
        ),
      )
      .orderBy(feature.id)
      .limit(80)
    for (const row of rows) {
      if (!input.canRead(row)) continue
      const {
        organisationId: _organisationId,
        resourceHubId: _resourceHubId,
        ...summary
      } = row
      visible.push(summary)
      if (visible.length === 26)
        return { data: visible.slice(0, 25), nextCursor: visible[24].id }
    }
    after = rows.length === 80 ? rows.at(-1)?.id : undefined
  } while (after)
  return { data: visible, nextCursor: null }
}
