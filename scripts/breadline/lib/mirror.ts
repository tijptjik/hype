// NODE
import { createHash, randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { chmodSync, closeSync, mkdirSync, openSync } from 'node:fs'

// BUN
import type { SQL } from 'bun'
import { Database, type SQLQueryBindings } from 'bun:sqlite'

// SOURCE
import {
  countSourceRows,
  inspectSourceSchema,
  readSourceKeys,
  readSourceRows,
  readSourceSnapshotTime,
} from './source'

// TYPES
import type {
  MirrorSyncOptions,
  SourceColumn,
  SourceSchemaReport,
  SourceTable,
  TableSyncResult,
} from './types'

const SOURCE_KEY_COLUMN = '_breadline_source_key'
const SYNCED_AT_COLUMN = '_breadline_synced_at'
const ROW_HASH_COLUMN = '_breadline_row_hash'
const RESERVED_MIRROR_COLUMNS = new Set([
  SOURCE_KEY_COLUMN,
  SYNCED_AT_COLUMN,
  ROW_HASH_COLUMN,
])

interface PersistedTableState {
  sourceSchema: string
  sourceTable: string
  mirrorTable: string
  strategy: TableSyncResult['strategy']
  cursorColumn: string | null
  checkpoint: string | null
  schemaFingerprint: string
  primaryKeyJson: string
}

interface SyncPageOptions {
  lowerCursor?: string
  upperCursor?: string
}

interface MirrorRowData {
  bindings: SQLQueryBindings[]
  sourceKey: string
  rowHash: string
}

interface PullRowsResult {
  pulledRows: number
  changedRows: number
}

/**
 * Quote a SQLite identifier originating from inspected schema metadata.
 * @param identifier Identifier to quote.
 * @returns Safely double-quoted identifier.
 */
export function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

/**
 * Derive an unambiguous local table name for one source table.
 * @param table Source table identity.
 * @returns Mirror table name.
 */
export function mirrorTableName(table: Pick<SourceTable, 'schema' | 'name'>): string {
  return `breadline__${table.schema}__${table.name}`
}

/**
 * Map PostgreSQL storage types to loss-minimising SQLite affinities.
 * @param column PostgreSQL source column.
 * @returns SQLite column affinity.
 * @remarks Numeric and bigint values use TEXT so exact values survive the mirror.
 */
export function sqliteAffinity(
  column: SourceColumn,
): 'BLOB' | 'INTEGER' | 'REAL' | 'TEXT' {
  const type = column.dataType.toLowerCase()
  if (type === 'bytea') return 'BLOB'
  if (type === 'boolean' || type === 'smallint' || type === 'integer') {
    return 'INTEGER'
  }
  if (type === 'real' || type === 'double precision') return 'REAL'
  return 'TEXT'
}

/**
 * Normalize a PostgreSQL value into a lossless SQLite binding.
 * @param value Value returned by Bun's PostgreSQL client.
 * @returns SQLite-compatible representation.
 */
export function normalizeSourceValue(value: unknown): SQLQueryBindings {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'number') return value
  return JSON.stringify(canonicalize(value))
}

/**
 * Create the persistent local identity for a source row.
 * @param row Source row.
 * @param primaryKey Ordered source primary-key fields.
 * @returns Canonical JSON key.
 */
export function createSourceKey(
  row: Record<string, unknown>,
  primaryKey: string[],
): string {
  if (primaryKey.length === 0) {
    throw new Error('A stable source key requires a primary key')
  }
  return JSON.stringify(primaryKey.map(column => canonicalize(row[column])))
}

/**
 * Open or create the local Breadline SQLite mirror.
 * @param mirrorPath Absolute or relative database path.
 * @returns Configured SQLite database.
 */
export function openMirror(mirrorPath: string): Database {
  mkdirSync(dirname(mirrorPath), { recursive: true })
  closeSync(openSync(mirrorPath, 'a', 0o600))
  chmodSync(mirrorPath, 0o600)
  const database = new Database(mirrorPath, {
    create: true,
    readwrite: true,
    strict: true,
    safeIntegers: true,
  })
  database.run('PRAGMA journal_mode = WAL')
  database.run('PRAGMA synchronous = FULL')
  database.run('PRAGMA busy_timeout = 30000')
  initializeMirrorMetadata(database)
  return database
}

