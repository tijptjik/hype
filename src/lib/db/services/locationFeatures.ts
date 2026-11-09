// DRIZZLE
import { and, eq, gt, sql } from 'drizzle-orm'
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
 * drafts and archived rows when authorized; historical or unlinked associations are excluded.
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
              : sql`EXISTS(SELECT 1 FROM featureLocation linked WHERE linked.featureId=${feature.id} AND linked.locationId=${input.locationId})`,
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
