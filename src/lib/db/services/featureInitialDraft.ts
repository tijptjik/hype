// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureRevision,
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import { readFeatureRevisionSource } from './featureRevisionSource'
import { buildFeatureFormCandidate } from './featureFormRevision'
import { featureContentProjectionMatches } from './featureRevisionProjection'
import { prepareRevisionChangeSet } from './featureRevision'
import { prepareFeatureIdleRevision } from './featureRevisionIdleWindow'
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { prepareUnlinkedFeatureFormSave } from './featureFormSave'
import type { RevisionCommand } from './featureRevision'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureRevisionSource } from './featureRevisionSource'

/**
 * Captures an approved domain change to a private initial contribution without publishing it.
 * @param db Request database.
 * @param input Trusted domain actor, scope and deterministic complete resulting content.
 * @returns The initial draft capture, or null when this is not an editable initial contribution.
 * @remarks Submission freezes the branch. Accepted Location/cascade operations keep their own
 * attribution; the contributor still submits the resulting complete Feature for initial review.
 */
export async function prepareInitialFeatureCapture(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    derive: (
      previous: FeatureRevisionContent,
      source: FeatureRevisionSource,
    ) => FeatureRevisionContent | Promise<FeatureRevisionContent>
  },
): Promise<{
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
  revisionId: string
} | null> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
  )
  if (!storage?.n) return null
  const row = await db.get<{
    proposalId: string
    candidateRevisionId: string
    content: string
  }>(sql`
    SELECT p.id proposalId,p.candidateRevisionId,r.content FROM featureInitialRevision i
    JOIN featureRevisionProposal p ON p.id=i.proposalId JOIN featureRevision r ON r.id=p.candidateRevisionId
    JOIN featureRevisionHead h ON h.featureId=i.featureId JOIN feature f ON f.id=i.featureId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND p.status='draft'
      AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL
      AND f.isPublished=0 AND f.isDraft=1 AND (${input.guard})`)
  if (!row) return null
  const previous = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
  if (!source) return null
  const content = FeatureRevisionContentSchema.parse(
    await input.derive(structuredClone(previous), source),
  )
  const idle = await prepareFeatureIdleRevision(db, {
    ...input,
    previousRevisionId: row.candidateRevisionId,
    previous,
    content,
  })
  const revisionId = idle.revisionId
  const scope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  return {
    revisionId,
    before: [
      prepareRevisionCheck(
        db,
        sql`(${source.unchanged}) AND (${featureContentProjectionMatches(input.featureId, previous)})
      AND EXISTS (SELECT 1 FROM featureRevisionProposal p JOIN featureRevisionHead h ON h.featureId=p.featureId
        WHERE p.id=${row.proposalId} AND p.status='draft' AND p.candidateRevisionId=${row.candidateRevisionId}
          AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL)`,
      ),
      ...scope.before,
    ],
    after: [
      prepareRevisionCheck(
        db,
        featureContentProjectionMatches(input.featureId, content),
      ),
      ...idle.write,
      db
        .update(featureRevisionProposal)
        .set({ candidateRevisionId: revisionId })
        .where(eq(featureRevisionProposal.id, row.proposalId)),
      ...(!idle.noop && !idle.reuse
        ? [
            db.insert(featureRevisionReview).values({
              id: crypto.randomUUID(),
              featureId: input.featureId,
              proposalId: row.proposalId,
              candidateRevisionId: revisionId,
              action: 'saved',
              changeSetId: idle.changeSetId!,
            }),
          ]
        : []),
      ...idle.finish,
      ...scope.after,
    ],
  }
}

/**
 * Prepares an attributed initial contribution draft save without granting public edit authority.
 * @param db Request database.
 * @param input Contributor-authorized private draft form and exact Feature timestamp.
 * @returns Scope and immutable revision statements surrounding the private form projection.
 * @remarks Only the original contributor's never-published initial proposal qualifies. Ordinary
 * staff drafts and published Feature proposals remain isolated from compatibility projections.
 */
