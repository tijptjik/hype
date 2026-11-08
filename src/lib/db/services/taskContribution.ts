// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { task } from '../schema/task'
// SERVICES
import {
  prepareFeatureFormCreation,
  prepareUnlinkedFeatureFormSave,
} from './featureFormSave'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { taskSubmissionScopeCondition } from './task-scope'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureDB } from '../zod/schema/feature.types'
import type { TaskDB, TaskNew } from '../zod/schema/task.types'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. ATOMIC CREATION
// 2. REVISION-GUARDED DRAFT UPDATES
// ---

/**
 * Creates a contribution Feature, its relations and review task atomically.
 * @param db Request-local database.
 * @param input Validated, authorized Feature creation snapshot.
 * @param author Session-owned task contributor and optional submitted message.
 * @returns Persisted Feature and task after the complete batch commits.
 * @remarks Translation and upload work belongs outside this transaction. Task ancestry
 * is derived from the Feature and checked against live parents inside the batch.
 */
export async function createFeatureTask(
  db: Database,
  input: Parameters<typeof prepareFeatureFormCreation>[1],
  author: Pick<TaskNew, 'contributorId' | 'message'>,
): Promise<{ feature: FeatureDB; task: TaskDB }> {
  const plan = await prepareFeatureFormCreation(db, {
    ...input,
    revisionActor: { actorId: author.contributorId!, mode: 'contribution' },
  })
  const taskData: TaskNew = {
    ...author,
    type: 'newFeature',
    featureId: plan.id,
    projectId: input.data.projectId,
    organisationId: input.data.organisationId,
    isDraft: input.data.isDraft ?? false,
    isReviewed: false,
  }
  // A task failure or changed ancestry must roll back the Feature and every relation.
  const scope = sql`EXISTS (
    SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId
    WHERE l.id=${input.data.layerId} AND p.id=${input.data.projectId}
      AND p.organisationId=${input.data.organisationId}
  )`
  const results = await executeRevisionBatch(db, scope, [
    ...plan.statements,
    prepareRevisionCheck(db, taskSubmissionScopeCondition(taskData)),
    db.insert(task).values(taskData).returning(),
  ])
  if (!results) throw error(400, 'TASK_FEATURE_SCOPE_MISMATCH')
  const createdFeature = (results[plan.statements.length - 1] as FeatureDB[])[0]
  const createdTask = (results[results.length - 1] as TaskDB[])[0]
  if (!createdFeature || !createdTask) throw error(500, 'Contribution creation failed')
  return { feature: createdFeature, task: createdTask }
}

/** Persisted task identity captured after authorizing its contributor. */
export type ContributionDraftTask = Pick<
  TaskDB,
  'id' | 'featureId' | 'contributorId' | 'modifiedAt' | 'projectId' | 'organisationId'
>

/**
 * Saves a contribution draft and its task ancestry as one revision-guarded state.
 * @param db Request-local database.
 * @param input Prepared Feature form update, including expected Feature revision.
 * @param expected Authorized persisted draft task identity and revision.
 * @returns Both committed records, or undefined when either draft has changed.
 * @remarks Submission, review, reassignment or initial Location linking supersedes this save.
 */
export async function saveFeatureTaskDraft(
  db: Database,
  input: Parameters<typeof prepareUnlinkedFeatureFormSave>[1],
  expected: ContributionDraftTask,
): Promise<{ feature: FeatureDB; task: TaskDB } | undefined> {
  if (input.featureId !== expected.featureId) return undefined
  const plan = await prepareUnlinkedFeatureFormSave(db, {
    ...input,
    actorId: expected.contributorId!,
    expectedDraftState: true,
    data: { ...input.data, isDraft: true, contributorId: expected.contributorId },
  })
  if (!plan) return undefined
  const projectId = input.data.projectId ?? input.projectId
  const organisationId = input.data.organisationId ?? expected.organisationId
  const taskGuard = and(
    eq(task.id, expected.id),
    eq(task.featureId, expected.featureId),
    eq(task.contributorId, expected.contributorId),
    eq(task.modifiedAt, expected.modifiedAt),
    eq(task.projectId, expected.projectId),
    eq(task.organisationId, expected.organisationId),
    eq(task.type, 'newFeature'),
    eq(task.isDraft, true),
    eq(task.isReviewed, false),
  )!
  const scope = sql`EXISTS (
    SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId
    WHERE l.id=${input.data.layerId} AND p.id=${projectId}
      AND p.organisationId=${organisationId}
  )`
  const modifiedAt = new Date(
    Math.max(Date.now(), (Date.parse(expected.modifiedAt) || 0) + 1),
  ).toISOString()
  const savedTask = and(
    eq(task.id, expected.id),
    eq(task.modifiedAt, modifiedAt),
    eq(task.projectId, projectId),
    eq(task.organisationId, organisationId),
  )!
  // Reject either stale draft before writes, then assert both writes before committing.
  const results = await executeRevisionBatch(
    db,
    and(scope, sql`EXISTS (SELECT 1 FROM task WHERE ${taskGuard})`)!,
    [
      ...plan.statements,
      prepareRevisionCheck(db, plan.guard),
      db.update(task).set({ projectId, organisationId, modifiedAt }).where(taskGuard),
      prepareRevisionCheck(db, sql`EXISTS (SELECT 1 FROM task WHERE ${savedTask})`),
      db.select().from(task).where(savedTask),
    ],
  )
  if (!results) return undefined
  return {
    feature: (results[plan.statements.length - 1] as FeatureDB[])[0],
    task: (results[results.length - 1] as TaskDB[])[0],
  }
}
