// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import {
  hasFeatureLifecycleStorage,
  readCurrentFeatureRevision,
} from './featureLifecycle'
import { readFeatureLifecycleHistory } from './featureLifecycleRead'
import { readFeatureBaselineActor } from './featureBaselineAttribution'
import { hasRevisionEditWindows, revisionActivityTime } from './revisionEditWindow'
import { privateFeatureComparison } from './featurePrivateCapture'
// DOMAIN
import {
  FeatureChangesSchema,
  applyFeatureChanges,
} from '#lib/revisions/featureChanges.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { validateFeatureTranslationResult } from '#lib/revisions/featureTranslationReview.js'
// TYPES
import type { FeatureBaselineActor } from '#lib/revisions/changelog.js'
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

export type FeatureTranslationView = Record<
  string,
  { title: string; description: string | null }
>
export type FeatureRevisionWorkspace = {
  enabled: boolean
  state: 'active' | 'merged' | 'split' | null
  redirectFeatureId: string | null
  publishedRevisionId: string | null
  comparisonRevisionId: string | null
  generation: number
  initialContribution: boolean
  initialTaskId: string | null
  translations: FeatureTranslationView
  proposals: {
    id: string
    candidateRevisionId: string
    baseRevisionId: string
    contributorId: string
    status: string
    own: boolean
    translationOnly: boolean
    before: FeatureTranslationView
    after: FeatureTranslationView
  }[]
  history: {
    baselineActor?: FeatureBaselineActor | null
    revisionId: string | null
    generation: number
    actorId: string
    actorName?: string | null
    actorUsername?: string | null
    actorDisplayUsername?: string | null
    origin: string
    reason: string | null
    createdAt: string
  }[]
  privateHistory: {
    revisionId: string
    actorId: string
    actorName?: string | null
    actorUsername?: string | null
    actorDisplayUsername?: string | null
    origin: string
    reason: string | null
    createdAt: string
  }[]
}

/**
 * Projects only title/description text from private immutable content.
 * @param content Validated server snapshot.
 * @returns Translation editor values with no internal properties, addresses or gallery data.
 */
function translationView(content: FeatureRevisionContent): FeatureTranslationView {
  return Object.fromEntries(
    Object.entries(content.translations).map(([locale, row]) => [
      locale,
      {
        title: row.title.value,
        description: row.description.value,
      },
    ]),
  )
}

/**
 * Reads a bounded translation workspace under the caller's current editing/review scope.
 * @param db Request database.
 * @param input Authorized Feature scope, actor and publication-review permission.
 * @returns Safe text-only proposals and publication attribution; no complete snapshots cross the API.
 * @remarks A missing head means the legacy Feature is not enrolled. History is limited to
 * the latest 50 publications and proposals; private drafts belong only to their author.
 */