export async function prepareInitialFeatureDraftSave(
  db: Database,
  input: Parameters<typeof prepareUnlinkedFeatureFormSave>[1],
): Promise<{
  guard: SQL
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
} | null> {
  if (!input.actorId || input.expectedDraftState !== true) return null
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
  )
  if (!storage?.n) return null
  const row = await db.get<{
    proposalId: string
    candidateRevisionId: string
    content: string
  }>(sql`
    SELECT p.id proposalId,p.candidateRevisionId,r.content FROM featureInitialRevision i
    JOIN featureRevisionProposal p ON p.id=i.proposalId AND p.featureId=i.featureId
    JOIN featureRevision r ON r.id=p.candidateRevisionId AND r.featureId=i.featureId
    JOIN featureRevisionHead h ON h.featureId=i.featureId JOIN feature f ON f.id=i.featureId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND p.status='draft'
      AND p.contributorId=${input.actorId} AND f.contributorId=${input.actorId}
      AND f.isDraft=1 AND f.isPublished=0 AND f.isArchived=0
      AND f.modifiedAt=${input.updatedAt} AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL`)
  if (!row) return null
  const previous = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  const guard = sql`EXISTS (SELECT 1 FROM featureRevisionHead h JOIN featureRevisionProposal p ON p.featureId=h.featureId
    JOIN feature f ON f.id=h.featureId WHERE h.featureId=${input.featureId} AND h.state='active'
      AND h.generation=0 AND h.publishedRevisionId IS NULL AND f.isDraft=1 AND f.isPublished=0
      AND f.isArchived=0 AND f.modifiedAt=${input.updatedAt} AND f.contributorId=${input.actorId}
      AND p.id=${row.proposalId} AND p.status='draft' AND p.candidateRevisionId=${row.candidateRevisionId}
      AND p.contributorId=${input.actorId})`
  const source = await readFeatureRevisionSource(
    db,
    input.featureId,
    guard,
    input.properties?.map(item => item.propertyId),
  )
  if (!source) return null
  const content = buildFeatureFormCandidate(previous, source.snapshot, {
    geometry: previous.placement.geometry,
    addressMeta: previous.placement.addressMeta,
    featureType: previous.profile.featureType ?? null,
    nameTemplate: previous.profile.nameTemplate ?? null,
    kind: previous.profile.kind ?? null,
    targetContext: previous.profile.targetContext ?? null,
    associationRelation: previous.profile.associationRelation ?? null,
    isIntangible: previous.profile.isIntangible,
    isVisitable: previous.profile.visitability.isVisitable,
    ...input.data,
    i18n: input.i18n,
    properties: input.properties ?? [],
  } as Parameters<typeof buildFeatureFormCandidate>[2])
  if (!input.properties) content.properties = structuredClone(previous.properties)
  const idle = await prepareFeatureIdleRevision(db, {
    featureId: input.featureId,
    actorId: input.actorId,
    reason: 'Initial contribution draft saved',
    guard,
    previousRevisionId: row.candidateRevisionId,
    previous,
    content,
  })
  const revisionId = idle.revisionId
  const scope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  return {
    guard,
    before: [
      prepareRevisionCheck(
        db,
        sql`(${source.unchanged}) AND (${featureContentProjectionMatches(input.featureId, previous)})`,
      ),
      ...scope.before,
    ],
    after: [
      prepareRevisionCheck(
        db,
        featureContentProjectionMatches(input.featureId, content),
      ),
      ...idle.write,
      db
        .update(featureRevisionProposal)
        .set({ candidateRevisionId: revisionId })
        .where(eq(featureRevisionProposal.id, row.proposalId)),
      ...(!idle.noop && !idle.reuse
        ? [
            db.insert(featureRevisionReview).values({
              id: crypto.randomUUID(),
              featureId: input.featureId,
              proposalId: row.proposalId,
              candidateRevisionId: revisionId,
              action: 'saved',
              changeSetId: idle.changeSetId!,
            }),
          ]
        : []),
      ...idle.finish,
      ...scope.after,
    ],
  }
}

