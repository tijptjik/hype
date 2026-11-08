// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '../schema/property'
import { featureInitialRevision } from '../schema/featureInitialRevision'
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { rowSnapshot } from './revisionSnapshot'
import { buildFeatureRevisionBaselineContent } from './featureRevisionContent'
import { buildFeatureFormCandidate } from './featureFormRevision'
import { featureContentProjectionMatches } from './featureRevisionProjection'
import {
  prepareFeatureRevisionInitialization,
  prepareFeatureRevisionProposal,
  prepareRevisionChangeSet,
} from './featureRevision'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
import type {
  FeatureDBNew,
  FeatureI18nPartial,
  NewFeatureProperty,
} from '../zod/schema/feature.types'

/**
 * Checks the explicit creation cutover policy without enrolling legacy Features.
 * @param db Request database.
 * @returns Whether new identities must atomically initialize immutable content.
 */
export async function featureRevisionCreationEnabled(db: Database): Promise<boolean> {
  if (await hasFeatureLifecycleStorage(db)) return true
  const table = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='featureRevisionCreationPolicy'`,
  )
  return Boolean(
    table?.n &&
      (
        await db.get<{ enabled: number }>(
          sql`SELECT enabled FROM featureRevisionCreationPolicy WHERE singleton=1`,
        )
      )?.enabled,
  )
}

/**
 * Builds initialization from validated creation input and exact current catalogue definitions.
 * @param db Request database.
 * @param input Creation values with explicit authored defaults and trusted actor/mode.
 * @returns Statements following the parent/relations in the SAME creation batch.
 * @remarks No provisional identity is inserted during preparation. Catalogue races and late
 * revision failures roll back the complete creation. Initial photos arrive as separate proposals.
 */
export async function prepareFeatureCreationRevision(
  db: Database,
  input: {
    id: string
    data: FeatureDBNew
    i18n: Record<string, FeatureI18nPartial>
    properties: NewFeatureProperty[]
    actorId: string
    mode: 'staff' | 'contribution'
    guard: SQL
  },
): Promise<BatchItem<'sqlite'>[]> {
  if (input.mode === 'contribution' && (await hasFeatureLifecycleStorage(db)))
    throw new Error(
      'New contributions must use a creation proposal, without inserting a provisional Feature',
    )
  const { content, checks } = await prepareFeatureCreationContent(db, input)
  const baseline = await prepareFeatureRevisionInitialization(db, {
    featureId: input.id,
    actorId: input.actorId,
    guard: sql`(${input.guard}) AND (${featureContentProjectionMatches(input.id, content)})`,
    content,
    published: false,
  })
  // Staff-created records begin as accepted private content, with no review proposal.
  if (input.mode === 'staff')
    return [...checks, prepareRevisionCheck(db, baseline.guard), ...baseline.statements]
  const proposal = await prepareFeatureRevisionProposal(db, {
    featureId: input.id,
    actorId: input.actorId,
    guard: input.guard,
    baseRevisionId: baseline.revisionId,
    content,
  })
  const submission: BatchItem<'sqlite'>[] = []
  if (input.mode === 'contribution' && !input.data.isDraft) {
    const change = prepareRevisionChangeSet(db, {
      actorId: input.actorId,
      reason: 'Initial contribution submitted',
    })
    submission.push(
      change.statement,
      db
        .update(featureRevisionProposal)
        .set({ status: 'submitted' })
        .where(eq(featureRevisionProposal.id, proposal.proposalId)),
      db.insert(featureRevisionReview).values({
        id: crypto.randomUUID(),
        featureId: input.id,
        proposalId: proposal.proposalId,
        candidateRevisionId: proposal.candidateRevisionId,
        action: 'submitted',
        changeSetId: change.id,
      }),
    )
  }
  return [
    ...checks,
    prepareRevisionCheck(db, baseline.guard),
    ...baseline.statements,
    prepareRevisionCheck(db, proposal.guard),
    ...proposal.statements,
    db.insert(featureInitialRevision).values({
      featureId: input.id,
      proposalId: proposal.proposalId,
      mode: input.mode,
    }),
    ...submission,
  ]
}

/** Build validated creation content and catalogue guards without inserting a Feature identity.
 * @param db Request database. @param input Validated authoring payload and an ephemeral source key.
 * @returns Immutable-content shape plus checks for the caller's atomic transaction.
 * @remarks Creation proposals use this same field/catalogue validation as staff creation.
 */
export async function prepareFeatureCreationContent(
  db: Database,
  input: {
    id: string
    data: FeatureDBNew
    i18n: Record<string, FeatureI18nPartial>
    properties: NewFeatureProperty[]
  },
): Promise<{
  content: import('#lib/revisions/featureContent.js').FeatureRevisionContent
  checks: BatchItem<'sqlite'>[]
}> {
  const ids = JSON.stringify(input.properties.map(row => row.propertyId))
  const predicates = [
    sql`id IN (SELECT value FROM json_each(${ids}))`,
    sql`propertyId IN (SELECT value FROM json_each(${ids}))`,
    sql`propertyId IN (SELECT value FROM json_each(${ids}))`,
    sql`propertyValueId IN (SELECT id FROM propertyValue WHERE propertyId IN (SELECT value FROM json_each(${ids})))`,
  ]
  const tables: SQLiteTable[] = [
    property,
    propertyI18n,
    propertyValue,
    propertyValueI18n,
  ]
  const keys = [
    'fieldDefinitions',
    'fieldTranslations',
    'fieldOptions',
    'fieldOptionTranslations',
  ]
  const source: Record<string, RevisionValue> = {
    record: {
      id: input.id,
      geometry: input.data.geometry as unknown as RevisionValue,
      addressMeta: (input.data.addressMeta ?? {}) as RevisionValue,
      isIntangible: input.data.isIntangible ?? false,
      isVisitable: input.data.isVisitable ?? true,
      visitableAsOf: input.data.visitableAsOf ?? null,
      localLocationBrands: (input.data.localLocationBrands ?? null) as RevisionValue,
    },
    translations: [],
    properties: [],
    propertyTranslations: [],
    location: [],
    locationMemberships: [],
    galleryLinks: [],
    images: [],
  }
  const checks: BatchItem<'sqlite'>[] = []
  // One JSON binding per row set keeps preparation bounded even for large field catalogues.
  for (const [index, table] of tables.entries()) {
    const expression = sql`(SELECT json_group_array(json(row)) FROM (SELECT ${rowSnapshot(table, [])} row FROM ${table} WHERE ${predicates[index]} ORDER BY row))`
    const result = await db.get<{ rows: string }>(sql`SELECT ${expression} rows`)
    if (!result) throw new Error('Feature creation catalogue unavailable')
    source[keys[index]] = JSON.parse(result.rows)
    checks.push(prepareRevisionCheck(db, sql`${expression}=${result.rows}`))
  }
  const previous = buildFeatureRevisionBaselineContent(source, {
    revisions: {},
    order: [],
  })
  const content = buildFeatureFormCandidate(previous, source, {
    ...input.data,
    i18n: input.i18n,
    properties: input.properties,
  } as Parameters<typeof buildFeatureFormCandidate>[2])
  return { content, checks }
}
