// BUN
import { Database } from 'bun:sqlite'
// CONTENT CONTRACT
import { canonicalContentTag } from '../../src/lib/i18n/contentRecords'

/** Audit stored locale identities without changing database contents.
 * @param databasePath Existing SQLite database path.
 * @returns Actual table constraints, locale counts and normalization collision counts.
 * @remarks Run before any locale-key migration. Reports counts, never content values.
 */
export function auditContentLocales(databasePath: string) {
  const db = new Database(databasePath, { readonly: true })
  const tables: Record<
    string,
    {
      sql: string
      locales: Record<string, number>
      collisions: number
      invalid: number
    }
  > = {}
  try {
    for (const table of ['featureI18n', 'featurePropertyI18n']) {
      const definition = db
        .query<{ sql: string }, [string]>('SELECT sql FROM sqlite_master WHERE name=?')
        .get(table)
      if (!definition) continue
      const report = {
        sql: definition.sql,
        locales: {} as Record<string, number>,
        collisions: 0,
        invalid: 0,
      }
      const seen = new Set<string>()
      for (const row of db
        .query<Record<string, string>, []>(`SELECT * FROM ${table}`)
        .all()) {
        report.locales[row.locale] = (report.locales[row.locale] ?? 0) + 1
        try {
          const identity = JSON.stringify([
            row.featureId,
            row.propertyId ?? null,
            canonicalContentTag(row.locale),
          ])
          if (seen.has(identity)) report.collisions++
          seen.add(identity)
        } catch {
          report.invalid++
        }
      }
      tables[table] = report
    }
    const locationMaps = { inspected: 0, collisions: 0, invalid: 0 }
    // Inspect immutable facts and accepted overrides independently, preserving their provenance.
    for (const [table, column] of [
      ['locationRevision', 'facts'],
      ['featureLocation', 'acceptedOverrides'],
    ] as const) {
      if (!db.query('SELECT 1 FROM sqlite_master WHERE name=?').get(table)) continue
      for (const row of db
        .query<Record<string, string>, []>(`SELECT ${column} FROM ${table}`)
        .all()) {
        const value = JSON.parse(row[column])
        const names = value?.common?.names ?? value?.names ?? {}
        locationMaps.inspected++
        const seen = new Set<string>()
        for (const locale of Object.keys(names)) {
          try {
            const canonical = canonicalContentTag(locale)
            if (seen.has(canonical)) locationMaps.collisions++
            seen.add(canonical)
          } catch {
            locationMaps.invalid++
          }
        }
      }
    }
    return { tables, locationMaps }
  } finally {
    db.close()
  }
}

if (import.meta.main) {
  if (!process.argv[2])
    throw new Error(
      'Usage: bun scripts/i18n/audit-content-locales.ts <existing.sqlite>',
    )
  const report = auditContentLocales(process.argv[2])
  console.log(JSON.stringify(report, null, 2))
  if (
    Object.values(report.tables).some(row => row.collisions || row.invalid) ||
    report.locationMaps.collisions ||
    report.locationMaps.invalid
  )
    process.exitCode = 1
}