export async function readFeatureRevisionWorkspace(
  db: Database,
  input: { featureId: string; actorId: string; canPublish: boolean; guard: SQL },
): Promise<FeatureRevisionWorkspace> {
  const empty: FeatureRevisionWorkspace = {
    enabled: false,
    state: null,
    redirectFeatureId: null,
    publishedRevisionId: null,
    comparisonRevisionId: null,
    generation: 0,
    initialContribution: false,
    initialTaskId: null,
    translations: {},
    proposals: [],
    history: [],
    privateHistory: [],
  }
  if (await hasFeatureLifecycleStorage(db))
    return readCurrentWorkspace(db, input, empty)
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='featureRevisionHead'`,
  )
  if (!storage?.n) return empty
  const idleWindows = await hasRevisionEditWindows(db)
  const privateComparison = await privateFeatureComparison(
    db,
    sql`h.featureId`,
    sql`h.generation`,
  )
  const head = await db.get<{
    state: 'active' | 'merged' | 'split'
    redirectFeatureId: string | null
    publishedRevisionId: string | null
    generation: number
    comparisonRevisionId: string | null
  }>(sql`
    SELECT h.state,h.redirectFeatureId,h.publishedRevisionId,h.generation,COALESCE(h.publishedRevisionId,${privateComparison},p.previousRevisionId,
      (SELECT r.id FROM featureRevision r JOIN featureRevisionPublication initial
        ON initial.featureId=r.featureId AND initial.changeSetId=r.changeSetId AND initial.generation=0
        WHERE r.featureId=h.featureId AND r.previousRevisionId IS NULL)) AS comparisonRevisionId
    FROM featureRevisionHead h LEFT JOIN featureRevisionPublication p ON p.featureId=h.featureId AND p.generation=h.generation
    WHERE h.featureId=${input.featureId} AND (${input.guard})`)
  if (!head?.comparisonRevisionId) return empty
  const comparison = await db.get<{
    content: string
  }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${head.comparisonRevisionId} AND (${input.guard})`)
  const parsed = FeatureRevisionContentSchema.safeParse(
    comparison && JSON.parse(comparison.content),
  )
  if (!parsed.success) return empty
  const rows = await db.all<{
    id: string
    candidateRevisionId: string
    baseRevisionId: string
    contributorId: string
    status: string
    before: string
    after: string
  }>(sql`
    SELECT p.id,p.candidateRevisionId,p.baseRevisionId,p.contributorId,p.status,b.content AS before,c.content AS after
    FROM featureRevisionProposal p JOIN featureRevision b ON b.id=p.baseRevisionId
    JOIN featureRevision c ON c.id=p.candidateRevisionId
    JOIN revisionChangeSet cs ON cs.id=p.createdChangeSetId
    WHERE p.featureId=${input.featureId} AND (${input.guard})
      AND (p.contributorId=${input.actorId} OR (${Number(input.canPublish)} AND p.status='submitted'))
    ORDER BY cs.createdAt DESC,p.id DESC LIMIT 50`)
  const proposals: FeatureRevisionWorkspace['proposals'] = []
  for (const row of rows) {
    const before = FeatureRevisionContentSchema.safeParse(JSON.parse(row.before))
    const after = FeatureRevisionContentSchema.safeParse(JSON.parse(row.after))
    if (!before.success || !after.success) continue
    proposals.push({
      id: row.id,
      candidateRevisionId: row.candidateRevisionId,
      baseRevisionId: row.baseRevisionId,
      contributorId: row.contributorId,
      status: row.status,
      own: row.contributorId === input.actorId,
      translationOnly: !validateFeatureTranslationResult(before.data, after.data, [
        'title',
        'description',
      ]).length,
      before: translationView(before.data),
      after: translationView(after.data),
    })
  }
  const history = await db.all<
    FeatureRevisionWorkspace['history'][number] & { publicationId: string }
  >(sql`
    SELECT p.id AS publicationId,p.revisionId,p.generation,cs.actorId,u.name actorName,NULLIF(u.username,'') actorUsername,NULLIF(u.displayUsername,'') actorDisplayUsername,cs.origin,cs.reason,${revisionActivityTime(idleWindows, 'feature', sql`p.revisionId`, sql`cs.createdAt`)} createdAt
    FROM featureRevisionPublication p JOIN revisionChangeSet cs ON cs.id=p.changeSetId LEFT JOIN user u ON u.id=cs.actorId
    WHERE p.featureId=${input.featureId} AND (${input.guard}) ORDER BY p.generation DESC LIMIT 50`)
  for (const entry of history) {
    if (entry.generation === 0 && entry.origin === 'migration')
      entry.baselineActor = await readFeatureBaselineActor(db, entry.publicationId)
  }
  const initialStorage =
    head.generation === 0 &&
    (await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
    ))
  const privateStorage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featurePrivateCapture' AND type='table'`,
  )
  const privateHistory =
    input.canPublish && privateStorage?.n
      ? await db.all<FeatureRevisionWorkspace['privateHistory'][number]>(sql`
    SELECT r.id revisionId,c.actorId,u.name actorName,NULLIF(u.username,'') actorUsername,NULLIF(u.displayUsername,'') actorDisplayUsername,c.origin,c.reason,${revisionActivityTime(idleWindows, 'feature', sql`r.id`, sql`c.createdAt`)} createdAt FROM featurePrivateCapture capture
    JOIN featureRevision r ON r.id=capture.revisionId AND r.featureId=capture.featureId JOIN revisionChangeSet c ON c.id=r.changeSetId LEFT JOIN user u ON u.id=c.actorId
    WHERE capture.featureId=${input.featureId} AND (${input.guard}) ORDER BY capture.sequence DESC LIMIT 50`)
      : []
  const initial =
    initialStorage && initialStorage.n
      ? await db.get<{ taskId: string | null }>(sql`
    SELECT (SELECT id FROM task WHERE featureId=i.featureId AND type='newFeature' AND isReviewed=0 ORDER BY id LIMIT 1) taskId
    FROM featureInitialRevision i WHERE i.featureId=${input.featureId} AND i.mode='contribution' AND (${input.guard})`)
      : null
  return {
    ...head,
    enabled: true,
    initialContribution: Boolean(initial),
    initialTaskId: initial?.taskId ?? null,
    translations: translationView(parsed.data),
    proposals,
    history,
    privateHistory,
  }
}