/**
 * Create internal mirror bookkeeping tables.
 * @param database Open mirror database.
 * @returns Nothing.
 */
export function initializeMirrorMetadata(database: Database): void {
  database.run(`CREATE TABLE IF NOT EXISTS _breadline_sync_run (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    sourceSnapshotAt TEXT,
    completedAt TEXT,
    tableCount INTEGER NOT NULL DEFAULT 0,
    pulledRows INTEGER NOT NULL DEFAULT 0,
    changedRows INTEGER NOT NULL DEFAULT 0,
    deletedRows INTEGER NOT NULL DEFAULT 0,
    error TEXT
  )`)
  database.run(`CREATE TABLE IF NOT EXISTS _breadline_sync_state (
    sourceSchema TEXT NOT NULL,
    sourceTable TEXT NOT NULL,
    mirrorTable TEXT NOT NULL UNIQUE,
    strategy TEXT NOT NULL,
    cursorColumn TEXT,
    checkpoint TEXT,
    schemaFingerprint TEXT NOT NULL,
    primaryKeyJson TEXT NOT NULL,
    sourceRows INTEGER NOT NULL,
    localRows INTEGER NOT NULL,
    pulledRows INTEGER NOT NULL,
    changedRows INTEGER NOT NULL,
    deletedRows INTEGER NOT NULL,
    syncedAt TEXT NOT NULL,
    PRIMARY KEY (sourceSchema, sourceTable)
  )`)
  database.run(`CREATE TABLE IF NOT EXISTS _breadline_schema_report (
    runId TEXT PRIMARY KEY,
    inspectedAt TEXT NOT NULL,
    reportJson TEXT NOT NULL
  )`)
  database.run(`CREATE TABLE IF NOT EXISTS _breadline_change (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    runId TEXT NOT NULL,
    sourceSchema TEXT NOT NULL,
    sourceTable TEXT NOT NULL,
    sourceKey TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    rowHash TEXT,
    recordedAt TEXT NOT NULL,
    UNIQUE (runId, sourceSchema, sourceTable, sourceKey, operation)
  )`)
  database.run(`CREATE TEMP TABLE IF NOT EXISTS _breadline_seen_key (
    sourceKey TEXT PRIMARY KEY
  ) WITHOUT ROWID`)
}

/**
 * Apply a complete source snapshot to one local mirror table.
 * @param database Open mirror database inside a transaction.
 * @param table Source table schema.
 * @param rows Complete ordered source rows.
 * @param syncedAt Source snapshot timestamp.
 * @returns Number of written rows.
 */
export function applySnapshotRows(
  database: Database,
  table: SourceTable,
  rows: Array<Record<string, unknown>>,
  syncedAt: string,
): number {
  ensureMirrorTable(database, table, true)
  const name = quoteSqliteIdentifier(mirrorTableName(table))
  database.run(`DELETE FROM ${name}`)
  const insert = prepareMirrorUpsert(database, table)
  rows.forEach((row, index) => {
    insert.run(
      ...createMirrorRowData(table, row, syncedAt, `snapshot:${index}`).bindings,
    )
  })
  return rows.length
}

/**
 * Upsert changed rows and remove source keys absent from the reconciliation set.
 * @param database Open mirror database inside a transaction.
 * @param table Source table schema with a primary key.
 * @param changedRows Rows in the incremental timestamp window.
 * @param sourceKeys Complete source primary-key set.
 * @param syncedAt Source snapshot timestamp.
 * @returns Upsert and deletion counts.
 */
