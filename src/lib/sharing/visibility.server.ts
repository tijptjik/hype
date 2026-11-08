// DRIZZLE
import { and, eq, exists, isNull, or, type SQL } from 'drizzle-orm'
// DB
import { feature, layer, project, organisation, hub } from '#lib/db/schema/index.js'
import { getOrganisationHubFilter } from '#lib/db/services/hub.js'
import {
  historicalLayerVisibility,
  historicalFeatureVisibility,
} from '#lib/db/services/historicalLayers.js'
// TYPES
import type { ShareKind } from './resource'
import type { Database } from '#lib/types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

/** Builds anonymous publication predicates for each level of the sharing hierarchy.
 * @param db Request database. @param host Trusted request hub.
 * @returns Predicates that reject hidden ancestors and inconsistent ownership.
 * @remarks Session privileges cannot bypass this public preview boundary.
 */
export function publicShareVisibility(
  db: Database,
  host: HubOptsExtended,
): Record<ShareKind, SQL | undefined> {
  const publicOrg = and(
    eq(organisation.isPublished, true),
    eq(organisation.isArchived, false),
    getOrganisationHubFilter(db, {
      ...host,
      isSuperAdmin: false,
      isAdminRequest: false,
    }),
    or(
      isNull(organisation.hubId),
      exists(
        db
          .select({ id: hub.id })
          .from(hub)
          .where(
            and(
              eq(hub.id, organisation.hubId),
              eq(hub.isPublished, true),
              eq(hub.isArchived, false),
            ),
          ),
      ),
    ),
  )
  const publicProject = and(
    eq(project.isPublished, true),
    eq(project.isArchived, false),
    exists(
      db
        .select({ id: organisation.id })
        .from(organisation)
        .where(and(eq(organisation.id, project.organisationId), publicOrg)),
    ),
  )
  const publicLayer = and(
    eq(layer.isPublished, true),
    eq(layer.isArchived, false),
    historicalLayerVisibility(),
    exists(
      db
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, layer.projectId),
            eq(project.organisationId, layer.organisationId),
            publicProject,
          ),
        ),
    ),
  )
  const publicFeature = and(
    eq(feature.isPublished, true),
    eq(feature.isArchived, false),
    eq(feature.isDraft, false),
    historicalFeatureVisibility(),
    exists(
      db
        .select({ id: layer.id })
        .from(layer)
        .where(
          and(
            eq(layer.id, feature.layerId),
            eq(layer.projectId, feature.projectId),
            eq(layer.organisationId, feature.organisationId),
            publicLayer,
          ),
        ),
    ),
  )
  return {
    organisation: publicOrg,
    project: publicProject,
    layer: publicLayer,
    feature: publicFeature,
  }
}
