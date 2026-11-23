// NODE
import { createHash } from 'node:crypto'
// SYNC
import {
  compareFeatureSources,
  reconcileFeatureFields,
  type FeatureSource,
} from './feature-sync'
import { userSyncHash, type Row, type UserSyncMutation } from './user-sync-contract'
import { guardedSyncRowStatements } from './user-sync-remote'
import { assertProductionFeatureAddress } from './production-address'
// TYPES
import type { Database } from 'bun:sqlite'
import type { D1Database } from '@cloudflare/workers-types'

export const FEATURE_SYNC_TABLES = [
  'feature',
  'featureI18n',
  'featureProperty',
  'place',
  'placeRevision',
  'featurePlace',
  'breadlineImportFeature',
] as const
export type FeatureProjection = Record<(typeof FEATURE_SYNC_TABLES)[number], Row[]>
export type FeatureSyncState = {
  version: 1
  targetIdentity: string
  source: FeatureSource
  projections: Record<string, FeatureProjection>
  planHash: string
}
export type FeatureSyncPlan = {
  version: 1
  targetIdentity: string
  previousPlanHash: string | null
  source: FeatureSource
  projections: Record<string, FeatureProjection>
  groups: Array<{ identity: string; mutations: UserSyncMutation[] }>
  exceptions: Array<{ identity: string; reason: string; fields?: string[] }>
  counts: { created: number; updated: number; unchanged: number; excluded: number }
}
const keys: Record<(typeof FEATURE_SYNC_TABLES)[number], string[]> = {
  feature: ['id'],
  featureI18n: ['featureId', 'locale'],
  featureProperty: ['featureId', 'propertyId'],
  place: ['id'],
  placeRevision: ['id'],
  featurePlace: ['featureId'],
  breadlineImportFeature: ['sourceTable', 'sourceId'],
}

/** Read only one mapped Feature and its local Place projection.
 * @param db Accepted target snapshot or isolated transformed snapshot.
 * @param table Source table namespace.
 * @param id Stable upstream identity.
 * @returns Materialized rows, or null if no crosswalk exists.
 */
export function readFeatureProjection(
  db: Database,
  table: string,
  id: string,
): FeatureProjection | null {
  const mapping = db
    .query('SELECT * FROM breadlineImportFeature WHERE sourceTable=? AND sourceId=?')
    .get(table, id) as Row | null
  if (!mapping) return null
  const featureId = String(mapping.featureId)
  const association = db
    .query('SELECT * FROM featurePlace WHERE featureId=?')
    .get(featureId) as Row | null
  if (!association) throw new Error('Mapped Feature has no Place association')
  return {
    feature: db.query('SELECT * FROM feature WHERE id=?').all(featureId) as Row[],
    featureI18n: db
      .query('SELECT * FROM featureI18n WHERE featureId=? ORDER BY locale')
      .all(featureId) as Row[],
    featureProperty: db
      .query('SELECT * FROM featureProperty WHERE featureId=? ORDER BY propertyId')
      .all(featureId) as Row[],
    place: db
      .query('SELECT * FROM place WHERE id=?')
      .all(String(association.placeId)) as Row[],
    placeRevision: db
      .query('SELECT * FROM placeRevision WHERE id IN (?,?) ORDER BY sequence')
      .all(
        String(association.factsRevisionId),
        String(association.locationRevisionId),
      ) as Row[],
    featurePlace: [association],
    breadlineImportFeature: [mapping],
  }
}

/** Plan production-compatible imports and three-way updates against an accepted target.
 * @param source Complete fresh export.
 * @param desired Isolated freshly transformed Features, never production.
 * @param target Accepted local Hype baseline; remote guards verify it before every write.
 * @param state Last accepted source/projection baseline.
 * @param targetIdentity Explicit configured production database identity.
 * @returns Reviewable per-Feature atomic groups and conflict evidence.
 * @remarks This adapter rejects post-Place schemas. Missing or newly excluded imported rows require review.
 */
