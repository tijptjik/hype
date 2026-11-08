// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureRevision,
  featureRevisionHead,
  featureRevisionPublication,
} from '../schema/featureRevision'
import { feature } from '../schema/feature'
import { featurePrivateCapture } from '../schema/featurePrivateCapture'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import { hasFeatureLifecycleStorage, prepareLifecycleCapture } from './featureLifecycle'
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { prepareFeatureIdleRevision } from './featureRevisionIdleWindow'
import { prepareRevisionCheck } from './revisionBatch'
import { readFeatureRevisionSource } from './featureRevisionSource'
import { featureContentProjectionMatches } from './featureRevisionProjection'
import { parseFeatureRevisionSource } from './featureRevisionContent'
import { prepareInitialFeatureCapture } from './featureInitialDraft'
import { privateFeatureComparison } from './featurePrivateCapture'
import { featureLayerAfterStatus } from './historicalLayers'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureRevisionSource } from './featureRevisionSource'
import type { RevisionCommand } from './featureRevision'

/**
 * Composes attributed revision capture around a domain's already-approved atomic projection.
 * @param db Request database.
 * @param input Trusted actor, policy/scope guard and deterministic complete resulting content.
 * @returns Statements to surround the existing mutation in ONE batch, and the accepted revision ID.
 * @remarks Never publishes a previously unpublished head. Visibility changes only for an
 * explicit unpublish decision, recorded after the accepted content in the same batch. Legacy
 * unenrolled Features retain their old path. Enrolled projection drift and unsupported content
 * fail closed. This is for approved automation/cascades, never an unreviewed contributor edit.
 */
