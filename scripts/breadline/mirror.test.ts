// BUN
import type { SQL } from 'bun'
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'

// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// BREADLINE
import {
  applyIncrementalRows,
  applySnapshotRows,
  initializeMirrorMetadata,
  mirrorTableName,
  quoteSqliteIdentifier,
  syncBreadlineMirror,
} from './lib/mirror'
import { assessIncrementalStrategy, createSchemaFingerprint } from './lib/source'

// TYPES
import type { SourceColumn, SourceTable } from './lib/types'

const databases: Database[] = []
const temporaryDirectories: string[] = []

class FakeBreadlineSource {
  rows: Array<Record<string, unknown>> = []
  incrementalRows: Array<Record<string, unknown>> = []
  snapshotAt = new Date('2026-09-13T00:00:00.000Z')

  /** Return the schema-array helper unchanged for catalogue tests. */
  array(values: string[]): string[] {
    return values
  }

  /** Execute a callback against this repeatable fake source snapshot. */
  async begin<T>(_options: string, callback: (source: SQL) => Promise<T>): Promise<T> {
    return await callback(this as unknown as SQL)
  }

  /**
   * Return catalogue or row results for the query issued by the sync implementation.
   * @param query PostgreSQL query text.
   * @param values Bound query values.
   * @returns Query-shaped fake rows.
   */
  async unsafe<T>(query: string, values: unknown[] = []): Promise<T> {
    if (query.includes('SET LOCAL TIME ZONE')) return [] as T
    if (query.includes('current_database()')) {
      return [{ databaseName: 'breadline', serverVersion: 'test' }] as T
    }
    if (query.includes('FROM pg_class AS relation')) {
      return [{ schema: 'public', table: 'donor', estimatedRows: '2' }] as T
    }
    if (query.includes('FROM information_schema.columns')) {
      return createTestTable().columns as T
    }
    if (query.includes('FROM pg_index AS index_info')) {
      return [{ schema: 'public', table: 'donor', column: 'id', position: 1 }] as T
    }
    if (query.includes('FROM pg_constraint AS constraint_info')) return [] as T
    if (query.includes('FROM pg_trigger AS trigger_info')) return [] as T
    if (query.includes('transaction_timestamp()')) {
      return [{ snapshotAt: this.snapshotAt }] as T
    }
    if (query.includes('count(*)::text AS count')) {
      return [{ count: String(this.rows.length) }] as T
    }

    const limit = Number(values.at(-2))
    const offset = Number(values.at(-1))
    if (query.includes('SELECT "id"')) {
      return this.rows.slice(offset, offset + limit).map(row => ({ id: row.id })) as T
    }
    if (query.includes('SELECT *')) {
      const rows = query.includes('WHERE (') ? this.incrementalRows : this.rows
      return rows.slice(offset, offset + limit) as T
    }
    throw new Error(`Unhandled fake query: ${query}`)
  }
}

/**
 * Create a representative source-table descriptor for mirror tests.
 * @returns A keyed source table with a modification cursor.
 */
function createTestTable(): SourceTable {
  const columns: SourceColumn[] = [
    {
      schema: 'public',
      table: 'donor',
      name: 'id',
      dataType: 'integer',
      udtName: 'int4',
      nullable: false,
      defaultValue: null,
      ordinalPosition: 1,
    },
    {
      schema: 'public',
      table: 'donor',
      name: 'last_updated_at',
      dataType: 'timestamp with time zone',
      udtName: 'timestamptz',
      nullable: false,
      defaultValue: null,
      ordinalPosition: 2,
    },
    {
      schema: 'public',
      table: 'donor',
      name: 'amount',
      dataType: 'numeric',
      udtName: 'numeric',
      nullable: true,
      defaultValue: null,
      ordinalPosition: 3,
    },
    {
      schema: 'public',
      table: 'donor',
      name: 'metadata',
      dataType: 'jsonb',
      udtName: 'jsonb',
      nullable: true,
      defaultValue: null,
      ordinalPosition: 4,
    },
  ]
  const incremental = assessIncrementalStrategy(columns, ['id'])
  const withoutFingerprint: Omit<SourceTable, 'schemaFingerprint'> = {
    schema: 'public',
    name: 'donor',
    estimatedRows: 2,
    columns,
    primaryKey: ['id'],
    foreignKeys: [],
    triggers: [],
    incremental,
  }
  return {
    ...withoutFingerprint,
    schemaFingerprint: createSchemaFingerprint(withoutFingerprint),
  }
}

/**
 * Open an initialized in-memory mirror and retain it for cleanup.
 * @returns In-memory SQLite database.
 */
