// DRIZZLE
import { and, eq, exists, sql } from 'drizzle-orm'
// DB
import { feature, layer, project, organisation } from '#lib/db/schema/index.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database, Id } from '#lib/types.js'
import type { FeatureCommandProbe } from '#lib/db/zod/schema/feature.types.js'

/**
 * Rechecks a Feature's persisted authorized scope for a transactional command.
 * @param db Request database.
 * @param id Target Feature identity.
 * @param expectedScope Ancestry captured before command authorization.
 * @returns Predicate requiring the same Feature ancestry and nullable hub identity.
 * @remarks Parent links must agree with denormalized Feature IDs. This checks scope,
 * not role grants or publication state, and must execute within the mutation transaction.
 */
export function buildFeatureCommandScopeGuard(
  db: Database,
  id: Id,
  expectedScope: Omit<FeatureCommandProbe, 'id'>,
): SQL {
  return exists(
    db
      .select({ id: feature.id })
      .from(feature)
      .innerJoin(layer, eq(feature.layerId, layer.id))
      .innerJoin(project, eq(feature.projectId, project.id))
      .innerJoin(organisation, eq(feature.organisationId, organisation.id))
      .where(
        and(
          eq(feature.id, id),
          eq(feature.layerId, expectedScope.layerId),
          eq(feature.projectId, expectedScope.projectId),
          eq(feature.organisationId, expectedScope.organisationId),
          eq(layer.projectId, expectedScope.projectId),
          eq(layer.organisationId, expectedScope.organisationId),
          eq(project.organisationId, expectedScope.organisationId),
          sql`${organisation.hubId} IS ${expectedScope.resourceHubId}`,
        ),
      ),
  )
}