export function planFeatureSync(
  source: FeatureSource,
  desired: Database,
  target: Database,
  state: FeatureSyncState | null,
  targetIdentity: string,
): FeatureSyncPlan {
  if (state && (state.version !== 1 || state.targetIdentity !== targetIdentity))
    throw new Error('Accepted feature target mismatch')
  if (target.query("SELECT 1 FROM sqlite_master WHERE name='location'").get())
    throw new Error('Use an attributed Location writer after migration')
  const changes = new Map(
    compareFeatureSources(state?.source ?? null, source).map(c => [
      `${c.table}:${c.id}`,
      c,
    ]),
  )
  const plan: FeatureSyncPlan = {
    version: 1,
    targetIdentity,
    previousPlanHash: state?.planHash ?? null,
    source,
    projections: { ...state?.projections },
    groups: [],
    exceptions: [],
    counts: { created: 0, updated: 0, unchanged: 0, excluded: 0 },
  }
  for (const change of changes.values())
    if (!change.after && change.before?.eligible)
      plan.exceptions.push({
        identity: `${change.table}:${change.id}`,
        reason: 'source_missing_no_automatic_deletion',
      })
  for (const row of source.rows) {
    const identity = `${row.table}:${row.id}`,
      prior = state?.projections[identity]
    const current = readFeatureProjection(target, row.table, row.id)
    if (!row.eligible) {
      plan.counts.excluded++
      if (current)
        plan.exceptions.push({ identity, reason: 'imported_feature_now_excluded' })
      continue
    }
    if (!changes.has(identity) && prior && current) {
      plan.counts.unchanged++
      continue
    }
    const incoming = readFeatureProjection(desired, row.table, row.id)
    if (!incoming || !incoming.feature.length)
      throw new Error('Desired feature projection missing')
    if (current && !prior) {
      plan.exceptions.push({
        identity,
        reason: 'existing_mapping_without_accepted_baseline',
      })
      continue
    }
    if (!current && prior) {
      plan.exceptions.push({ identity, reason: 'accepted_mapping_missing' })
      continue
    }
    const next = structuredClone(incoming)
    if (prior && current) {
      // Export timestamps and creation defaults are not upstream content changes.
      for (const table of FEATURE_SYNC_TABLES)
        for (const value of next[table]) {
          const old = prior[table].find(r => keys[table].every(k => r[k] === value[k]))
          if (old)
            for (const field of [
              'createdAt',
              'publishedAt',
              'importedAt',
              'visitableAsOf',
            ])
              if (field in old) value[field] = old[field]
        }
      // Place evidence is append-only: a changed export receives a deterministic successor.
      const revision = next.placeRevision[0]
      const previousRevision = current.placeRevision.find(
        r => r.id === current.featurePlace[0].factsRevisionId,
      )
      if (
        !previousRevision ||
        current.featurePlace[0].factsRevisionId !==
          current.featurePlace[0].locationRevisionId
      ) {
        plan.exceptions.push({
          identity,
          reason: 'split_place_revision_requires_review',
        })
        continue
      }
      const revisionId = createHash('sha256')
        .update(`${revision.placeId}:${row.hash}`)
        .digest('base64url')
        .slice(0, 12)
      revision.id = revisionId
      revision.sequence = Number(previousRevision.sequence) + 1
      next.featurePlace[0].factsRevisionId = revisionId
      next.featurePlace[0].locationRevisionId = revisionId
    }
    const mutations: UserSyncMutation[] = []
    for (const table of FEATURE_SYNC_TABLES)
      for (const after of next[table]) {
        const key = Object.fromEntries(keys[table].map(k => [k, after[k]]))
        const before =
          current?.[table].find(r => keys[table].every(k => r[k] === after[k])) ?? null
        let merged = after
        if (before && prior) {
          const accepted = prior[table].find(r =>
            keys[table].every(k => r[k] === after[k]),
          )
          if (!accepted) {
            plan.exceptions.push({ identity, reason: `untracked_target_row:${table}` })
            continue
          }
          const result = reconcileFeatureFields(accepted, after, before)
          if (result.conflicts.length)
            plan.exceptions.push({
              identity,
              reason: `concurrent_edit:${table}`,
              fields: result.conflicts,
            })
          merged = result.merged
          // Production invalidates geometry-derived projections when the point moves.
          // Keep the guarded after-image consistent with those database triggers.
          if (table === 'feature' && merged.geometry !== before.geometry) {
            for (const field of [
              'mtrStation',
              'mtrExit',
              'mtrDistance',
              'mtrResolution',
              'countryId',
              'areaId',
              'districtId',
              'townId',
              'ruralAreaId',
              'macrohoodId',
              'neighbourhoodId',
              'villageId',
              'microhoodId',
              'hamletId',
              'islandId',
              'divisionResolution',
            ]) {
              const reviewedMtr =
                merged.mtrResolution &&
                JSON.parse(String(merged.mtrResolution)).review?.policy ===
                  'breadline-donor-v1'
              if (field in merged && !(field.startsWith('mtr') && reviewedMtr))
                merged[field] = null
            }
          }
        }
        if (!before || userSyncHash(before) !== userSyncHash(merged))
          mutations.push({ table, key, before, after: merged })
      }
    plan.projections[identity] = next
    if (mutations.length) {
      plan.groups.push({ identity, mutations })
      current ? plan.counts.updated++ : plan.counts.created++
    } else plan.counts.unchanged++
  }
  return plan
}

