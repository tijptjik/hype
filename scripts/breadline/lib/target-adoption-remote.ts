// SQLITE
import type { Database } from 'bun:sqlite'
// NODE
import { createHash } from 'node:crypto'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

// +++ Table Of Contents
// 1. PROJECTED BEFORE AND AFTER EVIDENCE
// 2. ATOMIC REMOTE APPLICATION
// ---

type Row = Record<string, string | number | null>
export type AdoptionSnapshot = {
  table: string
  columns: string[]
  fields: string[]
  rows: Row[]
}
export type AdoptionStatement = { sql: string; params: Array<string | number | null> }
export type RemoteAdoptionPlan = {
  version: 1
  targetIdentity: string
  reviewHash: string
  ids: string[]
  before: AdoptionStatement[]
  writes: AdoptionStatement[]
  after: AdoptionStatement[]
  changes: Array<{ table: string; inserted: number; updated: number; deleted: number }>
}
const opaque: Record<string, string[]> = {
  account: ['password', 'accessToken', 'refreshToken', 'idToken'],
  session: ['token', 'ipAddress', 'userAgent'],
  passkey: ['publicKey'],
}

/** Hash a private operational plan without exposing its contents.
 * @param plan Reviewed adoption plan.
 * @returns Stable digest used by both Bun rehearsal and the Node production writer.
 */
export function remoteAdoptionHash(plan: RemoteAdoptionPlan): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

/** Quote only schema-derived identifiers.
 * @param value SQLite identifier.
 * @returns Quoted identifier, rejecting SQL fragments.
 */
function quote(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw new Error('Invalid adoption identifier')
  return `"${value}"`
}

/** Balance predicates so wide production tables stay within D1 expression depth limits.
 * @param parts SQL predicates generated from schema columns.
 * @param operator Boolean conjunction.
 * @returns A balanced expression tree rather than a linear chain.
 */
function combine(parts: string[], operator: 'AND' | 'OR'): string {
  if (!parts.length) return operator === 'AND' ? '1' : '0'
  if (parts.length === 1) return parts[0]
  const middle = Math.floor(parts.length / 2)
  return `(${combine(parts.slice(0, middle), operator)} ${operator} ${combine(parts.slice(middle), operator)})`
}

/** Assert an entire projected ownership scope, including newly added or removed rows.
 * @param snapshot Current or rehearsed projected rows; credential material is excluded.
 * @param ids Explicitly reviewed account owners, including absorbed IDs.
 * @param keys Schema primary key columns.
 * @returns One bounded-parameter assertion that aborts an atomic D1 batch on drift.
 */
function guard(
  snapshot: AdoptionSnapshot,
  ids: string[],
  keys: string[],
): AdoptionStatement {
  const table = quote(snapshot.table)
  const scope = snapshot.columns
    .map(c => `${quote(c)} IN (SELECT value FROM json_each(?2))`)
    .join(' OR ')
  const matches = combine(
    snapshot.fields.map(c => `a.${quote(c)} IS json_extract(e.value,'$.${c}')`),
    'AND',
  )
  if (!keys.length || !scope || !matches) throw new Error('Unkeyed adoption scope')
  return {
    sql: `SELECT CASE WHEN (SELECT count(*) FROM ${table} WHERE ${scope})=json_array_length(?1) AND NOT EXISTS(SELECT 1 FROM json_each(?1) e WHERE NOT EXISTS(SELECT 1 FROM ${table} a WHERE ${matches})) THEN 1 ELSE json('stale adoption ${snapshot.table}') END AS valid`,
    params: [JSON.stringify(snapshot.rows), JSON.stringify(ids)],
  }
}

/** Compile a complete rehearsal into guards and column-preserving bulk changes.
 * @param db Rehearsed post-adoption SQLite database.
 * @param snapshots Fresh projected production before-images.
 * @param ids Explicitly reviewed owners.
 * @param targetIdentity Exact production database binding identity.
 * @param reviewHash Hash of the approved review, including additions.
 * @param merges Explicit absorbed-to-retained owner mapping from that review.
 * @returns Atomic plan; existing credential/session fields are never read or written.
 * @remarks JSON batches use at most two bound parameters regardless of row count.
 * All reference moves finish before absorbed user deletion. Unknown or changed rows
 * fail closed, and after-image assertions share the same transaction as all writes.
 */
