// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// SCHEMA
import { lifecycleTask } from '../schema/featureLifecycle.target'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { FeatureEntityFormData } from '../zod/schema/feature'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
// SERVICES
import {
  createFeatureCreationProposal,
  saveFeatureContributionDraft,
  acceptFeatureCreationProposal,
} from './featureLifecycleContribution'
import {
  prepareFeatureContributionTask,
  prepareFeatureContributionTaskCompletion,
} from './featureLifecycleTask'
import { rejectPartialFeatureProposal } from './featureLifecycle'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureCreationScope } from './featureLifecycleContribution'

const creationPayload = z.strictObject({
  format: z.literal('feature-create/v1'),
  content: FeatureRevisionContentSchema,
})
export type CreationTaskDraft = {
  taskId: string
  proposalId: string
  version: string
  contributorId: string
  modifiedAt: string
  scope: FeatureCreationScope
  content: FeatureRevisionContent
  status: string
  isDraft: boolean
  isReviewed: boolean
}

/** Check the current public contribution destination inside every draft/upload transaction.
 * @param scope Server-resolved parent chain. @returns Atomic public ancestry guard.
 */
export function creationContributionScopeGuard(scope: FeatureCreationScope): SQL {
  return sql`EXISTS(SELECT 1 FROM layer l JOIN project p ON p.id=l.projectId
    JOIN organisation o ON o.id=p.organisationId WHERE l.id=${scope.layerId}
    AND l.projectId=${scope.projectId} AND l.organisationId=${scope.organisationId} AND p.organisationId=${scope.organisationId}
    AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0)`
}

/** Read a creation task without pretending its proposed content is an accepted Feature.
 * @param db Request database. @param input Exact task and authorization predicate.
 * @returns Scoped proposal content and optimistic tokens, or null.
 */
export async function readFeatureCreationTask(
  db: Database,
  input: { taskId: string; guard: SQL },
): Promise<CreationTaskDraft | null> {
  const row = await db.get<{
    taskId: string
    proposalId: string
    version: string
    contributorId: string
    modifiedAt: string
    creationScope: string
    changes: string
    status: string
    isDraft: number
    isReviewed: number
  }>(sql`SELECT t.id taskId,p.id proposalId,p.version,p.contributorId,t.modifiedAt,p.creationScope,p.changes,p.status,t.isDraft,t.isReviewed
    FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId
    JOIN layer l ON l.id=json_extract(p.creationScope,'$.layerId')
    JOIN project project ON project.id=l.projectId JOIN organisation o ON o.id=project.organisationId
    WHERE t.id=${input.taskId} AND t.type='newFeature' AND t.featureId IS NULL
      AND p.kind='create' AND p.featureId IS NULL AND t.contributorId=p.contributorId
      AND t.projectId=project.id AND t.organisationId=o.id AND l.organisationId=o.id
      AND json_extract(p.creationScope,'$.projectId')=project.id
      AND json_extract(p.creationScope,'$.organisationId')=o.id AND (${input.guard})`)
  if (!row) return null
  const { creationScope, changes, ...rest } = row
  return {
    ...rest,
    isDraft: Boolean(row.isDraft),
    isReviewed: Boolean(row.isReviewed),
    scope: JSON.parse(creationScope),
    content: creationPayload.parse(JSON.parse(changes)).content,
  }
}

/** Save contributor form data while preserving the task's concurrently uploaded gallery.
 * @param db Request database. @param input Validated form content, scoped author and optional existing task.
 * @returns Draft identifiers; no Feature ID is allocated or returned.
 * @remarks Submitted proposals cannot be edited, and catalogue/source races roll back the whole save.
 */
export async function saveFeatureCreationTaskDraft(
  db: Database,
  input: {
    actorId: string
    scope: FeatureCreationScope
    content: FeatureRevisionContent
    checks: BatchItem<'sqlite'>[]
    taskId?: string
  },
): Promise<
  {
    task: { id: string }
    featureId: null
    proposalId: string
    proposalVersion: string
  } & FeatureCreationScope