export async function prepareFeatureAcceptedCapture(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    /** Server-authorized destination for an atomic parent transfer. */
    resultingScope?: { organisationId: string; projectId: string; layerId: string }
    unpublish?: boolean
    derive: (
      previous: FeatureRevisionContent,
      source: FeatureRevisionSource,
    ) => Promise<FeatureRevisionContent> | FeatureRevisionContent
  },
): Promise<{
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
  revisionId: string | null
}> {
  if (await hasFeatureLifecycleStorage(db)) return prepareLifecycleCapture(db, input)
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`,
  )
  if (!storage?.n) return { before: [], after: [], revisionId: null }
  const head = await db
    .select()
    .from(featureRevisionHead)
    .where(eq(featureRevisionHead.featureId, input.featureId))
    .get()
  if (!head)
    return {
      before: [
        prepareRevisionCheck(
          db,
          sql`NOT EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId})`,
        ),
      ],
      after: [],
      revisionId: null,
    }
  if (
    head.state === 'active' &&
    !head.publishedRevisionId &&
    head.generation === 0 &&
    !input.unpublish
  ) {
    const initial = await prepareInitialFeatureCapture(db, input)
    if (initial) return initial
  }
  if (head.state !== 'active')
    throw new Error('Retired Features cannot receive content changes')
  const isPrivate = head.publishedRevisionId === null
  let comparisonId = head.publishedRevisionId
  const privateComparison = await privateFeatureComparison(
    db,
    sql`${input.featureId}`,
    sql`${head.generation}`,
  )
  const privateToken = isPrivate
    ? await db.get<{ id: string | null }>(sql`SELECT ${privateComparison} id`)
    : null
  if (isPrivate) {
    const storage = await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featurePrivateCapture' AND type='table'`,
    )
    if (!storage?.n)
      throw new Error('Unpublished Feature capture requires its migration')
    const initialStorage = await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
    )
    // The initial marker is retained as provenance after acceptance; only unresolved contributions stay frozen.
    if (
      initialStorage?.n &&
      (await db.get(sql`SELECT 1 FROM featureInitialRevision i
      WHERE i.featureId=${input.featureId} AND i.mode='contribution'
        AND NOT EXISTS (SELECT 1 FROM featureRevisionProposal p WHERE p.id=i.proposalId AND p.status='accepted')`))
    )
      throw new Error('Submitted initial contributions are frozen for task review')
    const reservedStorage = await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featureIdentityReservation' AND type='table'`,
    )
    if (
      reservedStorage?.n &&
      (await db.get(sql`SELECT 1 FROM featureIdentityReservation r WHERE r.featureId=${input.featureId}
      AND NOT EXISTS (SELECT 1 FROM featureIdentityProposalDecision d WHERE d.proposalId=r.proposalId AND d.outcome='accepted')`))
    )
      throw new Error('Reserved identity outputs are frozen for review')
    // Private edit generations need not have a publication receipt; resolve each fallback independently.
    const row = await db.get<{
      id: string | null
    }>(sql`SELECT COALESCE(${privateComparison},
      (SELECT p.previousRevisionId FROM featureRevisionPublication p
        WHERE p.featureId=${input.featureId} AND p.generation=${head.generation}),
      (SELECT r.id FROM featureRevision r JOIN featureRevisionPublication baseline
        ON baseline.featureId=r.featureId AND baseline.changeSetId=r.changeSetId AND baseline.generation=0
        WHERE r.featureId=${input.featureId} AND r.previousRevisionId IS NULL)) id`)
    comparisonId = row?.id ?? null
  }
  if (!comparisonId) throw new Error('Feature comparison revision is unavailable')
  const row = await db
    .select()
    .from(featureRevision)
    .where(eq(featureRevision.id, comparisonId))
    .get()
  if (!row) throw new Error('Accepted Feature revision is unavailable')
  const previous = FeatureRevisionContentSchema.parse(row.content)
  const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
  if (!source) throw new Error('Feature revision scope changed')
  const content = FeatureRevisionContentSchema.parse(
    await input.derive(structuredClone(previous), source),
  )
  const record = parseFeatureRevisionSource(source.snapshot).record
  const resultingLayer = input.resultingScope
    ? featureLayerAfterStatus(input.resultingScope.layerId, content.profile.isIntangible)
    : previous.profile.isIntangible === content.profile.isIntangible
      ? sql`${record.layerId}`
      : featureLayerAfterStatus(String(record.layerId), content.profile.isIntangible)
  const retainedScope = sql`EXISTS (SELECT 1 FROM feature WHERE id=${input.featureId}
    AND organisationId IS ${input.resultingScope?.organisationId ?? record.organisationId} AND projectId IS ${input.resultingScope?.projectId ?? record.projectId} AND layerId IS ${resultingLayer})`
  const idle = await prepareFeatureIdleRevision(db, {
    ...input,
    previousRevisionId: comparisonId,
    previous,
    content,
    boundary: Boolean(input.unpublish),
  })
  const id = idle.revisionId
  const writeScope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  const before = [
    ...writeScope.before,
    prepareRevisionCheck(
      db,
      sql`(${source.unchanged}) AND (${isPrivate ? sql`${privateComparison} IS ${privateToken?.id ?? null}` : sql`1`})
    AND (${featureContentProjectionMatches(input.featureId, previous)})
    AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId}
      AND state='active' AND publishedRevisionId IS ${head.publishedRevisionId} AND generation=${head.generation})`,
    ),
  ]
  // The domain projection and its revision must either both commit or both roll back.
  const after: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`(${retainedScope}) AND (${featureContentProjectionMatches(input.featureId, content)})`,
    ),
    ...idle.write,
    ...(idle.noop
      ? []
      : isPrivate
        ? idle.reuse
          ? [
              db
                .update(featureRevisionHead)
                .set({ generation: head.generation + 1 })
                .where(eq(featureRevisionHead.featureId, input.featureId)),
              db
                .update(featurePrivateCapture)
                .set({ generation: head.generation + 1 })
                .where(eq(featurePrivateCapture.revisionId, id)),
            ]
          : [
              db.insert(featurePrivateCapture).values({
                featureId: input.featureId,
                revisionId: id,
                generation: head.generation,
              }),
            ]
        : [
            db
              .update(featureRevisionHead)
              .set({ publishedRevisionId: id, generation: head.generation + 1 })
              .where(eq(featureRevisionHead.featureId, input.featureId)),
            ...(idle.reuse
              ? [
                  db
                    .update(featureRevisionPublication)
                    .set({ generation: head.generation + 1 })
                    .where(
                      sql`${featureRevisionPublication.featureId}=${input.featureId} AND ${featureRevisionPublication.generation}=${head.generation}`,
                    ),
                ]
              : [
                  db.insert(featureRevisionPublication).values({
                    id: crypto.randomUUID(),
                    featureId: input.featureId,
                    previousRevisionId: head.publishedRevisionId,
                    revisionId: id,
                    generation: head.generation + 1,
                    changeSetId: idle.changeSetId!,
                  }),
                ]),
          ]),
  ]
  // A missing-report decision may change content and immediately withdraw it in the same transaction.
  if (input.unpublish && !isPrivate)
    after.push(
      db
        .update(feature)
        .set({ isPublished: false, localIsPublished: false })
        .where(eq(feature.id, input.featureId)),
      db
        .update(featureRevisionHead)
        .set({ publishedRevisionId: null, generation: head.generation + 2 })
        .where(eq(featureRevisionHead.featureId, input.featureId)),
      db.insert(featureRevisionPublication).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        previousRevisionId: id,
        revisionId: null,
        generation: head.generation + 2,
        changeSetId: idle.changeSetId!,
      }),
    )
  after.push(...idle.finish, ...writeScope.after)
  return { before, after, revisionId: id }
}