export function prepareRemoteAdoption(
  db: Database,
  snapshots: AdoptionSnapshot[],
  ids: string[],
  targetIdentity: string,
  reviewHash: string,
  merges: Array<{ from: string; to: string }> = [],
): RemoteAdoptionPlan {
  if (!targetIdentity.startsWith('production:') || !ids.length || !reviewHash)
    throw new Error('Invalid reviewed adoption target')
  const plan: RemoteAdoptionPlan = {
    version: 1,
    targetIdentity,
    reviewHash,
    ids,
    before: [],
    writes: [],
    after: [],
    changes: [],
  }
  const userDeletes: AdoptionStatement[] = []
  for (const snapshot of snapshots) {
    // Derived invalidation counters are advanced after every reference move below.
    if (snapshot.table === 'featureCountUserRevision') continue
    const table = quote(snapshot.table)
    if (snapshot.fields.some(f => (opaque[snapshot.table] ?? []).includes(f)))
      throw new Error('Credential material is not permitted in adoption plans')
    const keys = (
      db.query(`PRAGMA table_info(${table})`).all() as Array<{
        name: string
        pk: number
      }>
    )
      .filter(c => c.pk)
      .sort((a, b) => a.pk - b.pk)
      .map(c => c.name)
    const rows = db
      .query(
        `SELECT ${snapshot.fields.map(quote).join(',')} FROM ${table} WHERE ${snapshot.columns.map(c => `${quote(c)} IN (SELECT value FROM json_each(?1))`).join(' OR ')}`,
      )
      .all(JSON.stringify(ids)) as Row[]
    plan.before.push(guard(snapshot, ids, keys))
    plan.after.push(guard({ ...snapshot, rows }, ids, keys))
    const key = (row: Row): string => JSON.stringify(keys.map(k => row[k]))
    const before = new Map(snapshot.rows.map(r => [key(r), r]))
    const after = new Map(rows.map(r => [key(r), r]))
    const removed = snapshot.rows.filter(r => !after.has(key(r)))
    const inserted = rows.filter(r => !before.has(key(r)))
    const changed = rows.filter(
      r =>
        before.has(key(r)) &&
        snapshot.fields.some(f => r[f] !== before.get(key(r))![f]),
    )
    const match = keys
      .map(k => `${table}.${quote(k)} IS json_extract(e.value,'$.${k}')`)
      .join(' AND ')
    // Delete only colliding memberships first; root identity deletion must come last.
    if (removed.length) {
      const statement = {
        sql: `DELETE FROM ${table} WHERE EXISTS(SELECT 1 FROM json_each(?1) e WHERE ${match})`,
        params: [
          JSON.stringify(
            removed.map(r => Object.fromEntries(keys.map(k => [k, r[k]]))),
          ),
        ],
      }
      if (snapshot.table === 'user') userDeletes.push(statement)
      else plan.writes.push(statement)
    }
    // Update only fields actually changed by the approved rehearsal, preserving opaque live data.
    const groups = new Map<string, Row[]>()
    for (const row of changed) {
      const fields = snapshot.fields.filter(
        f => !keys.includes(f) && row[f] !== before.get(key(row))![f],
      )
      const group = JSON.stringify(fields)
      if (!groups.has(group)) groups.set(group, [])
      groups
        .get(group)!
        .push(Object.fromEntries([...keys, ...fields].map(k => [k, row[k]])))
    }
    for (const [group, updates] of groups) {
      const fields = JSON.parse(group) as string[]
      if (!fields.length) continue
      plan.writes.push({
        sql: `UPDATE ${table} SET ${fields.map(f => `${quote(f)}=(SELECT json_extract(e.value,'$.${f}') FROM json_each(?1) e WHERE ${match})`).join(',')} WHERE EXISTS(SELECT 1 FROM json_each(?1) e WHERE ${match})`,
        params: [JSON.stringify(updates)],
      })
    }
    if (inserted.length)
      plan.writes.push({
        sql: `INSERT INTO ${table}(${snapshot.fields.map(quote).join(',')}) SELECT ${snapshot.fields.map(f => `json_extract(value,'$.${f}')`).join(',')} FROM json_each(?1)`,
        params: [JSON.stringify(inserted)],
      })
    if (removed.length || inserted.length || changed.length)
      plan.changes.push({
        table: snapshot.table,
        inserted: inserted.length,
        updated: changed.length,
        deleted: removed.length,
      })
  }
  const removedUsers =
    snapshots
      .find(s => s.table === 'user')
      ?.rows.filter(r => !db.query('SELECT 1 FROM user WHERE id=?').get(r.id))
      .map(r => String(r.id)) ?? []
  if (
    new Set(merges.map(m => m.from)).size !== removedUsers.length ||
    merges.some(
      m =>
        !removedUsers.includes(m.from) ||
        !ids.includes(m.to) ||
        removedUsers.includes(m.to),
    )
  )
    throw new Error('Incomplete reviewed merge mapping')
  // Reference triggers can create fresh donor counters during the batch. Coalesce these last.
  if (
    db
      .query(
        "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='featureCountUserRevision'",
      )
      .get()
  ) {
    for (const merge of merges) {
      plan.writes.push({
        sql: 'INSERT INTO featureCountUserRevision(userId,revision) SELECT ?1,revision+1 FROM featureCountUserRevision WHERE userId=?2 ON CONFLICT(userId) DO UPDATE SET revision=max(featureCountUserRevision.revision,excluded.revision)+1',
        params: [merge.to, merge.from],
      })
      plan.writes.push({
        sql: 'DELETE FROM featureCountUserRevision WHERE userId=?1',
        params: [merge.from],
      })
    }
  }
  plan.writes.push(...userDeletes)
  // A schema change could introduce an ownership reference absent from this inventory.
  const schema = db
    .query(
      "SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
    )
    .all() as Array<{ name: string; type: string; sql: string }>
  plan.before.unshift({
    sql: "SELECT CASE WHEN (SELECT count(*) FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%')=json_array_length(?1) AND NOT EXISTS(SELECT 1 FROM json_each(?1) e WHERE NOT EXISTS(SELECT 1 FROM sqlite_schema s WHERE s.name=json_extract(e.value,'$.name') AND s.type=json_extract(e.value,'$.type') AND s.sql=json_extract(e.value,'$.sql'))) THEN 1 ELSE json('adoption schema changed') END AS valid",
    params: [JSON.stringify(schema)],
  })
  plan.after.unshift(plan.before[0])
  const originalUsers = snapshots.find(s => s.table === 'user')?.rows ?? []
  const absorbed = originalUsers
    .filter(row => !db.query('SELECT 1 FROM user WHERE id=?').get(row.id))
    .map(row => row.id)
  // Do not leave undeclared or embedded history references pointing at a removed identity.
  // Cloudflare owns and prohibits reads from _cf_ tables; these contain no application references.
  for (const table of schema.filter(
    s =>
      s.type === 'table' &&
      !s.name.startsWith('_cf_') &&
      !s.name.startsWith('featureSearchFts'),
  )) {
    const columns = (
      db.query(`PRAGMA table_info(${quote(table.name)})`).all() as Array<{
        name: string
        type: string
      }>
    ).filter(
      c =>
        c.type.toLowerCase() === 'text' &&
        !(table.name === 'account' && c.name === 'accountId'),
    )
    if (!columns.length || !absorbed.length) continue
    const assertion = {
      sql: `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ${quote(table.name)} a JOIN json_each(?1) d ON ${combine(
        columns.map(c => `instr(a.${quote(c.name)},d.value)>0`),
        'OR',
      )}) THEN 1 ELSE json('unresolved adoption reference ${table.name}') END AS valid`,
      params: [JSON.stringify(absorbed)],
    }
    plan.after.push(assertion)
  }
  return plan
}