export function applyIncrementalRows(
  database: Database,
  table: SourceTable,
  changedRows: Array<Record<string, unknown>>,
  sourceKeys: Array<Record<string, unknown>>,
  syncedAt: string,
): { pulledRows: number; deletedRows: number } {
  if (table.primaryKey.length === 0) {
    throw new Error('Incremental mirroring requires a primary key')
  }
  ensureMirrorTable(database, table, false)
  const insert = prepareMirrorUpsert(database, table)
  for (const row of changedRows) {
    insert.run(...createMirrorRowData(table, row, syncedAt).bindings)
  }

  database.run('DELETE FROM _breadline_seen_key')
  const insertSeen = database.prepare(
    'INSERT OR IGNORE INTO _breadline_seen_key (sourceKey) VALUES (?)',
  )
  for (const row of sourceKeys) insertSeen.run(createSourceKey(row, table.primaryKey))

  const name = quoteSqliteIdentifier(mirrorTableName(table))
  const deletion = database.run(
    `DELETE FROM ${name}
      WHERE ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} NOT IN (
        SELECT sourceKey FROM _breadline_seen_key
      )`,
  )
  return { pulledRows: changedRows.length, deletedRows: deletion.changes }
}

/**
 * Synchronize a PostgreSQL snapshot into the local SQLite mirror.
 * @param source Connected PostgreSQL client.
 * @param options Sync scope and batching settings.
 * @returns Per-table sync results.
 */
export async function syncBreadlineMirror(
  source: SQL,
  options: MirrorSyncOptions,
): Promise<TableSyncResult[]> {
  const database = openMirror(options.mirrorPath)
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  database
    .prepare(
      `INSERT INTO _breadline_sync_run (id, status, startedAt)
       VALUES (?, 'running', ?)`,
    )
    .run(runId, startedAt)

  try {
    const results = await source.begin(
      'isolation level repeatable read read only',
      async snapshot => {
        await snapshot.unsafe(`SET LOCAL TIME ZONE 'UTC'`)
        const report = await inspectSourceSchema(snapshot, options.schemas)
        const selectedTables = selectTables(report, options.tables)
        const snapshotAt = await readSourceSnapshotTime(snapshot)

        database.run('BEGIN IMMEDIATE')
        try {
          database
            .prepare(
              `INSERT INTO _breadline_schema_report (runId, inspectedAt, reportJson)
               VALUES (?, ?, ?)`,
            )
            .run(runId, report.inspectedAt, JSON.stringify(report, null, 2))

          const tableResults: TableSyncResult[] = []
          for (const table of selectedTables) {
            tableResults.push(
              await syncOneTable(database, snapshot, table, snapshotAt, runId, options),
            )
          }
          database.run('COMMIT')
          return { report, snapshotAt, tableResults }
        } catch (error) {
          database.run('ROLLBACK')
          throw error
        }
      },
    )

    const pulledRows = results.tableResults.reduce(
      (sum, result) => sum + result.pulledRows,
      0,
    )
    const deletedRows = results.tableResults.reduce(
      (sum, result) => sum + result.deletedRows,
      0,
    )
    const changedRows = results.tableResults.reduce(
      (sum, result) => sum + result.changedRows,
      0,
    )
    database
      .prepare(
        `UPDATE _breadline_sync_run
            SET status = 'complete',
                sourceSnapshotAt = ?,
                completedAt = ?,
                tableCount = ?,
                pulledRows = ?,
                changedRows = ?,
                deletedRows = ?
          WHERE id = ?`,
      )
      .run(
        results.snapshotAt,
        new Date().toISOString(),
        results.tableResults.length,
        pulledRows,
        changedRows,
        deletedRows,
        runId,
      )
    return results.tableResults
  } catch (error) {
    database
      .prepare(
        `UPDATE _breadline_sync_run
            SET status = 'failed', completedAt = ?, error = ?
          WHERE id = ?`,
      )
      .run(new Date().toISOString(), safeErrorMessage(error), runId)
    throw error
  } finally {
    database.close()
  }
}

/**
 * Filter the inspected report to requested CLI table selectors.
 * @param report Complete schema report.
 * @param selectors Bare table names or schema-qualified names.
 * @returns Selected tables in catalogue order.
 */
function selectTables(report: SourceSchemaReport, selectors: string[]): SourceTable[] {
  if (selectors.length === 0) return report.tables
  const selected = report.tables.filter(table =>
    selectors.some(
      selector =>
        selector === table.name || selector === `${table.schema}.${table.name}`,
    ),
  )
  const matchedSelectors = new Set(
    selected.flatMap(table => [table.name, `${table.schema}.${table.name}`]),
  )
  const missing = selectors.filter(selector => !matchedSelectors.has(selector))
  if (missing.length > 0) {
    throw new Error(`Source tables not found: ${missing.join(', ')}`)
  }
  return selected
}

