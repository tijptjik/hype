// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature, featureProperty, featurePropertyI18n } from '../schema/feature'
import { propertyValue, propertyValueI18n } from '../schema/property'
import { featureImage } from '../schema/image'
import { featureLocation } from '../schema/location'
import { featureLocationMembership } from '../schema/locationRelationships'
import { featureRevision } from '../schema/featureRevision'
import {
  featureIdentityProposal,
  featureIdentityProposalDecision,
  featureIdentityReservation,
} from '../schema/featureIdentityProposal'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { FeatureIdentitySelectionSchema } from '#lib/revisions/featureIdentityPlan.js'
import { validateFeatureLineage, retiredFeatureIds } from '#lib/revisions/lineage.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import {
  hasFeatureLifecycleStorage,
  readCurrentFeatureRevision,
} from './featureLifecycle'
import { readPartialFeatureProposal } from './featureLifecycleProposal'
import { validateFeatureFormPropertyValues } from './featureFormReview'
import { readFeatureRevisionWorkspace } from './featureRevisionWorkspace'
import {
  prepareFeatureRevisionInitialization,
  prepareRevisionChangeSet,
} from './featureRevision'
import { publishFeatureIdentityOperation } from './featureIdentityRevision'
import { featureUploadEvidenceSource } from './featureUploadEvidence'
import { prepareFeatureIdentityRelationships } from './featureIdentityRelationships'
import { readFeatureRevisionSource } from './featureRevisionSource'
import { parseFeatureRevisionSource } from './featureRevisionContent'
import {
  featureContentProjectionMatches,
  prepareFeatureEditorialProjection,
} from './featureRevisionProjection'
import { prepareRevisionCheck, executeRevisionBatch } from './revisionBatch'
// TYPES
import type {
  FeatureTaskAssignment,
  IdentityTaskEvidence,
} from '#lib/revisions/featureRelationshipPlan.js'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'
import type { RevisionCommand, RevisionProjection } from './featureRevision'
import type { FeatureIdentityHead } from './featureIdentityRevision'
import type { FeatureRevisionRef } from '#lib/revisions/lineage.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Authorized source and relationship inspection
// 2. Immutable proposal and child reservation
// 3. Reviewed atomic publication
// ═══════════════════════

type IdentityPlan = {
  inputs: FeatureRevisionRef[]
  outputs: FeatureRevisionRef[]
  heads: FeatureIdentityHead[]
  redirectFeatureId?: string | null
  sourceRevisions: Record<string, string>
  relations: string
  reason: string
  scope: { organisationId: string; projectId: string; layerId: string }
}
export type IdentityCommand = RevisionCommand & {
  allowedInternalIds: ReadonlySet<string>
  contributionTaskId?: string
}

/** Checks storage availability without forcing a live migration.
 * @param db Request database. @returns Whether the identity review migration is present.
 */