> {
  const guard = creationContributionScopeGuard(input.scope)
  if (!input.taskId) {
    const taskId = crypto.randomUUID()
    const result = await createFeatureCreationProposal(db, {
      actorId: input.actorId,
      guard,
      scope: input.scope,
      content: input.content,
      attachTask: proposalId => [
        ...input.checks,
        ...prepareFeatureContributionTask(db, {
          taskId,
          proposalId,
          featureId: null,
          ...input.scope,
          actorId: input.actorId,
          type: 'newFeature',
          submitted: false,
        }),
      ],
    })
    if (!result) throw new Error('Contribution destination changed')
    return {
      task: { id: taskId },
      featureId: null,
      proposalId: result.proposalId,
      proposalVersion: result.version,
      ...input.scope,
    }
  }
  const current = await readFeatureCreationTask(db, { taskId: input.taskId, guard })
  if (!current || current.contributorId !== input.actorId)
    throw new Error('Contribution draft is unavailable')
  if (!current.isDraft || current.isReviewed || current.status !== 'draft')
    throw new Error('Contribution has already been submitted')
  if (
    current.scope.layerId !== input.scope.layerId ||
    current.scope.projectId !== input.scope.projectId ||
    current.scope.organisationId !== input.scope.organisationId
  )
    throw new Error('Contribution destination cannot change during editing')
  const content = structuredClone(input.content)
  content.gallery = current.content.gallery
  const version = await saveFeatureContributionDraft(db, {
    actorId: input.actorId,
    proposalId: current.proposalId,
    expectedVersion: current.version,
    guard: sql`(${guard}) AND EXISTS(SELECT 1 FROM task WHERE id=${input.taskId} AND proposalId=${current.proposalId}
      AND modifiedAt=${current.modifiedAt} AND isDraft=1 AND isReviewed=0)`,
    payload: { format: 'feature-create/v1', content },
    validate: () => [],
    completion: [
      ...input.checks,
      db
        .update(lifecycleTask)
        .set({
          modifiedAt: new Date(
            Math.max(Date.now(), Date.parse(current.modifiedAt) + 1),
          ).toISOString(),
        })
        .where(eq(lifecycleTask.id, input.taskId)),
    ],
  })
  if (!version) throw new Error('Contribution draft changed; refresh before saving')
  return {
    task: { id: input.taskId },
    featureId: null,
    proposalId: current.proposalId,
    proposalVersion: version,
    ...input.scope,
  }
}

/** Materialize a creation proposal for the existing form validator without creating a database record.
 * @param draft Scoped proposal content. @returns Normal authoring field values.
 */
export function featureCreationTaskFormData(
  draft: Pick<CreationTaskDraft, 'scope' | 'content' | 'contributorId'>,
) {
  const content = draft.content
  return {
    ...draft.scope,
    contributorId: draft.contributorId,
    geometry: content.placement.geometry,
    addressMeta: content.placement.addressMeta,
    featureType: content.profile.featureType ?? null,
    isIntangible: content.profile.isIntangible,
    isVisitable: content.profile.visitability.isVisitable,
    visitableAsOf: content.profile.visitability.asOf,
    isDraft: false,
    isPendingReview: true,
    i18n: Object.fromEntries(
      Object.entries(content.translations).map(([locale, value]) => [
        contentFormKey(locale),
        {
          title: value.title.value,
          titleGen: value.title.generated,
          description: value.description.value ?? '',
          descriptionGen: value.description.generated,
          displayAddress: value.address.value ?? '',
          displayAddressGen: value.address.generated,
          addressProperties: value.address.properties ?? {},
        },
      ]),
    ),
    properties: Object.entries(content.properties).map(([propertyId, value]) => ({
      propertyId,
      value: value.selection.value,
      valueJson: value.selection.valueJson,
      propertyValueId: value.selection.propertyValueId,
      i18n: Object.fromEntries(
        Object.entries(value.translations).map(([locale, translation]) => [
          contentFormKey(locale),
          {
            value: translation.value ?? undefined,
            valueGen: translation.generated ?? false,
          },
        ]),
      ),
    })),
  }
}

/** Submit a complete creation proposal with exactly its retained task photo evidence.
 * @param db Request database. @param input Session-owned draft task.
 * @returns Whether submission committed, or was already submitted; stale races return false.
 * @remarks The same transaction freezes the proposal and finalizes the task. No Feature exists yet.
 */