/**
 * Pull and apply one table according to persisted state and schema capability.
 * @param database Local SQLite mirror.
 * @param source Source snapshot transaction.
 * @param table Source table descriptor.
 * @param snapshotAt Source snapshot upper bound.
 * @param runId Current sync-run identifier.
 * @param options Sync settings.
 * @returns Table sync result.
 */
async function syncOneTable(
  database: Database,
  source: SQL,
  table: SourceTable,
  snapshotAt: string,
  runId: string,
  options: MirrorSyncOptions,
): Promise<TableSyncResult> {
  const state = readTableState(database, table)
  const schemaChanged = state?.schemaFingerprint !== table.schemaFingerprint
  const incrementalCapable =
    table.incremental.strategy === 'incremental-upsert-with-key-reconciliation'
  const previousCheckpoint = state?.checkpoint
  const useFullSnapshot =
    options.mode === 'full' ||
    !previousCheckpoint ||
    schemaChanged ||
    !incrementalCapable

  const sourceRows = await countSourceRows(source, table)
  let pulledRows = 0
  let changedRows = 0
  let deletedRows = 0

  if (useFullSnapshot) {
    const previousRows = state ? readMirrorRowHashes(database, table) : new Map()
    const comparisonRows = schemaChanged ? new Map<string, string>() : previousRows
    ensureMirrorTable(database, table, schemaChanged)
    database.run(`DELETE FROM ${quoteSqliteIdentifier(mirrorTableName(table))}`)
    const pull = await pullRowsIntoMirror(
      database,
      source,
      table,
      snapshotAt,
      runId,
      options.batchSize,
      {},
      comparisonRows,
    )
    pulledRows = pull.pulledRows
    changedRows = pull.changedRows
    deletedRows = recordFullSnapshotDeletes(
      database,
      table,
      previousRows,
      runId,
      snapshotAt,
    )
  } else {
    if (!previousCheckpoint) {
      throw new Error('Incremental sync requires a previous checkpoint')
    }
    const checkpoint = new Date(previousCheckpoint)
    const lowerCursor = new Date(
      checkpoint.getTime() - options.overlapSeconds * 1_000,
    ).toISOString()
    ensureMirrorTable(database, table, false)
    const pull = await pullRowsIntoMirror(
      database,
      source,
      table,
      snapshotAt,
      runId,
      options.batchSize,
      { lowerCursor, upperCursor: snapshotAt },
    )
    pulledRows = pull.pulledRows
    changedRows = pull.changedRows
    deletedRows = await reconcileDeletedRows(
      database,
      source,
      table,
      runId,
      snapshotAt,
      options.batchSize,
    )
  }

  const localRows = countMirrorRows(database, table)
  if (localRows !== sourceRows) {
    throw new Error(
      `${table.schema}.${table.name} row-count mismatch: source=${sourceRows}, mirror=${localRows}`,
    )
  }

  const result: TableSyncResult = {
    sourceTable: `${table.schema}.${table.name}`,
    mirrorTable: mirrorTableName(table),
    strategy: incrementalCapable
      ? 'incremental-upsert-with-key-reconciliation'
      : 'snapshot-replace',
    cursorColumn: table.incremental.cursorColumn,
    sourceRows,
    localRows,
    pulledRows,
    changedRows,
    deletedRows,
    checkpoint: snapshotAt,
  }
  writeTableState(database, table, result)
  return result
}

/**
 * Read and upsert source rows in bounded pages.
 * @param database Local SQLite mirror.
 * @param source Source transaction.
 * @param table Source table descriptor.
 * @param syncedAt Source snapshot timestamp.
 * @param runId Current sync-run identifier.
 * @param batchSize Page size.
 * @param pageOptions Optional incremental cursor window.
 * @param previousRows Optional pre-refresh hashes for full snapshot comparison.
 * @returns Downloaded and materially changed row counts.
 */
