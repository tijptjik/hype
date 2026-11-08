// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql, type SQL } from 'drizzle-orm'
// DB
import { feature, organisation, project, task } from '#lib/db/schema/index.js'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
// TYPES
import type { Database } from '#lib/types.js'
import type { TaskNew } from '#lib/db/zod/schema/task.types.js'

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

/** Resolve task ancestry for accepted Features and creation proposals without a Feature row.
 * @param db Request database, used to select the installed lifecycle schema.
 * @returns Correlated scope predicate; caller must also enforce actor and hub authorization.
 * @remarks Creation tasks must match the proposal author and its complete live parent chain.
 */
export async function taskLifecycleScopeCondition(db: Database): Promise<SQL> {
  const existing = taskFeatureScopeCondition()
  if (!(await hasFeatureLifecycleStorage(db))) return existing
  // Keep both ancestry branches inside the caller's identity and authorization filters.
  return sql`((${existing}) OR EXISTS (
    SELECT 1 FROM main.task creation_task
    JOIN featureRevisionProposal proposal ON proposal.id=creation_task.proposalId
    JOIN layer creation_layer ON creation_layer.id=json_extract(proposal.creationScope,'$.layerId')
    JOIN project creation_project ON creation_project.id=creation_layer.projectId
    JOIN organisation creation_org ON creation_org.id=creation_project.organisationId
    WHERE creation_task.id=${task.id} AND creation_task.featureId IS NULL
      AND creation_task.type='newFeature' AND proposal.kind='create' AND proposal.featureId IS NULL
      AND creation_task.contributorId=proposal.contributorId
      AND creation_task.projectId=creation_project.id
      AND creation_task.organisationId=creation_org.id
      AND creation_layer.organisationId=creation_org.id
      AND json_extract(proposal.creationScope,'$.projectId')=creation_project.id
      AND json_extract(proposal.creationScope,'$.organisationId')=creation_org.id
  ))`
}

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

/**
 * Checks submitted task ancestry against live rows inside a write transaction.
 * @param data Submitted feature and parent identities.
 * @returns Predicate that rejects missing or reparented contribution targets.
 */
export function taskSubmissionScopeCondition(
  data: Pick<TaskNew, 'featureId' | 'projectId' | 'organisationId'>,
): SQL {
  return sql`EXISTS (
    SELECT 1 FROM feature f
    JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=p.organisationId
    WHERE f.id=${data.featureId} AND p.id=${data.projectId}
      AND o.id=${data.organisationId}
  )`
}
