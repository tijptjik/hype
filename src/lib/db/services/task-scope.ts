// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DB
import { feature, organisation, project, task } from '$lib/db/schema'
// TYPES
import type { Database, TaskNew } from '$lib/types'

/**
 * Restricts persisted tasks to their feature's canonical project/organisation chain.
 *
 * @returns A correlated condition suitable for task probes and relational reads.
 * @remarks Explicit inner aliases preserve correlation when Drizzle aliases task reads.
 */
export const taskFeatureScopeCondition = (): SQL<unknown> => sql`exists (
  select 1 from "feature" as task_scope_feature
  inner join "project" as task_scope_project
    on task_scope_project."id" = task_scope_feature."projectId"
  inner join "organisation" as task_scope_organisation
    on task_scope_organisation."id" = task_scope_project."organisationId"
  where task_scope_feature."id" = ${task.featureId}
    and task_scope_feature."projectId" = ${task.projectId}
    and task_scope_project."organisationId" = ${task.organisationId}
)`

/**
 * Rejects task submissions whose supplied scope does not match the persisted feature.
 *
 * @param db Database handle.
 * @param data Submitted feature and parent IDs.
 * @returns Resolves when all three IDs describe the same persisted resource chain.
 * @remarks Read-side scope guards also quarantine inconsistent legacy or raced rows.
 */
export const assertTaskFeatureScope = async (
  db: Database,
  data: Pick<TaskNew, 'featureId' | 'projectId' | 'organisationId'>,
): Promise<void> => {
  // Contribution permissions do not grant authority to choose a different task scope.
  const [scope] = await db
    .select({ id: feature.id })
    .from(feature)
    .innerJoin(project, eq(project.id, feature.projectId))
    .innerJoin(organisation, eq(organisation.id, project.organisationId))
    .where(
      and(
        eq(feature.id, data.featureId),
        eq(project.id, data.projectId),
        eq(organisation.id, data.organisationId),
      ),
    )
    .limit(1)
  if (!scope) throw error(400, 'TASK_FEATURE_SCOPE_MISMATCH')
}