async function pullRowsIntoMirror(
  database: Database,
  source: SQL,
  table: SourceTable,
  syncedAt: string,
  runId: string,
  batchSize: number,
  pageOptions: SyncPageOptions = {},
  previousRows?: Map<string, string>,
): Promise<PullRowsResult> {
  const insert = prepareMirrorUpsert(database, table)
  const readHash = prepareMirrorRowHashLookup(database, table)
  let offset = 0
  let pulledRows = 0
  let changedRows = 0
  while (true) {
    const rows = await readSourceRows(source, table, {
      ...pageOptions,
      offset,
      limit: batchSize,
    })
    rows.forEach((row, index) => {
      const snapshotKey = `snapshot:${offset + index}`
      const data = createMirrorRowData(table, row, syncedAt, snapshotKey)
      const existingHash = previousRows
        ? previousRows.get(data.sourceKey)
        : readHash.get(data.sourceKey)?.rowHash
      if (previousRows || existingHash !== data.rowHash) {
        insert.run(...data.bindings)
      }
      if (existingHash !== data.rowHash) {
        recordChange(
          database,
          table,
          runId,
          data.sourceKey,
          'upsert',
          data.rowHash,
          syncedAt,
        )
        changedRows += 1
      }
    })
    pulledRows += rows.length
    if (rows.length < batchSize) break
    offset += rows.length
  }
  return { pulledRows, changedRows }
}

/**
 * Delete local rows whose primary keys no longer exist at the source.
 * @param database Local SQLite mirror.
 * @param source Source transaction.
 * @param table Source table descriptor.
 * @param runId Current sync-run identifier.
 * @param recordedAt Source snapshot timestamp.
 * @param batchSize Page size.
 * @returns Number of deleted mirror rows.
 */
async function reconcileDeletedRows(
  database: Database,
  source: SQL,
  table: SourceTable,
  runId: string,
  recordedAt: string,
  batchSize: number,
): Promise<number> {
  database.run('DELETE FROM _breadline_seen_key')
  const insertSeen = database.prepare(
    'INSERT OR IGNORE INTO _breadline_seen_key (sourceKey) VALUES (?)',
  )
  let offset = 0
  while (true) {
    const rows = await readSourceKeys(source, table, offset, batchSize)
    for (const row of rows) insertSeen.run(createSourceKey(row, table.primaryKey))
    if (rows.length < batchSize) break
    offset += rows.length
  }

  const tableName = quoteSqliteIdentifier(mirrorTableName(table))
  const missingRows = database
    .prepare<{ sourceKey: string; rowHash: string }, []>(
      `SELECT ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} AS sourceKey,
              ${quoteSqliteIdentifier(ROW_HASH_COLUMN)} AS rowHash
         FROM ${tableName}
        WHERE ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} NOT IN (
          SELECT sourceKey FROM _breadline_seen_key
        )`,
    )
    .all()
  for (const row of missingRows) {
    recordChange(
      database,
      table,
      runId,
      row.sourceKey,
      'delete',
      row.rowHash,
      recordedAt,
    )
  }
  const deletion = database.run(
    `DELETE FROM ${tableName}
      WHERE ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} NOT IN (
        SELECT sourceKey FROM _breadline_seen_key
      )`,
  )
  return Number(deletion.changes)
}

/**
 * Ensure a mirror table exactly represents the current source columns.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @param rebuild Whether schema drift requires a table rebuild.
 * @returns Nothing.
 */
function ensureMirrorTable(
  database: Database,
  table: SourceTable,
  rebuild: boolean,
): void {
  for (const column of table.columns) {
    if (RESERVED_MIRROR_COLUMNS.has(column.name)) {
      throw new Error(
        `${table.schema}.${table.name} uses reserved mirror column ${column.name}`,
      )
    }
  }

  const name = quoteSqliteIdentifier(mirrorTableName(table))
  if (rebuild) database.run(`DROP TABLE IF EXISTS ${name}`)
  const sourceColumns = table.columns
    .map(column => `${quoteSqliteIdentifier(column.name)} ${sqliteAffinity(column)}`)
    .join(',\n')
  database.run(`CREATE TABLE IF NOT EXISTS ${name} (
    ${sourceColumns},
    ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} TEXT PRIMARY KEY,
    ${quoteSqliteIdentifier(SYNCED_AT_COLUMN)} TEXT NOT NULL,
    ${quoteSqliteIdentifier(ROW_HASH_COLUMN)} TEXT NOT NULL
  ) WITHOUT ROWID`)
}