/** Project the sole accepted history into the editor's existing text-only response contract.
 * @param db Request database. @param input Current editor/reviewer scope. @param empty Disabled workspace value.
 * @returns Current text and visible partial proposals with opaque version tokens.
 * @remarks The existing candidateRevisionId response field carries a proposal version during API cutover; no candidate Feature revision is created.
 */
async function readCurrentWorkspace(
  db: Database,
  input: { featureId: string; actorId: string; canPublish: boolean; guard: SQL },
  empty: FeatureRevisionWorkspace,
): Promise<FeatureRevisionWorkspace> {
  const current = await readCurrentFeatureRevision(db, input)
  if (!current) return empty
  const retirement = current.retired
    ? await db.get<{ kind: 'merge' | 'split'; redirectFeatureId: string | null }>(sql`
    SELECT o.kind,json_extract(o.dispositions,'$.redirectFeatureId') redirectFeatureId FROM featureIdentityOperation o
    JOIN featureIdentityOperationMember i ON i.operationId=o.id AND i.role='input' AND i.featureId=${input.featureId}
    WHERE NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember output WHERE output.operationId=o.id AND output.role='output' AND output.featureId=i.featureId)`)
    : null
  const rows = await db.all<{
    id: string
    version: string
    baseRevisionId: string
    contributorId: string
    status: string
    changes: string
    base: string
  }>(sql`
    SELECT p.id,p.version,p.baseRevisionId,p.contributorId,p.status,p.changes,r.content base
    FROM featureRevisionProposal p JOIN featureRevision r ON r.id=p.baseRevisionId AND r.featureId=p.featureId
    JOIN revisionChangeSet c ON c.id=p.createdChangeSetId WHERE p.featureId=${input.featureId} AND p.kind='update' AND (${input.guard})
      AND (p.contributorId=${input.actorId} OR (${Number(input.canPublish)} AND p.status='submitted'))
    ORDER BY c.createdAt DESC,p.id DESC LIMIT 50`)
  const proposals: FeatureRevisionWorkspace['proposals'] = []
  for (const row of rows) {
    const before = FeatureRevisionContentSchema.parse(JSON.parse(row.base))
    const after = applyFeatureChanges(
      before,
      before,
      FeatureChangesSchema.parse(JSON.parse(row.changes)),
    )
    if (after.status !== 'ready')
      throw new Error('Stored proposal cannot be applied to its base')
    proposals.push({
      id: row.id,
      candidateRevisionId: row.version,
      baseRevisionId: row.baseRevisionId,
      contributorId: row.contributorId,
      status: row.status,
      own: row.contributorId === input.actorId,
      translationOnly: !validateFeatureTranslationResult(before, after.content, [
        'title',
        'description',
      ]).length,
      before: translationView(before),
      after: translationView(after.content),
    })
  }
  const history = await readFeatureLifecycleHistory(db, input)
  return {
    ...empty,
    enabled: true,
    state: retirement?.kind === 'merge' ? 'merged' : retirement ? 'split' : 'active',
    redirectFeatureId: retirement?.redirectFeatureId ?? null,
    publishedRevisionId: current.state.isPublished ? current.revisionId : null,
    comparisonRevisionId: current.revisionId,
    generation: current.version,
    translations: translationView(current.content),
    proposals,
    history: history.map(({ version, state, ...entry }) => ({
      ...entry,
      generation: version,
    })),
    privateHistory: [],
  }
}
