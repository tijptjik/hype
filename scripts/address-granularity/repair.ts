// NODE
import { createHash } from 'node:crypto'
// DATABASE
import { identifier, repairRows, type Query, type Row } from './database'

const columns: Record<string, string[]> = {
  placeRevision: ['payload', 'facts'],
  featurePlace: ['overrides'],
  featurePlaceHistory: ['overrides'],
  placeAdoptionProposal: ['evidence', 'factsDecision', 'locationDecision'],
  placeIdentityReview: ['baseline', 'projection', 'mergeReviews', 'rejection'],
  placeRefreshItem: ['projection', 'outcomes'],
  feature: ['addressMeta'],
  featureI18n: ['addressProperties'],
}

/** Rewrite only granularity values, never display strings or unit-type codes.
 * @param value JSON content. @returns Content using the canonical scope vocabulary.
 */
export function normalizeGranularity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeGranularity)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === 'granularity' && item === 'room'
        ? 'unit'
        : key === 'granularity' && item === 'room_part'
          ? 'unit_portion'
          : normalizeGranularity(item),
    ]),
  )
}
/** Stable source-revision serialization. @param value JSON value. @returns Canonical JSON. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`
}
/** Preserve each revision writer's original digest convention.
 * @param row Stored revision. @param next Normalized revision. @returns Recomputed SHA-256.
 */
export function revisionHash(row: Row, next: Row): string {
  const encoders = [
    (p: unknown, f: unknown) => JSON.stringify({ payload: p, facts: f }),
    (p: unknown, f: unknown) => JSON.stringify({ facts: f, payload: p }),
    (p: unknown) => JSON.stringify(p),
    (p: unknown, f: unknown) => canonical({ payload: p, facts: f }),
  ]
  const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
  const p = JSON.parse(String(row.payload)),
    f = JSON.parse(String(row.facts))
  const encoder = encoders.find(encode => hash(encode(p, f)) === row.contentHash)
  if (!encoder) throw new Error(`Unknown revision hash convention: ${row.id}`)
  return hash(encoder(JSON.parse(String(next.payload)), JSON.parse(String(next.facts))))
}

/** Normalize retained Place/address JSON using guarded, replayable data repairs.
 * @param query Transactional database. @param apply False reports without writing.
 * @returns Number of affected rows, grouped by table.
 * @remarks IDs, decisions, display strings and timestamps are retained. Historical
 * schema vocabulary is upgraded together with current projections and revision hashes.
 */
export async function repairGranularities(
  query: Query,
  apply: boolean,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  const [tables] = await query([
    { sql: "SELECT name FROM sqlite_schema WHERE type='table'" },
  ])
  const pending: { table: string; row: Row; changes: Row; fields: string[] }[] = []
  const hashes = new Map<string, string>()
  for (const [table, candidates] of Object.entries(columns)) {
    if (!tables.some(t => t.name === table)) continue
    const [info] = await query([{ sql: `PRAGMA table_info(${identifier(table)})` }])
    const fields = candidates.filter(c => info.some(i => i.name === c))
    if (!fields.length) continue
    const [rows] = await query([
      {
        sql: `SELECT * FROM ${identifier(table)} WHERE ${fields
          .map(
            field =>
              `EXISTS (SELECT 1 FROM json_tree(${identifier(field)}) j WHERE (j.key='granularity' AND j.value IN ('room','room_part')) OR (j.key='contentHash' AND j.value IN (SELECT value FROM json_each(?))))`,
          )
          .join(' OR ')}`,
        params: fields.map(() => JSON.stringify([...hashes.keys()])),
      },
    ])
    for (const row of rows) {
      const changes: Row = {}
      for (const field of fields) {
        if (row[field] == null) continue
        const before = JSON.parse(String(row[field]))
        const after = normalizeGranularity(before)
        if (JSON.stringify(before) !== JSON.stringify(after))
          changes[field] = JSON.stringify(after)
      }
      if (table === 'placeRevision' && Object.keys(changes).length) {
        changes.contentHash = revisionHash(row, { ...row, ...changes })
        hashes.set(String(row.contentHash), String(changes.contentHash))
      }
      pending.push({ table, row, changes, fields })
    }
  }
  // Identity review evidence must refer to the recomputed revision digests atomically.
  const replaceHashes = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replaceHashes)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'contentHash' && typeof item === 'string'
          ? (hashes.get(item) ?? item)
          : replaceHashes(item),
      ]),
    )
  }
  for (const item of pending) {
    for (const field of item.fields) {
      if (item.table === 'placeRevision' || item.row[field] == null) continue
      const original = item.changes[field] ?? item.row[field]
      const updated = replaceHashes(JSON.parse(String(original)))
      if (JSON.stringify(updated) !== JSON.stringify(JSON.parse(String(original))))
        item.changes[field] = JSON.stringify(updated)
    }
  }
  const repairs = pending.filter(p => Object.keys(p.changes).length)
  if (apply) await repairRows(query, repairs)
  for (const { table } of repairs) counts[table] = (counts[table] ?? 0) + 1
  return counts
}