/**
 * Prepare a reusable local upsert for one mirror table.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @returns Prepared SQLite statement.
 */
function prepareMirrorUpsert(database: Database, table: SourceTable) {
  const allColumns = [
    ...table.columns.map(column => column.name),
    SOURCE_KEY_COLUMN,
    SYNCED_AT_COLUMN,
    ROW_HASH_COLUMN,
  ]
  const quotedColumns = allColumns.map(quoteSqliteIdentifier)
  const updates = allColumns
    .filter(column => column !== SOURCE_KEY_COLUMN)
    .map(
      column =>
        `${quoteSqliteIdentifier(column)} = excluded.${quoteSqliteIdentifier(column)}`,
    )
  return database.prepare(
    `INSERT INTO ${quoteSqliteIdentifier(mirrorTableName(table))}
      (${quotedColumns.join(', ')})
     VALUES (${allColumns.map(() => '?').join(', ')})
     ON CONFLICT (${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)}) DO UPDATE SET
       ${updates.join(', ')}`,
  )
}

/**
 * Prepare a source-key hash lookup for overlap deduplication.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @returns Prepared row-hash lookup.
 */
function prepareMirrorRowHashLookup(database: Database, table: SourceTable) {
  return database.prepare<{ rowHash: string }, [string]>(
    `SELECT ${quoteSqliteIdentifier(ROW_HASH_COLUMN)} AS rowHash
       FROM ${quoteSqliteIdentifier(mirrorTableName(table))}
      WHERE ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} = ?`,
  )
}

/**
 * Build ordered SQLite bindings and identity for a mirrored source row.
 * @param table Source table descriptor.
 * @param row Source row.
 * @param syncedAt Source snapshot timestamp.
 * @param fallbackKey Positional key used only for keyless snapshot tables.
 * @returns Bindings plus stable key and row hash.
 */
function createMirrorRowData(
  table: SourceTable,
  row: Record<string, unknown>,
  syncedAt: string,
  fallbackKey?: string,
): MirrorRowData {
  const normalized = table.columns.map(column => normalizeSourceValue(row[column.name]))
  const sourceKey =
    table.primaryKey.length > 0 ? createSourceKey(row, table.primaryKey) : fallbackKey
  if (!sourceKey) throw new Error('Keyless snapshots require a positional key')
  const rowHash = createHash('sha256')
    .update(JSON.stringify(canonicalize(row)))
    .digest('hex')
  return {
    bindings: [...normalized, sourceKey, syncedAt, rowHash],
    sourceKey,
    rowHash,
  }
}

/**
 * Read the previous key/hash set before a full table refresh.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @returns Source keys mapped to their current row hashes.
 */
function readMirrorRowHashes(
  database: Database,
  table: SourceTable,
): Map<string, string> {
  const exists = database
    .prepare<{ found: bigint | number }, [string]>(
      `SELECT count(*) AS found
         FROM sqlite_master
        WHERE type = 'table' AND name = ?`,
    )
    .get(mirrorTableName(table))
  if (!exists?.found) return new Map()

  const rows = database
    .prepare<{ sourceKey: string; rowHash: string }, []>(
      `SELECT ${quoteSqliteIdentifier(SOURCE_KEY_COLUMN)} AS sourceKey,
              ${quoteSqliteIdentifier(ROW_HASH_COLUMN)} AS rowHash
         FROM ${quoteSqliteIdentifier(mirrorTableName(table))}`,
    )
    .all()
  return new Map(rows.map(row => [row.sourceKey, row.rowHash]))
}

/**
 * Journal keys removed by a full snapshot replacement.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @param previousRows Key/hash set before replacement.
 * @param runId Current sync-run identifier.
 * @param recordedAt Source snapshot timestamp.
 * @returns Number of deletion tombstones recorded.
 */
