// SQLITE
import type { Database } from 'bun:sqlite'
// DEPLOYMENT
import { fingerprint, identifier, fences, guard } from './contract'
import type { Group, Statement } from './contract'

// TABLE OF CONTENTS
// 1. Exact snapshot inventory
// 2. Foreign-key dependency closure
// 3. Bounded atomic schema replacement

type SchemaObject = { type: string; name: string; tbl_name: string; sql: string }
type Row = Record<string, string | number | null>
const internal = /^(sqlite_|_cf_|featureSearchFts|_revisionDeployment|revision_deploy_)/

/** Read portable schema objects from an isolated snapshot.
 * @param db Read-only source or rehearsed target. @returns Named SQL definitions.
 */
function schema(db: Database): SchemaObject[] {
  return (
    db
      .query(
        'SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name',
      )
      .all() as SchemaObject[]
  ).filter(row => !internal.test(row.name))
}

/** Read exact stored rows; generated columns are restored by their definitions.
 * @param db Isolated snapshot. @param table Introspected table name.
 * @returns Stored column names and row values suitable for JSON transport.
 */
function content(db: Database, table: string): { columns: string[]; rows: Row[] } {
  const columns = (
    db.query(`PRAGMA table_xinfo(${identifier(table)})`).all() as {
      name: string
      hidden: number
    }[]
  )
    .filter(column => !column.hidden)
    .map(column => column.name)
  const rows = db
    .query(`SELECT ${columns.map(identifier).join(',')} FROM ${identifier(table)}`)
    .all() as Row[]
  for (const row of rows)
    for (const value of Object.values(row)) {
      if (value !== null && typeof value !== 'string' && typeof value !== 'number')
        throw new Error(`Unsupported lifecycle value in ${table}`)
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value)))
      )
        throw new Error(`Unsafe lifecycle numeric value in ${table}`)
    }
  return { columns, rows }
}

/** Split exact rows into conservative parameter-sized JSON batches.
 * @param rows Stored source values. @returns JSON arrays below the retained-value budget.
 */
function jsonBatches(rows: Row[]): string[] {
  const batches: string[] = []
  let batch: Row[] = [],
    size = 2
  const flush = (): void => {
    if (batch.length) batches.push(JSON.stringify(batch))
    batch = []
    size = 2
  }
  for (const row of rows) {
    const bytes = Buffer.byteLength(JSON.stringify(row)) + 1
    if (bytes + 2 > 900_000) throw new Error('Oversized lifecycle row')
    if (size + bytes > 900_000) flush()
    batch.push(row)
    size += bytes
  }
  flush()
  return batches
}

/** Encode bounded inserts without interpolating content into SQL.
 * @param table Trusted target table. @param data Stored columns and exact rows.
 * @returns Parameterized insert statements; oversized rows fail closed.
 */
function inserts(table: string, data: ReturnType<typeof content>): Statement[] {
  const select = data.columns
    .map(column => `json_extract(value,'$."${column}"')`)
    .join(',')
  const sql = `INSERT INTO ${identifier(table)} (${data.columns.map(identifier).join(',')}) SELECT ${select} FROM json_each(?)`
  return jsonBatches(data.rows).map(batch => ({ sql, params: [batch] }))
}

/** Prepare one atomic D1-compatible replacement from exact before/after snapshots.
 * @param before Enrolled legacy snapshot. @param after Validated lifecycle snapshot.
 * @returns Bounded schema group with maintenance fences restored before commit.
 * @remarks Foreign keys remain enabled. Every referencing table is included so CASCADE
 * and SET NULL cannot mutate retained rows outside the replacement. Replay only after
 * the managed protocol verifies the complete source fingerprints under maintenance.
 */