export async function featureIdentityReviewEnabled(db: Database): Promise<boolean> {
  return Boolean(
    (
      await db.get<{ n: number }>(
        sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='featureIdentityProposal'`,
      )
    )?.n,
  )
}

/** Captures complete dependent relationship state with bounded bindings.
 * @param ids Source identities. @param uploads Current task upload evidence relation.
 * @returns Exact, deterministic task/photo/user relationship evidence.
 * @remarks Visits and completed tasks remain historical; no event is reassigned by copying content.
 */
function relationsSql(ids: readonly string[], uploads: SQL): SQL {
  const keys = JSON.stringify(ids)
  return sql`json_object('tasks',json((SELECT json_group_array(json(row)) FROM
    (SELECT json_object('id',id,'featureId',featureId,'isReviewed',isReviewed,'isDraft',isDraft,'modifiedAt',modifiedAt,'type',type,'contributorId',contributorId) row
      FROM task WHERE featureId IN (SELECT value FROM json_each(${keys})) ORDER BY id))),
    'images',json((SELECT json_group_array(json(row)) FROM
    (SELECT json_object('taskId',t.id,'imageId',ti.imageId) row FROM task t JOIN taskImage ti ON ti.taskId=t.id
      WHERE t.featureId IN(SELECT value FROM json_each(${keys})) ORDER BY t.id,ti.imageId))),
    'uploads',json((SELECT json_group_array(json(row)) FROM
    (SELECT json_object('id',u.id,'featureId',u.featureId,'taskIds',u.taskIds,'proposalId',p.id,'candidate',p.candidateRevisionId,'status',p.status) row
      FROM ${uploads} u JOIN featureRevisionProposal p ON p.id=u.proposalId
      WHERE u.featureId IN(SELECT value FROM json_each(${keys})) ORDER BY u.id,u.taskIds))),
    'users',json((SELECT json_group_array(json(row)) FROM
    (SELECT json_object('userId',userId,'featureId',featureId,'isVisited',isVisited,'isWishlisted',isWishlisted,'visitedAt',visitedAt,'modifiedAt',modifiedAt) row
      FROM userFeature WHERE featureId IN (SELECT value FROM json_each(${keys})) ORDER BY userId,featureId))))`
}

/** Reads a currently published source and refuses exposure of inaccessible internal values.
 * @param db Request database. @param input Authorized command and exact identity.
 * @returns Immutable content, publication token and fenced source projection.
 */
export async function inspectFeatureIdentitySource(
  db: Database,
  input: IdentityCommand & { featureId: string },
) {
  if (await hasFeatureLifecycleStorage(db)) {
    const current = await readCurrentFeatureRevision(db, input)
    if (!current || current.retired || current.state.isArchived)
      throw new Error('Select an active Feature with accepted content')
    const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
    if (!source) throw new Error('Feature scope changed')
    const snapshot = parseFeatureRevisionSource(source.snapshot)
    const pending = input.contributionTaskId
      ? await db.get<{
          id: string
          version: string
        }>(sql`SELECT p.id,p.version FROM task t
      JOIN featureRevisionProposal p ON p.id=t.proposalId AND p.featureId=t.featureId WHERE t.id=${input.contributionTaskId}
      AND t.featureId=${input.featureId} AND t.isReviewed=0 AND t.isDraft=0 AND p.status='submitted'`)
      : null
    const proposed = pending
      ? await readPartialFeatureProposal(db, {
          ...input,
          proposalId: pending.id,
          version: pending.version,
          status: 'submitted',
        })
      : null
    const content = proposed?.content ?? current.content
    const privateIds = new Set(
      snapshot.fieldDefinitions
        .filter(value => value.audience === 'internal')
        .map(value => String(value.id)),
    )
    if (
      Object.entries(content.properties).some(
        ([id, property]) =>
          (privateIds.has(id) ||
            property.selection.definition.audience === 'internal') &&
          !input.allowedInternalIds.has(id),
      )
    )
      throw new Error(
        'Identity review requires access to every affected internal field',
      )
    return {
      initialContribution: Boolean(proposed),
      revisionId: current.revisionId,
      publishedRevisionId: current.state.isPublished ? current.revisionId : null,
      generation: current.version,
      content,
      source,
      record: snapshot.record,
    }
  }
  const reserved =
    await db.get(sql`SELECT 1 FROM featureIdentityReservation r WHERE r.featureId=${input.featureId}
    AND NOT EXISTS (SELECT 1 FROM featureIdentityProposalDecision d WHERE d.proposalId=r.proposalId AND d.outcome='accepted')`)
  if (reserved)
    throw new Error('This Feature is reserved by an unfinished identity operation')
  const workspace = await readFeatureRevisionWorkspace(db, {
    ...input,
    canPublish: true,
  })
  if (
    !workspace.enabled ||
    workspace.state !== 'active' ||
    (workspace.initialContribution && !input.contributionTaskId) ||
    !workspace.comparisonRevisionId
  )
    throw new Error('Select an active Feature with accepted content')
  let comparisonRevisionId = workspace.comparisonRevisionId
  if (workspace.initialContribution) {
    const pending = await db.get<{
      id: string
    }>(sql`SELECT p.candidateRevisionId id FROM featureInitialRevision i
      JOIN featureRevisionProposal p ON p.id=i.proposalId JOIN task t ON t.featureId=i.featureId
      WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND p.status='submitted'
        AND t.id=${input.contributionTaskId!} AND t.type='newFeature' AND t.isDraft=0 AND t.isReviewed=0
        AND t.contributorId=p.contributorId AND (${input.guard})`)
    if (!pending) throw new Error('Contribution is no longer awaiting review')
    comparisonRevisionId = pending.id
  }
  const stored = await db.get<{
    content: string
  }>(sql`SELECT r.content FROM featureRevision r JOIN feature f ON f.id=r.featureId
    WHERE r.id=${comparisonRevisionId} AND f.id=${input.featureId} AND f.isArchived=0 AND (${input.guard})`)
  if (!stored) throw new Error('Select an active Feature with accepted content')
  const row = {
    ...stored,
    initialContribution: workspace.initialContribution,
    revisionId: comparisonRevisionId,
    publishedRevisionId: workspace.publishedRevisionId,
    generation: workspace.generation,
  }
  const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
  if (!source) throw new Error('Feature scope changed')
  const snapshot = parseFeatureRevisionSource(source.snapshot)
  const privateIds = new Set(
    snapshot.fieldDefinitions
      .filter(value => value.audience === 'internal')
      .map(value => String(value.id)),
  )
  if (
    Object.entries(content.properties).some(
      ([id, property]) =>
        (privateIds.has(id) || property.selection.definition.audience === 'internal') &&
        !input.allowedInternalIds.has(id),
    )
  )
    throw new Error('Identity review requires access to every affected internal field')
  return { ...row, content, source, record: snapshot.record }
}

/** Stores exact outputs and reserves unpublished split children in a single batch.
 * @param db Request database. @param input Fully authorized input scopes and server-validated selectors.
 * @returns Submitted proposal identity; no source publication changes.
 * @remarks Cross-feature ancestry is recorded by the operation, never a same-feature parent FK.
 */
export async function createFeatureIdentityProposal(
  db: Database,
  input: IdentityCommand & { selection: FeatureIdentitySelection },
): Promise<string | null> {
  if (await hasFeatureLifecycleStorage(db))
    throw new Error(
      'Staff split and merge preparation stays in the dialog; apply the operation directly',
    )
  const selection = FeatureIdentitySelectionSchema.parse(input.selection)
  const sources = new Map<
    string,
    Awaited<ReturnType<typeof inspectFeatureIdentitySource>>
  >()
  for (const ref of selection.inputs) {
    if (sources.has(ref.featureId)) throw new Error('Duplicate input Feature')
    const source = await inspectFeatureIdentitySource(db, {
      ...input,
      featureId: ref.featureId,
    })
    if (source.revisionId !== ref.revisionId || source.generation !== ref.generation)
      return null
    sources.set(ref.featureId, source)
  }
  const first = sources.values().next().value!
  if (
    [...sources.values()].some(
      source =>
        source.record.layerId !== first.record.layerId ||
        source.record.projectId !== first.record.projectId ||
        source.record.organisationId !== first.record.organisationId,
    )
  )
    throw new Error('Identity operations require Features in the same layer')
  const proposalId = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, { ...input, reason: selection.reason })
  const statements: BatchItem<'sqlite'>[] = [change.statement]
  const heads = selection.inputs.map(ref => ({
    featureId: ref.featureId,
    publishedRevisionId: sources.get(ref.featureId)!.publishedRevisionId,
    generation: ref.generation,
  })) as FeatureIdentityHead[]
  for (const [id, source] of sources)
    statements.push(
      prepareRevisionCheck(
        db,
        sql`(${source.source.unchanged})
    AND (${source.initialContribution ? sql`1` : featureContentProjectionMatches(id, source.content)}) AND EXISTS(SELECT 1 FROM featureRevisionHead
      WHERE featureId=${id} AND state='active' AND publishedRevisionId IS ${source.publishedRevisionId} AND generation=${source.generation})`,
      ),
    )
  const outputs: FeatureRevisionRef[] = [],
    reservations: string[] = [],
    sourceRevisions: Record<string, string> = {}
  for (const output of selection.outputs) {
    const selected = sources.get(output.sourceFeatureId)
    if (!selected) throw new Error('Output content must come from an inspected input')
    const featureId = output.featureId ?? crypto.randomUUID()
    if (output.featureId && !sources.has(featureId))
      throw new Error('Existing output must retain an input identity')
    const content = await buildSelectedFeatureIdentityContent(db, {
      kind: selection.kind,
      output,
      featureId,
      sources,
      allowedInternalIds: input.allowedInternalIds,
      layerId: String(first.record.layerId),
    })
    const revisionId = crypto.randomUUID()
    let previousRevisionId = sources.get(featureId)?.revisionId ?? null
    if (!output.featureId) {
      const baseline = structuredClone(content)
      baseline.placement.location = null
      baseline.detachedBrands = null
      baseline.translations = {}
      baseline.properties = {}
      baseline.gallery = { order: [], entries: {} }
      statements.push(
        db.insert(feature).values({
          id: featureId,
          formWriteToken: crypto.randomUUID(),
          organisationId: String(first.record.organisationId),
          projectId: String(first.record.projectId),
          layerId: String(first.record.layerId),
          contributorId: input.actorId,
          isDraft: true,
          isPublished: false,
          localIsPublished: false,
          isPendingReview: false,
          geometry: baseline.placement.geometry,
          addressMeta: baseline.placement
            .addressMeta as typeof feature.$inferInsert.addressMeta,
          spatialIndex: createFeatureSpatialIndex(baseline.placement.geometry),
          featureType: baseline.profile.featureType ?? null,
          nameTemplate: baseline.profile.nameTemplate
            ? { rule: baseline.profile.nameTemplate.rule }
            : null,
          kind: baseline.profile.kind ?? null,
          targetContext: baseline.profile.targetContext ?? null,
          associationRelation: baseline.profile.associationRelation ?? null,
          isIntangible: baseline.profile.isIntangible,
          isVisitable: baseline.profile.visitability.isVisitable,
          visitableAsOf: baseline.profile.visitability.asOf,
        }),
      )
      const initial = await prepareFeatureRevisionInitialization(db, {
        ...input,
        featureId,
        content: baseline,
        published: false,
      })
      statements.push(...initial.statements)
      previousRevisionId = initial.revisionId
      heads.push({ featureId, publishedRevisionId: null, generation: 0 })
      reservations.push(featureId)
    }
    statements.push(
      db.insert(featureRevision).values({
        id: revisionId,
        featureId,
        previousRevisionId,
        content: FeatureRevisionContentSchema.parse(content),
        changeSetId: change.id,
      }),
    )
    outputs.push({ featureId, revisionId })
    sourceRevisions[featureId] = previousRevisionId!
  }
  const lineage = validateFeatureLineage({
    kind: selection.kind,
    inputs: selection.inputs,
    outputs,
  })
  if (!lineage.valid) throw new Error(lineage.reason)
  if (
    selection.redirectOutputIndex != null &&
    (selection.kind !== 'split' || !outputs[selection.redirectOutputIndex])
  )
    throw new Error('Select a split successor for the automatic redirect')
  const uploads = await featureUploadEvidenceSource(db)
  const relations = (await db.get<{ value: string }>(
    sql`SELECT ${relationsSql(
      selection.inputs.map(ref => ref.featureId),
      uploads,
    )} value`,
  ))!.value
  const plan: IdentityPlan = {
    inputs: selection.inputs.map(({ featureId, revisionId }) => ({
      featureId,
      revisionId,
    })),
    outputs,
    heads,
    sourceRevisions,
    relations,
    reason: selection.reason,
    redirectFeatureId:
      selection.redirectOutputIndex == null
        ? null
        : outputs[selection.redirectOutputIndex].featureId,
    scope: {
      organisationId: String(first.record.organisationId),
      projectId: String(first.record.projectId),
      layerId: String(first.record.layerId),
    },
  }
  statements.push(
    prepareRevisionCheck(
      db,
      sql`${relationsSql(
        plan.inputs.map(ref => ref.featureId),
        uploads,
      )}=${relations}`,
    ),
    db.insert(featureIdentityProposal).values({
      id: proposalId,
      actorId: input.actorId,
      kind: selection.kind,
      plan,
      changeSetId: change.id,
    }),
  )
  for (const id of reservations)
    statements.push(
      db.insert(featureIdentityReservation).values({ featureId: id, proposalId }),
    )
  return (await executeRevisionBatch(db, input.guard, statements)) ? proposalId : null
}

/** Reads immutable proposal evidence after the caller authorizes all identities.
 * @param db Request database. @param proposalId Stored proposal. @returns Exact plan or null.
 */
export async function readFeatureIdentityProposal(db: Database, proposalId: string) {
  const row = await db.get<{
    id: string
    actorId: string
    kind: 'merge' | 'split'
    plan: string
    outcome: string | null
    dispositions: string | null
  }>(sql`
    SELECT p.*,d.outcome,o.dispositions FROM featureIdentityProposal p LEFT JOIN featureIdentityProposalDecision d ON d.proposalId=p.id
    LEFT JOIN featureIdentityOperation o ON o.id=d.operationId WHERE p.id=${proposalId}`)
  return row
    ? {
        ...row,
        plan: JSON.parse(row.plan) as IdentityPlan,
        taskAssignments: (row.dispositions
          ? (JSON.parse(row.dispositions).taskAssignments ?? [])
          : []) as FeatureTaskAssignment[],
      }
    : null
}

/** Accepts all outputs and retirements together, or retains an immutable rejection.
 * @param db Request database. @param input Current publisher scope, explicit decision and reviewed relationship policy.
 * @returns Operation ID or rejection receipt, or null for stale inputs/relations.
 */
export async function decideFeatureIdentityProposal(
  db: Database,
  input: IdentityCommand & {
    proposalId: string
    accept: boolean
    reason: string
    relationshipsReviewed: true
    taskAssignments: FeatureTaskAssignment[]
    preserveVisibility?: boolean
    completion?: BatchItem<'sqlite'>[]
  },
): Promise<string | null> {
  const proposal = await readFeatureIdentityProposal(db, input.proposalId)
  if (!proposal || proposal.outcome) return null
  const { plan } = proposal
  const guard = sql`(${input.guard}) AND NOT EXISTS(SELECT 1 FROM featureIdentityProposalDecision WHERE proposalId=${input.proposalId})
    AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(plan.heads.map(head => head.featureId))}) expected WHERE NOT EXISTS(
      SELECT 1 FROM feature f WHERE f.id=expected.value AND f.organisationId=${plan.scope.organisationId}
        AND f.projectId=${plan.scope.projectId} AND f.layerId=${plan.scope.layerId}))`
  const change = prepareRevisionChangeSet(db, { ...input, reason: input.reason })
  if (!input.accept)
    return (await executeRevisionBatch(db, guard, [
      change.statement,
      db.insert(featureIdentityProposalDecision).values({
        proposalId: input.proposalId,
        outcome: 'rejected',
        changeSetId: change.id,
      }),
    ]))
      ? input.proposalId
      : null
  const uploads = await featureUploadEvidenceSource(db)
  const statements: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`${relationsSql(
        plan.inputs.map(ref => ref.featureId),
        uploads,
      )}=${plan.relations}`,
    ),
  ]
  const afterPublication: BatchItem<'sqlite'>[] = [],
    verifies: SQL[] = []
  for (const ref of plan.inputs) {
    const current = await inspectFeatureIdentitySource(db, {
      ...input,
      featureId: ref.featureId,
    })
    if (current.revisionId !== ref.revisionId) return null
    statements.push(prepareRevisionCheck(db, current.source.unchanged))
  }
  const images = plan.inputs.map(ref => ref.revisionId)
  const attachmentGuard = sql`1` // Exact selected pins are checked against immutable source revisions below.
  for (const output of plan.outputs) {
    const source = await readFeatureRevisionSource(db, output.featureId, input.guard)
    if (!source) return null
    const read = async (id: string): Promise<FeatureRevisionContent> => {
      const row = await db.get<{ content: string }>(
        sql`SELECT content FROM featureRevision WHERE featureId=${output.featureId} AND id=${id}`,
      )
      if (!row) throw new Error('Identity output evidence unavailable')
      return FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    }
    const previous = await read(plan.sourceRevisions[output.featureId]),
      content = await read(output.revisionId)
    const pins = JSON.stringify(content.gallery.entries)
    statements.push(
      prepareRevisionCheck(
        db,
        sql`NOT EXISTS(SELECT 1 FROM json_each(${pins}) entry
      WHERE NOT EXISTS(SELECT 1 FROM featureRevisionImage pin WHERE pin.featureRevisionId IN(SELECT value FROM json_each(${JSON.stringify(images)}))
        AND pin.imageId=entry.key AND pin.imageRevisionId=json_extract(entry.value,'$.imageRevisionId')))`,
      ),
    )
    const projection = prepareFeatureEditorialProjection(db, {
      featureId: output.featureId,
      source,
      previous,
      content,
      gallery: { actorId: input.actorId, attachmentGuard },
      identity: { actorId: input.actorId },
    })
    statements.push(...projection.statements)
    afterPublication.push(...(projection.afterPublication ?? []))
    verifies.push(projection.verify)
  }
  // Retired identities keep immutable content/history but no active Location subscription or
  // catalogue/gallery projection. Otherwise later refreshes and FK cascades target a dead head.
  for (const featureId of retiredFeatureIds({
    kind: proposal.kind,
    inputs: plan.inputs,
    outputs: plan.outputs,
  })) {
    statements.push(
      db
        .update(feature)
        .set({
          localLocationBrands: sql`json_object('brands',json('[]'),'actorId',${input.actorId},
      'revision',${crypto.randomUUID()},'sourceAssociationRevision',(SELECT version FROM featureLocation WHERE featureId=${featureId}))`,
        })
        .where(eq(feature.id, featureId)),
      db
        .delete(featureLocationMembership)
        .where(eq(featureLocationMembership.featureId, featureId)),
      db.delete(featureLocation).where(eq(featureLocation.featureId, featureId)),
      db
        .update(feature)
        .set({ localLocationBrands: null })
        .where(eq(feature.id, featureId)),
      db
        .delete(featurePropertyI18n)
        .where(eq(featurePropertyI18n.featureId, featureId)),
      db.delete(featureProperty).where(eq(featureProperty.featureId, featureId)),
      db.delete(featureImage).where(eq(featureImage.featureId, featureId)),
    )
    verifies.push(sql`NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${featureId})
      AND NOT EXISTS(SELECT 1 FROM featureProperty WHERE featureId=${featureId}) AND NOT EXISTS(SELECT 1 FROM featureImage WHERE featureId=${featureId})`)
  }
  if (!input.preserveVisibility)
    afterPublication.push(
      ...(await prepareFeatureIdentityRelationships(db, {
        proposalId: input.proposalId,
        actorId: input.actorId,
        kind: proposal.kind,
        inputs: plan.inputs,
        outputs: plan.outputs,
        tasks: (JSON.parse(plan.relations) as { tasks: IdentityTaskEvidence[] }).tasks,
        assignments: input.taskAssignments,
      })),
    )
  const visible = sql`NOT EXISTS(SELECT 1 FROM feature f JOIN layer l ON l.id=f.layerId JOIN project p ON p.id=f.projectId
    JOIN organisation o ON o.id=f.organisationId WHERE f.id IN(SELECT value FROM json_each(${JSON.stringify(plan.heads.map(head => head.featureId))}))
      AND (f.isArchived=1 OR l.isPublished=0 OR l.isArchived=1 OR p.isPublished=0 OR p.isArchived=1 OR o.isPublished=0 OR o.isArchived=1))`
  // Verify each output separately inside the atomic batch to bound D1 parameters.
  afterPublication.push(
    ...verifies.map(value => prepareRevisionCheck(db, value)),
    ...(input.completion ?? []),
  )
  const projection: RevisionProjection = {
    statements,
    afterPublication,
    verify: sql`1`,
  }
  return publishFeatureIdentityOperation(db, {
    ...input,
    guard: sql`(${guard}) AND (${input.preserveVisibility ? sql`1` : visible})`,
    publisherUserId: input.actorId,
    kind: proposal.kind,
    inputs: plan.inputs,
    outputs: plan.outputs,
    expectedHeads: plan.heads,
    dispositions: {
      policy:
        'reviewed task assignments; merge wishlists; retain visits, completed tasks and crosswalks',
      redirectFeatureId: plan.redirectFeatureId ?? null,
      taskAssignments: input.taskAssignments,
      evidence: JSON.parse(plan.relations),
      proposalId: input.proposalId,
    },
    projection,
    decisionStatements: operationId => [
      change.statement,
      db.insert(featureIdentityProposalDecision).values({
        proposalId: input.proposalId,
        outcome: 'accepted',
        operationId,
        changeSetId: change.id,
      }),
    ],
  })
}

/** Build selected output content from exact inspected sources and validated inline edits.
 * @param db Request database. @param input Server-inspected sources, selectors and current internal-field authority.
 * @returns Complete validated content for an atomic identity transaction.
 * @remarks No Feature or preparation row is inserted here; source tokens are fenced by the caller's acceptance batch.
 */
export async function buildSelectedFeatureIdentityContent(
  db: Database,
  input: {
    kind: 'split' | 'merge'
    output: FeatureIdentitySelection['outputs'][number]
    featureId: string
    sources: ReadonlyMap<string, { content: FeatureRevisionContent }>
    allowedInternalIds: ReadonlySet<string>
    layerId: string
  },
): Promise<FeatureRevisionContent> {
  const { output, featureId, sources } = input
  const selected = sources.get(output.sourceFeatureId)
  if (!selected) throw new Error('Output content must come from an inspected input')
  const content = structuredClone(selected.content)
  // Missing languages inherit the other inspected record's text without replacing primary values.
  if (input.kind === 'merge')
    for (const source of sources.values())
      for (const [locale, translation] of Object.entries(source.content.translations))
        if (!content.translations[locale])
          content.translations[locale] = structuredClone(translation)

  for (const key of ['profileSourceFeatureId', 'placementSourceFeatureId'] as const) {
    const sourceId = output[key]
    if (!sourceId) continue
    const value = sources.get(sourceId)
    if (!value) throw new Error('Field values must come from an inspected input')
    if (key === 'profileSourceFeatureId')
      content.profile = structuredClone(value.content.profile)
    else {
      content.placement = structuredClone(value.content.placement)
      content.detachedBrands = structuredClone(value.content.detachedBrands)
    }
  }
  // Localized addresses belong to the chosen placement, including languages missing there.
  const placementSourceId = output.placementSourceFeatureId ?? output.sourceFeatureId
  const placementSource = sources.get(placementSourceId)!
  for (const [locale, translation] of Object.entries(content.translations))
    translation.address = structuredClone(
      placementSource.content.translations[locale]?.address ?? {
        value: null,
        generated: false,
        properties: null,
      },
    )
  // A transferred shared Location owns its inherited names and phone values as well.
  if (content.placement.location && placementSourceId !== output.sourceFeatureId) {
    if (content.placement.location.acceptancePolicy?.nameMode !== 'independent')
      for (const [locale, translation] of Object.entries(content.translations))
        translation.title = structuredClone(
          placementSource.content.translations[locale]?.title ?? {
            value: '',
            generated: false,
          },
        )
    for (const [id, property] of Object.entries(content.properties))
      if (property.selection.definition.component === 'PhoneField')
        delete content.properties[id]
    for (const [id, property] of Object.entries(placementSource.content.properties))
      if (property.selection.definition.component === 'PhoneField')
        content.properties[id] = structuredClone(property)
  }
  for (const [locale, description] of Object.entries(output.descriptions ?? {})) {
    if (!content.translations[locale]) throw new Error('Unknown output language')
    content.translations[locale].description = { value: description, generated: false }
  }

  for (const [locale, title] of Object.entries(output.titles ?? {})) {
    if (!content.translations[locale]) throw new Error('Unknown output language')
    if (
      content.placement.location &&
      content.placement.location.acceptancePolicy?.nameMode !== 'independent' &&
      content.translations[locale].title.value !== title
    )
      throw new Error('Inherited names require separate Location review')
    if (content.translations[locale].title.value !== title)
      content.translations[locale].title = { value: title, generated: false }
  }
  if (output.images) {
    content.gallery = { order: [], entries: {} }
    for (const image of output.images) {
      const entry = sources.get(image.sourceFeatureId)?.content.gallery.entries[
        image.imageId
      ]
      if (!entry || content.gallery.entries[image.imageId])
        throw new Error('Invalid or duplicate image selection')
      content.gallery.order.push(image.imageId)
      content.gallery.entries[image.imageId] = {
        ...structuredClone(entry),
        ...(image.intent
          ? {
              intent: image.intent,
              ...(image.intent === 'research' ? { isPublished: false } : {}),
            }
          : {}),
      }
    }
  }
  // A reviewed cover belongs to the selected gallery; other featured photos become general.
  if (output.coverImageId) {
    if (!Object.hasOwn(content.gallery.entries, output.coverImageId))
      throw new Error('Cover photo must be selected in the output gallery')
    for (const [imageId, entry] of Object.entries(content.gallery.entries)) {
      if (imageId === output.coverImageId) entry.intent = 'canonical'
      else if (entry.intent === 'canonical') entry.intent = 'general'
    }
  }
  if (output.properties) {
    content.properties = {}
    for (const field of output.properties) {
      const value = sources.get(field.sourceFeatureId)?.content.properties[
        field.propertyId
      ]
      if (!value || content.properties[field.propertyId])
        throw new Error('Invalid or duplicate property selection')
      if (
        content.placement.location &&
        value.selection.definition.component === 'PhoneField' &&
        field.sourceFeatureId !== placementSourceId
      )
        throw new Error('Shared phone values must follow their accepted Location')
      content.properties[field.propertyId] = structuredClone(value)
    }
    if (content.placement.location)
      for (const [id, value] of Object.entries(placementSource.content.properties))
        if (
          value.selection.definition.component === 'PhoneField' &&
          !content.properties[id]
        )
          throw new Error('Shared phone values must follow their accepted Location')
  }
  if (output.profileEdits) {
    const edits = output.profileEdits
    if (edits.isIntangible !== undefined)
      content.profile.isIntangible = edits.isIntangible
    if (edits.isVisitable !== undefined)
      content.profile.visitability.isVisitable = edits.isVisitable
    if (edits.asOf !== undefined) content.profile.visitability.asOf = edits.asOf
  }
  // Resolve category choices under their owning field; clients never supply option definitions.
  if (output.propertyOptionEdits) {
    const beforeEdits = structuredClone(content)
    for (const [id, optionId] of Object.entries(output.propertyOptionEdits)) {
      const field = content.properties[id]
      if (!field || field.selection.definition.type !== 'classifier')
        throw new Error('This field is not a category')
      if (
        field.selection.definition.audience === 'internal' &&
        !input.allowedInternalIds.has(id)
      )
        throw new Error('This property is internal')
      const option =
        optionId === null
          ? null
          : await db
              .select()
              .from(propertyValue)
              .where(
                and(eq(propertyValue.id, optionId), eq(propertyValue.propertyId, id)),
              )
              .get()
      if (optionId !== null && !option)
        throw new Error('This option does not belong to this category')
      const translations = option
        ? await db
            .select()
            .from(propertyValueI18n)
            .where(eq(propertyValueI18n.propertyValueId, option.id))
            .all()
        : []
      field.selection = {
        ...field.selection,
        propertyValueId: option?.id ?? null,
        value: null,
        valueJson: null,
        definition: {
          ...field.selection.definition,
          selectedOption: option
            ? {
                id: option.id,
                value: option.value,
                translations: Object.fromEntries(
                  translations.map(row => [
                    row.locale,
                    { value: row.value, generated: Boolean(row.valueGen) },
                  ]),
                ),
              }
            : null,
        },
      }
      field.translations = {}
    }
    await validateFeatureFormPropertyValues(
      db,
      beforeEdits,
      content,
      input.allowedInternalIds,
      input.layerId,
    )
  }
  // Translated field edits retain their selected definition and pass the regular form validator.
  if (output.propertyTranslationEdits) {
    const beforeEdits = structuredClone(content)
    for (const [id, translations] of Object.entries(output.propertyTranslationEdits)) {
      const field = content.properties[id]
      if (
        !field?.selection.definition.isTranslatable ||
        field.selection.propertyValueId ||
        (content.placement.location &&
          field.selection.definition.component === 'PhoneField')
      )
        throw new Error('Edit this field through its regular editor')
      for (const [locale, value] of Object.entries(translations)) {
        if (!content.translations[locale] && !field.translations[locale])
          throw new Error('Unknown output language')
        field.translations[locale] = { value, generated: false }
      }
    }
    await validateFeatureFormPropertyValues(
      db,
      beforeEdits,
      content,
      input.allowedInternalIds,
      input.layerId,
    )
  }
  if (output.propertyEdits) {
    const beforeEdits = structuredClone(content)
    for (const [id, value] of Object.entries(output.propertyEdits)) {
      const field = content.properties[id]?.selection
      if (
        !field ||
        field.propertyValueId ||
        !['text', 'number', 'link', 'date'].includes(field.definition.dataType) ||
        (content.placement.location && field.definition.component === 'PhoneField')
      )
        throw new Error('Edit this field through its regular editor')
      field.value = value
    }
    await validateFeatureFormPropertyValues(
      db,
      beforeEdits,
      content,
      input.allowedInternalIds,
      input.layerId,
    )
  }
  // Default to the latest observation only when the reviewer did not choose a date.
  if (input.kind === 'merge' && output.profileEdits?.asOf === undefined) {
    const dates = [...sources.values()]
      .map(source => source.content.profile.visitability.asOf)
      .concat(content.profile.visitability.asOf)
      .filter((date): date is string => Boolean(date))
      .sort()
    content.profile.visitability.asOf =
      dates.at(-1) ?? content.profile.visitability.asOf
  }
  // Every new association receives its own attributable evidence version.
  if (
    content.placement.location &&
    featureId !== (output.placementSourceFeatureId ?? output.sourceFeatureId)
  ) {
    content.placement.location.associationVersion = crypto.randomUUID()
    for (const binding of content.placement.location.memberships)
      binding.bindingVersion = content.placement.location.associationVersion
  }
  return FeatureRevisionContentSchema.parse(content)
}
