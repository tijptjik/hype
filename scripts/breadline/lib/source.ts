// NODE
import { createHash } from 'node:crypto'

// BUN
import type { SQL } from 'bun'

// TYPES
import type {
  IncrementalAssessment,
  SourceColumn,
  SourceForeignKey,
  SourceSchemaReport,
  SourceTable,
  SourceTrigger,
} from './types'

interface TableRow {
  schema: string
  table: string
  estimatedRows: string | number
}

interface PrimaryKeyRow {
  schema: string
  table: string
  column: string
  position: string | number
}

interface ForeignKeyRow {
  schema: string
  table: string
  name: string
  column: string
  referencedSchema: string
  referencedTable: string
  referencedColumn: string
  position: string | number
}

const CURSOR_COLUMN_CANDIDATES = [
  'last_updated_at',
  'last_modified_at',
  'updated_at',
  'modified_at',
  'updatedat',
  'modifiedat',
] as const

const TIMESTAMP_TYPES = new Set([
  'timestamp with time zone',
  'timestamp without time zone',
])

/**
 * Quote a trusted PostgreSQL identifier discovered from the system catalogue.
 * @param identifier Identifier to quote.
 * @returns Safely double-quoted identifier.
 */
export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

/**
 * Build a qualified PostgreSQL table reference.
 * @param table Source table descriptor.
 * @returns Quoted schema and table name.
 */
export function qualifiedSourceTable(
  table: Pick<SourceTable, 'schema' | 'name'>,
): string {
  return `${quotePostgresIdentifier(table.schema)}.${quotePostgresIdentifier(table.name)}`
}

/**
 * Choose the safest available pull strategy from source keys and timestamps.
 * @param columns Source columns.
 * @param primaryKey Ordered primary-key columns.
 * @returns Incremental capability and its rationale.
 */
export function assessIncrementalStrategy(
  columns: SourceColumn[],
  primaryKey: string[],
  triggers: SourceTrigger[] = [],
): IncrementalAssessment {
  if (primaryKey.length === 0) {
    return {
      strategy: 'snapshot-replace',
      cursorColumn: null,
      cursorMaintenanceEvidence: 'not-applicable',
      reason: 'No primary key is available for stable upserts or delete detection.',
      capturesHardDeletes: true,
    }
  }

  const cursor = CURSOR_COLUMN_CANDIDATES.map(candidate =>
    columns.find(column => column.name.toLowerCase() === candidate),
  ).find(
    (column): column is SourceColumn =>
      column !== undefined && TIMESTAMP_TYPES.has(column.dataType.toLowerCase()),
  )

  if (!cursor) {
    return {
      strategy: 'snapshot-replace',
      cursorColumn: null,
      cursorMaintenanceEvidence: 'not-applicable',
      reason: 'A primary key exists, but there is no supported modification timestamp.',
      capturesHardDeletes: true,
    }
  }

  const cursorName = cursor.name.toLowerCase()
  const maintenanceTrigger = triggers.find(trigger =>
    `${trigger.name}\n${trigger.definition}\n${trigger.functionName}\n${trigger.functionDefinition}`
      .toLowerCase()
      .includes(cursorName),
  )

  return {
    strategy: 'incremental-upsert-with-key-reconciliation',
    cursorColumn: cursor.name,
    cursorMaintenanceEvidence: maintenanceTrigger
      ? `Trigger ${maintenanceTrigger.name} references ${cursor.name}.`
      : `No source trigger references ${cursor.name}; verify that every writer maintains it.`,
    reason: cursor.nullable
      ? `Rows use ${cursor.name} as a high-water mark; rows with a null cursor are re-read on every run.`
      : `Rows use ${cursor.name} as a high-water mark with an overlap window.`,
    capturesHardDeletes: true,
  }
}

/**
 * Create a stable fingerprint for the source shape that affects mirroring.
 * @param table Source table without its fingerprint.
 * @returns SHA-256 schema fingerprint.
 */