/** Apply one completely atomic reviewed adoption, or recognize its completed replay.
 * @param db Production D1 database.
 * @param plan Hashed and rehearsed operator plan.
 * @param expectedHash Explicit expected plan hash.
 * @param targetIdentity Verified remote binding identity.
 * @returns Aggregate outcome without identity or credential values.
 * @remarks A lost response is recovered by matching the whole after-state. A stale
 * before-state aborts before writes; no production progress table is introduced.
 */
export async function applyRemoteAdoption(
  db: D1Database,
  plan: RemoteAdoptionPlan,
  expectedHash: string,
  targetIdentity: string,
): Promise<{ planHash: string; replay: boolean; statements: number }> {
  if (
    plan.version !== 1 ||
    targetIdentity !== plan.targetIdentity ||
    remoteAdoptionHash(plan) !== expectedHash ||
    !plan.before.length ||
    !plan.after.length
  )
    throw new Error('Adoption target or hash differs')
  const prepare = (rows: AdoptionStatement[]) =>
    rows.map(row => db.prepare(row.sql).bind(...row.params))
  try {
    await db.batch(prepare(plan.after))
    return { planHash: expectedHash, replay: true, statements: 0 }
  } catch {
    // Only a fully matching before-state may proceed after the read-only replay check.
  }
  const statements = [...plan.before, ...plan.writes, ...plan.after]
  await db.batch(prepare(statements))
  return { planHash: expectedHash, replay: false, statements: statements.length }
}