function recordFullSnapshotDeletes(
  database: Database,
  table: SourceTable,
  previousRows: Map<string, string>,
  runId: string,
  recordedAt: string,
): number {
  if (previousRows.size === 0) return 0
  const currentRows = readMirrorRowHashes(database, table)
  let deletedRows = 0
  for (const [sourceKey, rowHash] of previousRows) {
    if (currentRows.has(sourceKey)) continue
    recordChange(database, table, runId, sourceKey, 'delete', rowHash, recordedAt)
    deletedRows += 1
  }
  return deletedRows
}

/**
 * Append one material source change for downstream D1 ingestion.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @param runId Current sync-run identifier.
 * @param sourceKey Stable source key.
 * @param operation Upsert or delete operation.
 * @param rowHash Hash before deletion or after upsert.
 * @param recordedAt Source snapshot timestamp.
 * @returns Nothing.
 */
function recordChange(
  database: Database,
  table: SourceTable,
  runId: string,
  sourceKey: string,
  operation: 'upsert' | 'delete',
  rowHash: string | null,
  recordedAt: string,
): void {
  database
    .prepare(
      `INSERT INTO _breadline_change (
         runId, sourceSchema, sourceTable, sourceKey, operation, rowHash, recordedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(runId, table.schema, table.name, sourceKey, operation, rowHash, recordedAt)
}

/**
 * Read persisted sync state for one table.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @returns State or null before the first successful pull.
 */
function readTableState(
  database: Database,
  table: SourceTable,
): PersistedTableState | null {
  return (
    database
      .prepare<PersistedTableState, [string, string]>(
        `SELECT sourceSchema,
                sourceTable,
                mirrorTable,
                strategy,
                cursorColumn,
                checkpoint,
                schemaFingerprint,
                primaryKeyJson
           FROM _breadline_sync_state
          WHERE sourceSchema = ? AND sourceTable = ?`,
      )
      .get(table.schema, table.name) ?? null
  )
}

/**
 * Persist a successful table checkpoint.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @param result Completed table result.
 * @returns Nothing.
 */
function writeTableState(
  database: Database,
  table: SourceTable,
  result: TableSyncResult,
): void {
  database
    .prepare(
      `INSERT INTO _breadline_sync_state (
         sourceSchema, sourceTable, mirrorTable, strategy, cursorColumn,
         checkpoint, schemaFingerprint, primaryKeyJson, sourceRows, localRows,
         pulledRows, changedRows, deletedRows, syncedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (sourceSchema, sourceTable) DO UPDATE SET
         mirrorTable = excluded.mirrorTable,
         strategy = excluded.strategy,
         cursorColumn = excluded.cursorColumn,
         checkpoint = excluded.checkpoint,
         schemaFingerprint = excluded.schemaFingerprint,
         primaryKeyJson = excluded.primaryKeyJson,
         sourceRows = excluded.sourceRows,
         localRows = excluded.localRows,
         pulledRows = excluded.pulledRows,
         changedRows = excluded.changedRows,
         deletedRows = excluded.deletedRows,
         syncedAt = excluded.syncedAt`,
    )
    .run(
      table.schema,
      table.name,
      result.mirrorTable,
      result.strategy,
      result.cursorColumn,
      result.checkpoint,
      table.schemaFingerprint,
      JSON.stringify(table.primaryKey),
      result.sourceRows,
      result.localRows,
      result.pulledRows,
      result.changedRows,
      result.deletedRows,
      new Date().toISOString(),
    )
}

/**
 * Count records in one local mirror table.
 * @param database Local SQLite mirror.
 * @param table Source table descriptor.
 * @returns Exact local row count.
 */
function countMirrorRows(database: Database, table: SourceTable): number {
  const row = database
    .prepare<{ count: bigint | number }, []>(
      `SELECT count(*) AS count FROM ${quoteSqliteIdentifier(mirrorTableName(table))}`,
    )
    .get()
  return Number(row?.count ?? 0)
}

/**
 * Canonicalize nested values before key and row hashing.
 * @param value Arbitrary source value.
 * @returns JSON-safe value with stable object-key ordering.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) {
    return { type: 'bytes', base64: Buffer.from(value).toString('base64') }
  }
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }
  return value
}

/**
 * Limit persisted errors to one useful, bounded message.
 * @param error Unknown thrown value.
 * @returns Safe error text for the local run journal.
 */
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 2_000)
}