export function createSchemaFingerprint(
  table: Omit<SourceTable, 'schemaFingerprint'>,
): string {
  const payload = {
    columns: table.columns.map(column => ({
      name: column.name,
      dataType: column.dataType,
      udtName: column.udtName,
      nullable: column.nullable,
      ordinalPosition: column.ordinalPosition,
    })),
    primaryKey: table.primaryKey,
    triggers: table.triggers,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

/**
 * Inspect source tables, columns, keys, and incremental capabilities.
 * @param source Connected PostgreSQL client.
 * @param schemas Schemas to inspect.
 * @returns Serializable schema report without row payloads or credentials.
 */
export async function inspectSourceSchema(
  source: SQL,
  schemas: string[],
): Promise<SourceSchemaReport> {
  const schemaArray = source.array(schemas, 'TEXT')
  const [
    identityRows,
    tableRows,
    columnRows,
    primaryKeyRows,
    foreignKeyRows,
    triggerRows,
  ] = await Promise.all([
    source.unsafe<Array<{ databaseName: string; serverVersion: string }>>(
      `SELECT current_database() AS "databaseName",
                current_setting('server_version') AS "serverVersion"`,
    ),
    source.unsafe<TableRow[]>(
      `SELECT namespace.nspname AS "schema",
                relation.relname AS "table",
                GREATEST(relation.reltuples, 0)::bigint::text AS "estimatedRows"
           FROM pg_class AS relation
           JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE relation.relkind IN ('r', 'p')
            AND namespace.nspname = ANY($1::text[])
          ORDER BY namespace.nspname, relation.relname`,
      [schemaArray],
    ),
    source.unsafe<SourceColumn[]>(
      `SELECT column_info.table_schema AS "schema",
                column_info.table_name AS "table",
                column_info.column_name AS "name",
                column_info.data_type AS "dataType",
                column_info.udt_name AS "udtName",
                column_info.is_nullable = 'YES' AS nullable,
                column_info.column_default AS "defaultValue",
                column_info.ordinal_position AS "ordinalPosition"
           FROM information_schema.columns AS column_info
           JOIN information_schema.tables AS table_info
             ON table_info.table_schema = column_info.table_schema
            AND table_info.table_name = column_info.table_name
          WHERE table_info.table_type = 'BASE TABLE'
            AND column_info.table_schema = ANY($1::text[])
          ORDER BY column_info.table_schema,
                   column_info.table_name,
                   column_info.ordinal_position`,
      [schemaArray],
    ),
    source.unsafe<PrimaryKeyRow[]>(
      `SELECT namespace.nspname AS "schema",
                relation.relname AS "table",
                attribute.attname AS "column",
                key_column.ordinality AS position
           FROM pg_index AS index_info
           JOIN pg_class AS relation ON relation.oid = index_info.indrelid
           JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
           CROSS JOIN LATERAL unnest(index_info.indkey)
             WITH ORDINALITY AS key_column(attribute_number, ordinality)
           JOIN pg_attribute AS attribute
             ON attribute.attrelid = relation.oid
            AND attribute.attnum = key_column.attribute_number
          WHERE index_info.indisprimary
            AND namespace.nspname = ANY($1::text[])
          ORDER BY namespace.nspname, relation.relname, key_column.ordinality`,
      [schemaArray],
    ),
    source.unsafe<ForeignKeyRow[]>(
      `SELECT source_namespace.nspname AS "schema",
                source_relation.relname AS "table",
                constraint_info.conname AS "name",
                source_attribute.attname AS "column",
                target_namespace.nspname AS "referencedSchema",
                target_relation.relname AS "referencedTable",
                target_attribute.attname AS "referencedColumn",
                source_key.ordinality AS position
           FROM pg_constraint AS constraint_info
           JOIN pg_class AS source_relation
             ON source_relation.oid = constraint_info.conrelid
           JOIN pg_namespace AS source_namespace
             ON source_namespace.oid = source_relation.relnamespace
           JOIN pg_class AS target_relation
             ON target_relation.oid = constraint_info.confrelid
           JOIN pg_namespace AS target_namespace
             ON target_namespace.oid = target_relation.relnamespace
           CROSS JOIN LATERAL unnest(constraint_info.conkey)
             WITH ORDINALITY AS source_key(attribute_number, ordinality)
           JOIN LATERAL unnest(constraint_info.confkey)
             WITH ORDINALITY AS target_key(attribute_number, ordinality)
             ON target_key.ordinality = source_key.ordinality
           JOIN pg_attribute AS source_attribute
             ON source_attribute.attrelid = source_relation.oid
            AND source_attribute.attnum = source_key.attribute_number
           JOIN pg_attribute AS target_attribute
             ON target_attribute.attrelid = target_relation.oid
            AND target_attribute.attnum = target_key.attribute_number
          WHERE constraint_info.contype = 'f'
            AND source_namespace.nspname = ANY($1::text[])
          ORDER BY source_namespace.nspname,
                   source_relation.relname,
                   constraint_info.conname,
                   source_key.ordinality`,
      [schemaArray],
    ),
    source.unsafe<
      Array<
        SourceTrigger & {
          schema: string
          table: string
        }
      >
    >(
      `SELECT namespace.nspname AS "schema",
                relation.relname AS "table",
                trigger_info.tgname AS "name",
                pg_get_triggerdef(trigger_info.oid, true) AS "definition",
                procedure.proname AS "functionName",
                pg_get_functiondef(procedure.oid) AS "functionDefinition"
           FROM pg_trigger AS trigger_info
           JOIN pg_class AS relation ON relation.oid = trigger_info.tgrelid
           JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
           JOIN pg_proc AS procedure ON procedure.oid = trigger_info.tgfoid
          WHERE NOT trigger_info.tgisinternal
            AND namespace.nspname = ANY($1::text[])
          ORDER BY namespace.nspname, relation.relname, trigger_info.tgname`,
      [schemaArray],
    ),
  ])

  const identity = identityRows[0]
  if (!identity) throw new Error('The source database did not return its identity')

  const tables = tableRows.map(tableRow => {
    const columns = columnRows.filter(
      column => column.schema === tableRow.schema && column.table === tableRow.table,
    )
    const primaryKey = primaryKeyRows
      .filter(row => row.schema === tableRow.schema && row.table === tableRow.table)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map(row => row.column)

    const foreignKeyGroups = Map.groupBy(
      foreignKeyRows.filter(
        row => row.schema === tableRow.schema && row.table === tableRow.table,
      ),
      row => row.name,
    )
    const foreignKeys: SourceForeignKey[] = [...foreignKeyGroups.entries()].map(
      ([name, rows]) => {
        const ordered = rows.sort(
          (left, right) => Number(left.position) - Number(right.position),
        )
        const first = ordered[0]
        if (!first) throw new Error(`Foreign key ${name} has no columns`)
        return {
          name,
          columns: ordered.map(row => row.column),
          referencedSchema: first.referencedSchema,
          referencedTable: first.referencedTable,
          referencedColumns: ordered.map(row => row.referencedColumn),
        }
      },
    )
    const triggers = triggerRows
      .filter(row => row.schema === tableRow.schema && row.table === tableRow.table)
      .map(({ name, definition, functionName, functionDefinition }) => ({
        name,
        definition,
        functionName,
        functionDefinition,
      }))
    const incremental = assessIncrementalStrategy(columns, primaryKey, triggers)
    const withoutFingerprint: Omit<SourceTable, 'schemaFingerprint'> = {
      schema: tableRow.schema,
      name: tableRow.table,
      estimatedRows: Number(tableRow.estimatedRows),
      columns,
      primaryKey,
      foreignKeys,
      triggers,
      incremental,
    }
    return {
      ...withoutFingerprint,
      schemaFingerprint: createSchemaFingerprint(withoutFingerprint),
    }
  })

  return {
    inspectedAt: new Date().toISOString(),
    databaseName: identity.databaseName,
    serverVersion: identity.serverVersion,
    schemas,
    tables,
  }
}

/**
 * Read the transaction timestamp used as an incremental upper bound.
 * @param source Source transaction client.
 * @returns ISO-8601 timestamp.
 */
export async function readSourceSnapshotTime(source: SQL): Promise<string> {
  const rows = await source.unsafe<Array<{ snapshotAt: Date | string }>>(
    `SELECT transaction_timestamp() AS "snapshotAt"`,
  )
  const value = rows[0]?.snapshotAt
  if (!value) throw new Error('Could not read the source transaction timestamp')
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * Count rows in a source table within the current source snapshot.
 * @param source Source transaction client.
 * @param table Source table descriptor.
 * @returns Exact row count.
 */
export async function countSourceRows(
  source: SQL,
  table: SourceTable,
): Promise<number> {
  const rows = await source.unsafe<Array<{ count: string | number }>>(
    `SELECT count(*)::text AS count FROM ${qualifiedSourceTable(table)}`,
  )
  return Number(rows[0]?.count ?? 0)
}

/** Options for one paged source-row query. */
export interface ReadSourceRowsOptions {
  offset: number
  limit: number
  lowerCursor?: string
  upperCursor?: string
}

/**
 * Read one deterministic page of source rows.
 * @param source Source transaction client.
 * @param table Source table descriptor.
 * @param options Page and optional incremental-window settings.
 * @returns Source rows as named objects.
 */
export async function readSourceRows(
  source: SQL,
  table: SourceTable,
  options: ReadSourceRowsOptions,
): Promise<Array<Record<string, unknown>>> {
  const orderColumns =
    table.primaryKey.length > 0
      ? table.primaryKey.map(quotePostgresIdentifier).join(', ')
      : 'ctid'
  const cursor = table.incremental.cursorColumn
  if (options.lowerCursor && options.upperCursor && cursor) {
    const quotedCursor = quotePostgresIdentifier(cursor)
    return await source.unsafe<Array<Record<string, unknown>>>(
      `SELECT *
         FROM ${qualifiedSourceTable(table)}
        WHERE (${quotedCursor} IS NULL OR ${quotedCursor} >= $1)
          AND (${quotedCursor} IS NULL OR ${quotedCursor} <= $2)
        ORDER BY ${quotedCursor} NULLS FIRST, ${orderColumns}
        LIMIT $3 OFFSET $4`,
      [options.lowerCursor, options.upperCursor, options.limit, options.offset],
    )
  }

  return await source.unsafe<Array<Record<string, unknown>>>(
    `SELECT *
       FROM ${qualifiedSourceTable(table)}
      ORDER BY ${orderColumns}
      LIMIT $1 OFFSET $2`,
    [options.limit, options.offset],
  )
}

/**
 * Read one page containing only source primary keys for delete reconciliation.
 * @param source Source transaction client.
 * @param table Source table descriptor with a primary key.
 * @param offset Page offset.
 * @param limit Maximum rows to return.
 * @returns Key-only source rows.
 */
export async function readSourceKeys(
  source: SQL,
  table: SourceTable,
  offset: number,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (table.primaryKey.length === 0) return []
  const keyColumns = table.primaryKey.map(quotePostgresIdentifier).join(', ')
  return await source.unsafe<Array<Record<string, unknown>>>(
    `SELECT ${keyColumns}
       FROM ${qualifiedSourceTable(table)}
      ORDER BY ${keyColumns}
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}
