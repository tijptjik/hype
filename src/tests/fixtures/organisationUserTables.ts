// NODE
import { readFileSync } from 'node:fs'
// TYPES
import type { DatabaseSync } from 'node:sqlite'

/**
 * Apply organisation policy and role provenance to isolated service fixtures.
 * @param sqlite - Database containing the fixture's organisation and role tables.
 * @returns Nothing after the production migration and its triggers are installed.
 * @remarks Accepts legacy tables and columns derived from the current app schema.
 */
export function createOrganisationUserTables(sqlite: DatabaseSync): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS breadlineImportIdentity (
    sourceUserId INTEGER PRIMARY KEY, userId TEXT, email TEXT
  )`)
  // Keep production triggers while accepting columns supplied by schema-derived fixtures.
  for (const statement of readFileSync(
    'migrations/0168_organisation_users.sql',
    'utf8',
  ).split('--> statement-breakpoint')) {
    const addedColumn = statement.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/)
    if (
      addedColumn &&
      sqlite
        .prepare(`PRAGMA table_info("${addedColumn[1]}")`)
        .all()
        .some(column => column.name === addedColumn[2])
    ) {
      continue
    }
    sqlite.exec(statement)
  }
}