/**
 * Submits the initial contribution's exact candidate in the caller's task-finalization transaction.
 * @param db Request database.
 * @param input Trusted contributor, target Feature and task/source scope.
 * @returns Unexecuted submission statements; legacy Features have no initial proposal.
 */
export async function prepareInitialFeatureSubmission(
  db: Database,
  input: { featureId: string; actorId: string; guard: SQL; taskId?: string },
): Promise<BatchItem<'sqlite'>[]> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
  )
  if (!storage?.n) return []
  const row = await db.get<{
    proposalId: string
    candidateRevisionId: string
    content: string
  }>(sql`SELECT p.id proposalId,p.candidateRevisionId,r.content
    FROM featureInitialRevision i JOIN featureRevisionProposal p ON p.id=i.proposalId JOIN featureRevision r ON r.id=p.candidateRevisionId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND p.contributorId=${input.actorId} AND p.status='draft'`)
  if (!row) return []
  const change = prepareRevisionChangeSet(db, {
    ...input,
    reason: 'Initial contribution submitted',
  })
  const statements: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionProposal p
    JOIN featureRevisionHead h ON h.featureId=p.featureId WHERE p.id=${row.proposalId} AND p.status='draft'
      AND p.candidateRevisionId=${row.candidateRevisionId} AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL)`,
    ),
    change.statement,
  ]
  // Initial review includes the exact photo evidence submitted with this new identity.
  if (input.taskId) {
    const uploads = await db.all<{
      proposalId: string
      candidateRevisionId: string
      imageId: string
      imageRevisionId: string
      content: string
    }>(sql`
      SELECT u.proposalId,p.candidateRevisionId,u.imageId,u.imageRevisionId,r.content
      FROM featureImageUploadRevision u JOIN featureRevisionProposal p ON p.id=u.proposalId
      JOIN featureRevision r ON r.id=p.candidateRevisionId
      WHERE u.featureId=${input.featureId} AND u.actorId=${input.actorId}
        AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId}) ORDER BY u.imageId`)
    const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
    for (const upload of uploads) {
      const entry = FeatureRevisionContentSchema.parse(JSON.parse(upload.content))
        .gallery.entries[upload.imageId]
      if (!entry || entry.imageRevisionId !== upload.imageRevisionId)
        throw new Error('Initial photo evidence changed')
      statements.push(
        prepareRevisionCheck(
          db,
          sql`EXISTS (SELECT 1 FROM featureRevisionProposal p
        JOIN taskImage ti ON ti.taskId=${input.taskId} AND ti.imageId=${upload.imageId}
        WHERE p.id=${upload.proposalId} AND p.featureId=${input.featureId} AND p.contributorId=${input.actorId}
          AND p.status='submitted' AND p.candidateRevisionId=${upload.candidateRevisionId})`,
        ),
      )
      if (!content.gallery.entries[upload.imageId])
        content.gallery.order.push(upload.imageId)
      content.gallery.entries[upload.imageId] = entry
    }
    if (uploads.length) {
      FeatureRevisionContentSchema.parse(content)
      const revisionId = crypto.randomUUID()
      statements.push(
        db.insert(featureRevision).values({
          id: revisionId,
          featureId: input.featureId,
          previousRevisionId: row.candidateRevisionId,
          changeSetId: change.id,
          content,
        }),
        db
          .update(featureRevisionProposal)
          .set({ candidateRevisionId: revisionId })
          .where(eq(featureRevisionProposal.id, row.proposalId)),
        db.insert(featureRevisionReview).values({
          id: crypto.randomUUID(),
          featureId: input.featureId,
          proposalId: row.proposalId,
          candidateRevisionId: revisionId,
          action: 'saved',
          changeSetId: change.id,
        }),
      )
      row.candidateRevisionId = revisionId
    }
  }
  statements.push(
    db
      .update(featureRevisionProposal)
      .set({ status: 'submitted' })
      .where(eq(featureRevisionProposal.id, row.proposalId)),
    db.insert(featureRevisionReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId: row.proposalId,
      candidateRevisionId: row.candidateRevisionId,
      action: 'submitted',
      changeSetId: change.id,
    }),
  )
  return statements
}
