// DRIZZLE
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'

// DB
import * as schema from '../../src/lib/db/schema'

/**
 * Quote a SQLite identifier without treating SQL expressions as column names.
 * @param name - Table, column, or index name.
 * @returns An escaped SQLite identifier.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * Export schema DDL without connecting to a database or loading credentials.
 * @returns SQL describing the current Drizzle tables and indexes.
 * @remarks Drizzle Kit 0.31 splits index expressions at commas during migration
 * generation. Render indexes from the unsquashed snapshot to preserve expressions.
 */
async function exportSchemaSQL(): Promise<string> {
  const empty = await generateSQLiteDrizzleJson({})
  const snapshot = await generateSQLiteDrizzleJson(schema)
  const statements = await generateSQLiteMigration(empty, snapshot)

  // Preserve generated table constraints while replacing the broken index rendering.
  const tables = statements.filter(
    statement => !/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(statement),
  )
  const indexes = Object.values(snapshot.tables).flatMap(table =>
    Object.values(table.indexes).map(index => {
      const columns = index.columns.map(column =>
        Object.hasOwn(table.columns, column) ? quoteIdentifier(column) : column,
      )
      const where = index.where ? ` WHERE ${index.where}` : ''
      return `CREATE ${index.isUnique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(index.name)} ON ${quoteIdentifier(table.name)} (${columns.join(', ')})${where};`
    }),
  )
  return [...tables, ...indexes].join('\n\n')
}

process.stdout.write(`${await exportSchemaSQL()}\n`)