export async function submitFeatureCreationTask(
  db: Database,
  input: { taskId: string; actorId: string },
): Promise<boolean> {
  const current = await readFeatureCreationTask(db, {
    taskId: input.taskId,
    guard: sql`1`,
  })
  if (!current || current.contributorId !== input.actorId)
    throw new Error('Contribution draft is unavailable')
  if (!current.isDraft) return current.status === 'submitted'
  if (current.isReviewed || current.status !== 'draft') return false
  FeatureEntityFormData.parse(featureCreationTaskFormData(current))
  if (!current.content.gallery.order.length)
    throw new Error('At least one image is required')
  const entries = JSON.stringify(current.content.gallery.entries)
  const guard = sql`(${creationContributionScopeGuard(current.scope)}) AND EXISTS(SELECT 1 FROM task WHERE id=${input.taskId}
    AND proposalId=${current.proposalId} AND modifiedAt=${current.modifiedAt} AND isDraft=1 AND isReviewed=0)
    AND NOT EXISTS(SELECT 1 FROM json_each(${entries}) entry WHERE NOT EXISTS(
      SELECT 1 FROM featureUploadEvidence u JOIN taskImage ti ON ti.imageId=u.imageId AND ti.taskId=${input.taskId}
      JOIN image i ON i.id=u.imageId AND i.isArchived=0
      WHERE u.proposalId=${current.proposalId} AND u.actorId=${input.actorId} AND u.imageId=entry.key
        AND u.imageRevisionId=json_extract(entry.value,'$.imageRevisionId')
        AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})))
    AND NOT EXISTS(SELECT 1 FROM taskImage ti WHERE ti.taskId=${input.taskId}
      AND NOT EXISTS(SELECT 1 FROM json_each(${entries}) entry WHERE entry.key=ti.imageId))`
  return Boolean(
    await saveFeatureContributionDraft(db, {
      actorId: input.actorId,
      proposalId: current.proposalId,
      expectedVersion: current.version,
      guard,
      payload: { format: 'feature-create/v1', content: current.content },
      submit: true,
      validate: () => [],
      completion: [
        db
          .update(lifecycleTask)
          .set({
            isDraft: 0,
            modifiedAt: new Date(
              Math.max(Date.now(), Date.parse(current.modifiedAt) + 1),
            ).toISOString(),
          })
          .where(eq(lifecycleTask.id, input.taskId)),
      ],
    }),
  )
}

/** Review a frozen creation task and record the exact accepted identity or rejection.
 * @param db Request database. @param input Scoped reviewer, inspected task/proposal tokens and decision.
 * @returns Accepted identity, rejected result, or null for a stale review.
 * @remarks Acceptance creates unpublished content; publication remains a separate authorized action.
 */
export async function reviewFeatureCreationTask(
  db: Database,
  input: {
    taskId: string
    proposalId: string
    expectedVersion: string
    expectedModifiedAt: string
    actorId: string
    guard: SQL
    accept: boolean
    reason: string
    imageReview?: { taskId: string; reviewId: string | null }
  },
): Promise<{ featureId: string | null } | null> {
  const current = await readFeatureCreationTask(db, input)
  if (
    !current ||
    current.isDraft ||
    current.isReviewed ||
    current.status !== 'submitted' ||
    current.proposalId !== input.proposalId ||
    current.version !== input.expectedVersion ||
    current.modifiedAt !== input.expectedModifiedAt
  )
    return null
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM task WHERE id=${input.taskId}
    AND proposalId=${input.proposalId} AND modifiedAt=${input.expectedModifiedAt} AND isDraft=0 AND isReviewed=0)`
  const completion = (featureId: string | null) =>
    prepareFeatureContributionTaskCompletion(db, {
      ...input,
      guard,
      featureId,
      outcome: input.accept ? 'accepted' : 'rejected',
      action: input.accept ? 'added-feature' : 'ignored',
    })
  if (!input.accept)
    return (await rejectPartialFeatureProposal(db, {
      ...input,
      guard,
      expectedProposalVersion: input.expectedVersion,
      completion: completion(null),
    }))
      ? { featureId: null }
      : null
  FeatureEntityFormData.parse(featureCreationTaskFormData(current))
  return acceptFeatureCreationProposal(db, {
    ...input,
    guard,
    validate: () => [],
    completion: featureId => completion(featureId),
  })
}
