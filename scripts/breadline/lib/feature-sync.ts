// BUN
import type { Database } from 'bun:sqlite'
// SYNC
import { userSyncHash, type Row } from './user-sync-contract'
import donorPolicy from '../donor-import-policy.json'

export type FeatureSource = {
  snapshotAt: string
  rows: Array<{
    table: 'donors' | 'dropoffs'
    id: string
    hash: string
    eligible: boolean
    source: Row
  }>
}
export type FeatureSourceChange = {
  table: 'donors' | 'dropoffs'
  id: string
  kind: 'new' | 'changed' | 'missing' | 'eligibility'
  fields: string[]
  before: FeatureSource['rows'][number] | null
  after: FeatureSource['rows'][number] | null
}

/** Read a complete place export, including raw run-based donor eligibility.
 * @param db Immutable mirror with completed table bookkeeping.
 * @returns Source rows and their consistent export timestamp.
 * @remarks A failed/partial pull cannot imply missing donors or lost eligibility.
 */
export function readFeatureSyncSource(db: Database): FeatureSource {
  const run = db
    .query('SELECT * FROM _breadline_sync_run ORDER BY startedAt DESC LIMIT 1')
    .get() as Row | null
  if (!run || run.status !== 'complete' || typeof run.sourceSnapshotAt !== 'string')
    throw new Error('Complete feature source snapshot required')
  for (const table of ['donors', 'dropoffs', 'runs']) {
    const state = db
      .query(
        "SELECT * FROM _breadline_sync_state WHERE sourceSchema='public' AND sourceTable=?",
      )
      .get(table) as Row | null
    const count = db
      .query(`SELECT count(*) n FROM breadline__public__${table}`)
      .get() as { n: number }
    if (
      !state ||
      ![
        'full-snapshot',
        'snapshot-replace',
        'incremental-upsert-with-key-reconciliation',
      ].includes(String(state.strategy)) ||
      state.sourceRows !== count.n ||
      state.localRows !== count.n ||
      String(state.syncedAt) < run.sourceSnapshotAt ||
      String(state.syncedAt) > String(run.completedAt)
    )
      throw new Error('Feature source coverage is incomplete')
  }
  const donors = new Set(
    (
      db.query('SELECT DISTINCT donor_id FROM breadline__public__runs').all() as Row[]
    ).map(r => String(r.donor_id)),
  )
  const rows: FeatureSource['rows'] = []
  for (const table of ['donors', 'dropoffs'] as const) {
    for (const row of db
      .query(`SELECT * FROM breadline__public__${table} ORDER BY id`)
      .all() as Row[]) {
      const source = Object.fromEntries(
        Object.entries(row).filter(([key]) => !key.startsWith('_breadline_')),
      )
      if (
        !Number.isSafeInteger(row.id) ||
        Number(row.id) <= 0 ||
        typeof row._breadline_row_hash !== 'string'
      )
        throw new Error('Invalid feature source identity')
      rows.push({
        table,
        id: String(row.id),
        hash: row._breadline_row_hash,
        eligible:
          table === 'dropoffs' ||
          (!(donorPolicy.excludedDonorIds as number[]).includes(Number(row.id)) &&
            (!donorPolicy.requireRecordedRun || donors.has(String(row.id)))),
        source,
      })
    }
  }
  return { snapshotAt: run.sourceSnapshotAt, rows }
}

/** Compare a fresh export with the last accepted export using stable source identities.
 * @param before Accepted source baseline, null only for the first import.
 * @param after Fully validated fresh source.
 * @returns Field-level additions, changes, absences and eligibility transitions.
 * @remarks Missing/excluded rows are review evidence, never instructions to delete Features.
 */
export function compareFeatureSources(
  before: FeatureSource | null,
  after: FeatureSource,
): FeatureSourceChange[] {
  if (before && after.snapshotAt < before.snapshotAt)
    throw new Error('Source predates accepted feature baseline')
  const key = (r: FeatureSource['rows'][number]): string => `${r.table}:${r.id}`
  const old = new Map((before?.rows ?? []).map(r => [key(r), r]))
  const changes: FeatureSourceChange[] = []
  const seen = new Set<string>()
  for (const row of after.rows) {
    if (seen.has(key(row))) throw new Error('Duplicate feature source identity')
    seen.add(key(row))
    const prior = old.get(key(row))
    const fields = prior
      ? [...new Set([...Object.keys(prior.source), ...Object.keys(row.source)])]
          .filter(
            k =>
              userSyncHash(prior.source[k] ?? null) !==
              userSyncHash(row.source[k] ?? null),
          )
          .sort()
      : []
    if (
      !prior ||
      fields.length ||
      prior.hash !== row.hash ||
      prior.eligible !== row.eligible
    )
      changes.push({
        table: row.table,
        id: row.id,
        kind: !prior
          ? 'new'
          : fields.length || prior.hash !== row.hash
            ? 'changed'
            : 'eligibility',
        fields,
        before: prior ?? null,
        after: row,
      })
    old.delete(key(row))
  }
  for (const row of old.values())
    changes.push({
      table: row.table,
      id: row.id,
      kind: 'missing',
      fields: [],
      before: row,
      after: null,
    })
  return changes
}

/** Three-way reconcile source-owned scalar fields while retaining downstream edits.
 * @param accepted Last accepted source projection.
 * @param incoming Newly transformed source projection.
 * @param current Current Hype projection.
 * @returns Safe merged projection and fields requiring explicit review.
 */
export function reconcileFeatureFields(
  accepted: Row,
  incoming: Row,
  current: Row,
): { merged: Row; conflicts: string[] } {
  const merged = { ...current },
    conflicts: string[] = []
  for (const key of Object.keys(incoming)) {
    if (userSyncHash(incoming[key]) === userSyncHash(accepted[key] ?? null)) continue
    if (userSyncHash(current[key] ?? null) === userSyncHash(incoming[key])) continue
    if (userSyncHash(current[key] ?? null) !== userSyncHash(accepted[key] ?? null))
      conflicts.push(key)
    else merged[key] = incoming[key]
  }
  return { merged, conflicts }
}