function createMirror(): Database {
  const database = new Database(':memory:', { strict: true, safeIntegers: true })
  initializeMirrorMetadata(database)
  databases.push(database)
  return database
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Breadline source mirror', () => {
  it('uses incremental sync only with a primary key and modification timestamp', () => {
    const table = createTestTable()

    expect(table.incremental).toMatchObject({
      strategy: 'incremental-upsert-with-key-reconciliation',
      cursorColumn: 'last_updated_at',
      capturesHardDeletes: true,
    })
    expect(assessIncrementalStrategy(table.columns, []).strategy).toBe(
      'snapshot-replace',
    )
    expect(
      assessIncrementalStrategy(
        table.columns.filter(column => column.name !== 'last_updated_at'),
        ['id'],
      ).strategy,
    ).toBe('snapshot-replace')
  })

  it('preserves exact numeric and structured values in a full snapshot', () => {
    const database = createMirror()
    const table = createTestTable()
    const timestamp = '2026-09-13T00:00:00.000Z'

    applySnapshotRows(
      database,
      table,
      [
        {
          id: 1,
          last_updated_at: new Date(timestamp),
          amount: '9007199254740993.123456',
          metadata: { z: 2, a: [true, 1] },
        },
      ],
      timestamp,
    )

    const row = database
      .prepare<
        {
          id: bigint
          lastUpdatedAt: string
          amount: string
          metadata: string
          sourceKey: string
        },
        []
      >(
        `SELECT id,
                last_updated_at AS lastUpdatedAt,
                amount,
                metadata,
                _breadline_source_key AS sourceKey
           FROM ${quoteSqliteIdentifier(mirrorTableName(table))}`,
      )
      .get()

    expect(row).toEqual({
      id: 1n,
      lastUpdatedAt: timestamp,
      amount: '9007199254740993.123456',
      metadata: '{"a":[true,1],"z":2}',
      sourceKey: '[1]',
    })
  })

  it('upserts timestamp-window changes and reconciles hard deletes', () => {
    const database = createMirror()
    const table = createTestTable()
    const firstTimestamp = '2026-09-13T00:00:00.000Z'
    const secondTimestamp = '2026-09-13T01:00:00.000Z'
    applySnapshotRows(
      database,
      table,
      [
        { id: 1, last_updated_at: firstTimestamp, amount: '1', metadata: null },
        { id: 2, last_updated_at: firstTimestamp, amount: '2', metadata: null },
      ],
      firstTimestamp,
    )

    const result = applyIncrementalRows(
      database,
      table,
      [
        { id: 1, last_updated_at: secondTimestamp, amount: '10', metadata: null },
        { id: 3, last_updated_at: secondTimestamp, amount: '3', metadata: null },
      ],
      [{ id: 1 }, { id: 3 }],
      secondTimestamp,
    )
    const rows = database
      .prepare<{ id: bigint; amount: string }, []>(
        `SELECT id, amount
           FROM ${quoteSqliteIdentifier(mirrorTableName(table))}
          ORDER BY id`,
      )
      .all()

    expect(result).toEqual({ pulledRows: 2, deletedRows: 1 })
    expect(rows).toEqual([
      { id: 1n, amount: '10' },
      { id: 3n, amount: '3' },
    ])
  })

  it('journals material upserts and deletion tombstones across sync runs', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-breadline-sync-'))
    temporaryDirectories.push(directory)
    const mirrorPath = join(directory, 'mirror.sqlite')
    const source = new FakeBreadlineSource()
    source.rows = [
      {
        id: 1,
        last_updated_at: '2026-09-13T00:00:00.000Z',
        amount: '1',
        metadata: null,
      },
      {
        id: 2,
        last_updated_at: '2026-09-13T00:00:00.000Z',
        amount: '2',
        metadata: null,
      },
    ]
    const options = {
      mirrorPath,
      schemas: ['public'],
      tables: [],
      mode: 'auto' as const,
      batchSize: 100,
      overlapSeconds: 300,
    }

    const first = await syncBreadlineMirror(source as unknown as SQL, options)
    expect(first[0]).toMatchObject({ pulledRows: 2, changedRows: 2, deletedRows: 0 })

    source.snapshotAt = new Date('2026-09-13T01:00:00.000Z')
    const retainedRow = source.rows[0]
    if (!retainedRow) throw new Error('Expected the retained source fixture')
    const addedRow = {
      id: 3,
      last_updated_at: '2026-09-13T01:00:00.000Z',
      amount: '3',
      metadata: null,
    }
    source.rows = [retainedRow, addedRow]
    source.incrementalRows = [retainedRow, addedRow]
    const second = await syncBreadlineMirror(source as unknown as SQL, options)
    expect(second[0]).toMatchObject({ pulledRows: 2, changedRows: 1, deletedRows: 1 })

    const database = new Database(mirrorPath, { readonly: true, safeIntegers: true })
    databases.push(database)
    const changes = database
      .prepare<{ sourceKey: string; operation: string; rowHash: string }, []>(
        `SELECT sourceKey, operation, rowHash
           FROM _breadline_change
          ORDER BY sequence`,
      )
      .all()
    expect(changes.map(change => [change.sourceKey, change.operation])).toEqual([
      ['[1]', 'upsert'],
      ['[2]', 'upsert'],
      ['[3]', 'upsert'],
      ['[2]', 'delete'],
    ])
  })
})