export function prepareLifecycleSchemaGroup(before: Database, after: Database): Group {
  for (const db of [before, after]) {
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Lifecycle snapshot has foreign-key violations')
  }
  const oldSchema = schema(before),
    newSchema = schema(after)
  const oldTables = new Map(
    oldSchema.filter(row => row.type === 'table').map(row => [row.name, row]),
  )
  const newTables = new Map(
    newSchema.filter(row => row.type === 'table').map(row => [row.name, row]),
  )
  const selected = new Set<string>()
  const targetData = new Map<string, ReturnType<typeof content>>()
  for (const name of new Set([...oldTables.keys(), ...newTables.keys()])) {
    const old = oldTables.get(name),
      next = newTables.get(name)
    if (next) targetData.set(name, content(after, name))
    if (
      !old ||
      !next ||
      old.sql !== next.sql ||
      fingerprint(content(before, name).rows).hash !==
        fingerprint(targetData.get(name)!.rows).hash
    )
      selected.add(name)
  }
  // Feature and change-set identities stay in place: only additive columns are populated.
  const additions: Record<string, Record<string, string>> = {
    feature: {
      currentRevisionId: 'TEXT REFERENCES featureRevision(id)',
      revisionVersion: 'INTEGER NOT NULL DEFAULT 0 CHECK(revisionVersion>=0)',
    },
    revisionChangeSet: {
      legacyEvidence:
        'TEXT CHECK(legacyEvidence IS NULL OR json_valid(legacyEvidence))',
    },
  }
  const additive: Statement[] = [],
    populate: Statement[] = []
  for (const [name, columns] of Object.entries(additions)) {
    const old = content(before, name),
      next = targetData.get(name)!
    if (
      Object.keys(columns).some(column => old.columns.includes(column)) ||
      next.columns.some(column => !old.columns.includes(column) && !(column in columns))
    )
      throw new Error(`Unexpected additive lifecycle schema: ${name}`)
    const ids = new Set(old.rows.map(row => row.id))
    const retained = next.rows
      .filter(row => ids.has(row.id))
      .map(row => Object.fromEntries(old.columns.map(column => [column, row[column]])))
    if (fingerprint(old.rows).hash !== fingerprint(retained).hash)
      throw new Error(`Additive lifecycle conversion changed existing ${name} values`)
    selected.delete(name)
    for (const [column, definition] of Object.entries(columns))
      additive.push({
        sql: `ALTER TABLE ${identifier(name)} ADD COLUMN ${identifier(column)} ${definition}`,
        params: [],
      })
    const data = next.rows
      .filter(row => ids.has(row.id))
      .map(row =>
        Object.fromEntries(
          ['id', ...Object.keys(columns)].map(column => [column, row[column]]),
        ),
      )
    // One row per identity avoids binding limits; JSON values remain parameters.
    for (const batch of jsonBatches(data))
      populate.push({
        sql: `UPDATE ${identifier(name)} SET ${Object.keys(columns)
          .map(column => `${identifier(column)}=json_extract(j.value,'$."${column}"')`)
          .join(
            ',',
          )} FROM json_each(?) j WHERE ${identifier(name)}.id=json_extract(j.value,'$.id')`,
        params: [batch],
      })
    populate.push(
      ...inserts(name, {
        columns: next.columns,
        rows: next.rows.filter(row => !ids.has(row.id)),
      }),
    )
  }
  // Include the full incoming dependency closure before dropping any parent table.
  let changed = true
  while (changed) {
    changed = false
    for (const name of oldTables.keys()) {
      const refs = before
        .query(`PRAGMA foreign_key_list(${identifier(name)})`)
        .all() as { table: string }[]
      if (!selected.has(name) && refs.some(ref => selected.has(ref.table))) {
        selected.add(name)
        changed = true
      }
    }
  }
  if (!selected.size) throw new Error('Lifecycle cutover has no changes')
  for (const name of selected) {
    if (
      /CREATE VIRTUAL TABLE/i.test(
        oldTables.get(name)?.sql ?? newTables.get(name)?.sql ?? '',
      )
    )
      throw new Error(
        `Virtual table replacement requires a dedicated migration: ${name}`,
      )
  }
  const affected = new RegExp(
    '\\b(' + [...selected, ...Object.keys(additions)].join('|') + ')\\b',
  )
  const oldObjects = new Map(oldSchema.map(row => [row.name, row]))
  const newObjects = new Map(newSchema.map(row => [row.name, row]))
  const replacedObject = (object: SchemaObject): boolean =>
    affected.test(object.sql) ||
    oldObjects.get(object.name)?.sql !== newObjects.get(object.name)?.sql
  // Remove affected ordinary guards/views only inside the atomic replacement.
  // Durable maintenance fences are retained or restored before commit.
  const statements: Statement[] = [{ sql: 'PRAGMA defer_foreign_keys=ON', params: [] }]
  for (const object of oldSchema.filter(
    row => (row.type === 'trigger' || row.type === 'view') && replacedObject(row),
  ))
    statements.push({
      sql: `DROP ${object.type.toUpperCase()} ${identifier(object.name)}`,
      params: [],
    })
  for (const name of [...selected].filter(name => oldTables.has(name)))
    statements.push({ sql: `DROP TABLE ${identifier(name)}`, params: [] })
  for (const name of [...selected].filter(name => newTables.has(name)))
    statements.push({ sql: newTables.get(name)!.sql, params: [] })
  statements.push(...additive)
  for (const name of [...selected].filter(name => newTables.has(name)))
    statements.push(...inserts(name, targetData.get(name)!))
  statements.push(...populate)
  for (const object of newSchema.filter(
    row => row.type === 'index' && selected.has(row.tbl_name),
  ))
    statements.push({ sql: object.sql, params: [] })
  for (const object of newSchema.filter(
    row => (row.type === 'view' || row.type === 'trigger') && replacedObject(row),
  ))
    statements.push({ sql: object.sql, params: [] })
  statements.push(guard('NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)'))
  const tables = [...newTables.keys()].sort(),
    fenceTables = tables.filter(name => selected.has(name))
  const complete = [...statements, ...fences(fenceTables)]
  if (
    complete.length + 5 > 950 ||
    complete.some(
      statement =>
        Buffer.byteLength(statement.sql) > 95_000 || statement.params.length > 100,
    )
  )
    throw new Error(
      `Lifecycle schema replacement exceeds the atomic deployment budget: ${complete.length + 5} statements; ${Math.max(...complete.map(s => Buffer.byteLength(s.sql)))} SQL bytes`,
    )
  return { label: 'feature-lifecycle-schema', statements, tables, fenceTables }
}
