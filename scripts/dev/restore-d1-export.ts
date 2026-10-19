// NODE
import { existsSync, readFileSync } from 'node:fs'
// SQLITE
import { Database } from 'bun:sqlite'

/** D1 schema metadata exported separately from the explicit canonical table dump. */
interface SchemaObject {
  type: string
  name: string
  sql: string | null
}

/**
 * Reconstruct a local database from a canonical-table D1 export and its schema metadata.
 * @param exportPath SQL export excluding virtual tables and their shadow tables.
 * @param schemaPath Wrangler JSON response for sqlite_schema.
 * @param outputPath New local SQLite file; existing files are never overwritten.
 * @returns Canonical table count and rebuilt search document count.
 * @remarks D1's explicit-table export omits indexes, views and triggers. Restore those
 * from the same production schema inventory, then rebuild the known derived FTS index.
 * This function performs no network requests and never writes a remote database.
 */
export function restoreD1Export(
  exportPath: string,
  schemaPath: string,
  outputPath: string,
): { tables: number; searchDocuments: number } {
  if (existsSync(outputPath)) throw new Error('Restore output already exists')
  const response = JSON.parse(readFileSync(schemaPath, 'utf8')) as Array<{
    success: boolean
    results: SchemaObject[]
  }>
  if (!response[0]?.success || !Array.isArray(response[0].results))
    throw new Error('Invalid schema response')
  const objects = response[0].results
  const virtual = objects.filter(row => /CREATE VIRTUAL TABLE/i.test(row.sql ?? ''))
  if (virtual.some(row => row.name !== 'featureSearchFts'))
    throw new Error('Unknown virtual table: provide an explicit rebuild strategy')
  const db = new Database(outputPath, { create: true, strict: true })
  try {
    // Load canonical rows before triggers so importing cannot synthesize duplicate data.
    db.exec('PRAGMA foreign_keys=OFF; BEGIN')
    db.exec(readFileSync(exportPath, 'utf8'))
    for (const row of virtual) db.exec(row.sql as string)
    for (const kind of ['index', 'view']) {
      for (const row of objects.filter(row => row.type === kind && row.sql))
        db.exec(row.sql as string)
    }
    if (virtual.length) {
      db.exec(
        'INSERT INTO featureSearchFts(rowid, grams) SELECT id, grams FROM featureSearchContent',
      )
    }
    for (const row of objects.filter(row => row.type === 'trigger' && row.sql))
      db.exec(row.sql as string)
    db.exec('COMMIT; PRAGMA foreign_keys=ON')
    const integrity = db
      .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
      .all()
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
      throw new Error('Restored database failed integrity check')
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Restored database contains foreign-key violations')
    // Prove every explicit schema object was restored, not just its table data.
    for (const row of objects.filter(row => row.sql && !row.name.startsWith('_cf_'))) {
      if (
        !db
          .query('SELECT 1 FROM sqlite_schema WHERE type=? AND name=?')
          .get(row.type, row.name)
      )
        throw new Error(`Missing restored schema object: ${row.type} ${row.name}`)
    }
    return {
      tables: objects.filter(row => row.type === 'table').length,
      searchDocuments: virtual.length
        ? (db
            .query<{ count: number }, []>(
              'SELECT count(*) AS count FROM featureSearchFts',
            )
            .get()?.count ?? 0)
        : 0,
    }
  } finally {
    db.close()
  }
}

if (import.meta.main) {
  const [exportPath, schemaPath, outputPath] = process.argv.slice(2)
  if (!exportPath || !schemaPath || !outputPath)
    throw new Error(
      'Usage: restore-d1-export.ts canonical.sql schema.json new-local.sqlite',
    )
  process.umask(0o077)
  console.log(restoreD1Export(exportPath, schemaPath, outputPath))
}