/** Exclude independently computed geography from importer-owned row guards and writes.
 * @param mutation Reviewed source mutation.
 * @returns Mutation restricted to imported fields, preserving automatic enrichment.
 * @remarks Reviewed Breadline MTR fields remain owned; unreviewed MTR results and division
 * projections belong to background workers. Geometry triggers invalidate them on movement.
 */
export function featureSyncOwnedMutation(mutation: UserSyncMutation): UserSyncMutation {
  if (mutation.table !== 'feature') return mutation
  const excluded = new Set([
    'countryId',
    'areaId',
    'districtId',
    'townId',
    'ruralAreaId',
    'macrohoodId',
    'neighbourhoodId',
    'villageId',
    'microhoodId',
    'hamletId',
    'islandId',
    'divisionResolution',
  ])
  const reviewed = [mutation.before, mutation.after].some(
    row =>
      row?.mtrResolution &&
      JSON.parse(String(row.mtrResolution)).review?.policy === 'breadline-donor-v1',
  )
  if (!reviewed)
    for (const field of ['mtrStation', 'mtrExit', 'mtrDistance', 'mtrResolution'])
      excluded.add(field)
  const owned = (row: Row | null): Row | null =>
    row && Object.fromEntries(Object.entries(row).filter(([key]) => !excluded.has(key)))
  return { ...mutation, before: owned(mutation.before), after: owned(mutation.after) }
}

/** Apply one complete Feature with its immutable source evidence in a D1 transaction.
 * @param db Selected D1 binding or local D1 adapter.
 * @param group Reviewed group from a hash-pinned plan.
 * @returns Completion after guarded row changes and reviewed-MTR job cleanup.
 * @remarks Before-or-after guards make lost responses safely retryable. No unrelated records are deleted.
 */
export async function applyFeatureSyncGroup(
  db: D1Database,
  group: FeatureSyncPlan['groups'][number],
): Promise<void> {
  // Reject old hash-pinned plans before any statement can restore invalid addresses.
  for (const mutation of group.mutations)
    if (mutation.table === 'feature' && mutation.after?.addressMeta != null)
      assertProductionFeatureAddress(String(mutation.after.addressMeta))
  const statements = group.mutations.flatMap(m =>
    guardedSyncRowStatements(featureSyncOwnedMutation(m), FEATURE_SYNC_TABLES),
  )
  const feature = group.mutations.find(m => m.table === 'feature')?.after
  if (feature?.mtrResolution && JSON.parse(String(feature.mtrResolution)).review) {
    // A geometry trigger clears access; restore only the freshly source-bound review.
    statements.push({
      sql: `WITH incoming(value) AS (VALUES (?)) UPDATE feature SET
        mtrStation=json_extract((SELECT value FROM incoming),'$.mtrStation'),
        mtrExit=json_extract((SELECT value FROM incoming),'$.mtrExit'),
        mtrDistance=json_extract((SELECT value FROM incoming),'$.mtrDistance'),
        mtrResolution=json_extract((SELECT value FROM incoming),'$.mtrResolution')
        WHERE id=? AND geometry=? AND (mtrStation IS NOT ? OR mtrExit IS NOT ? OR mtrDistance IS NOT ? OR mtrResolution IS NOT ?)`,
      values: [
        JSON.stringify(feature),
        feature.id,
        feature.geometry,
        feature.mtrStation,
        feature.mtrExit,
        feature.mtrDistance,
        feature.mtrResolution,
      ],
    })
    statements.push({
      sql: 'DELETE FROM featureMtrJob WHERE featureId=? AND geometry=?',
      values: [feature.id, feature.geometry],
    })
  }
  await db.batch(statements.map(s => db.prepare(s.sql).bind(...s.values)))
}
