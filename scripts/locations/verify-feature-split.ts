import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
// NODE
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// DOMAIN
import { equalLocationValue } from '../../src/lib/locations/baseline'
import { resolveFeatureLocation } from '../../src/lib/locations/resolve'
import {
  LocationFactsSchema,
  FeatureLocationOverridesSchema,
} from '../../src/lib/locations/validation'
// TYPES
import type { UnresolvedFeatureSplit } from '../../src/lib/locations/migrationPlan'

/**
 * Verify a completed split against its untouched local baseline and private manifest.
 * @returns Count-only evidence; throws on row drift, missing associations or broken integrity.
 * @remarks Read-only SQLite connections. Feature-owned rows are compared in both directions;
 * actual revision facts/overrides are resolved independently of the application receipt.
 */
function main(): void {
  const [manifestPath, baselinePath, resultPath] = process.argv.slice(2)
  if (!manifestPath || !baselinePath || !resultPath)
    throw new Error(
      'Usage: verify-feature-split.ts manifest.json baseline.sqlite result.sqlite',
    )
  const document = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (document.version !== 1 || !Array.isArray(document.plans))
    throw new Error('Invalid split manifest')
  const plans = document.plans as UnresolvedFeatureSplit[]
  const db = new Database(resultPath, { readonly: true })
  try {
    db.exec('PRAGMA query_only=ON')
    db.query('ATTACH DATABASE ? AS baseline').run(resolve(baselinePath))
    // Only fixed trusted table names/quoted schema columns enter the comparison SQL.
    for (const table of [
      'feature',
      'featureI18n',
      'featureProperty',
      'featurePropertyI18n',
    ]) {
      const columns = (
        db.query(`PRAGMA baseline.table_info(${table})`).all() as { name: string }[]
      )
        .map(row => `"${row.name.replaceAll('"', '""')}"`)
        .join(',')
      if (!columns) throw new Error(`Missing baseline table: ${table}`)
      const difference = db
        .query(`SELECT 1 FROM (
        SELECT ${columns} FROM main.${table} EXCEPT SELECT ${columns} FROM baseline.${table}
      ) UNION ALL SELECT 1 FROM (
        SELECT ${columns} FROM baseline.${table} EXCEPT SELECT ${columns} FROM main.${table}
      ) LIMIT 1`)
        .get()
      const count = db
        .query(
          `SELECT (SELECT count(*) FROM main.${table})=(SELECT count(*) FROM baseline.${table}) AS same`,
        )
        .get() as { same: number }
      if (difference || !count.same) throw new Error(`Feature data changed: ${table}`)
    }
    // Existing Location records must remain intact; only one new row per split is expected.
    for (const table of [
      'location',
      'locationRevision',
      'featureLocation',
      'featureLocationHistory',
    ]) {
      const changed = db
        .query(
          `SELECT 1 FROM (SELECT * FROM baseline.${table} EXCEPT SELECT * FROM main.${table}) LIMIT 1`,
        )
        .get()
      const added = db
        .query(
          `SELECT (SELECT count(*) FROM main.${table})-(SELECT count(*) FROM baseline.${table}) AS n`,
        )
        .get() as { n: number }
      if (changed || added.n !== plans.length)
        throw new Error(`Unexpected migration changes: ${table}`)
    }
    const query =
      db.query(`SELECT fp.locationId,fp.factsRevisionId,fp.locationRevisionId,fp.acceptedOverrides AS overrides,
      p.ownerOrganisationId,p.state,p.ssId,r.facts,r.origin,
      (SELECT count(*) FROM featureLocationHistory h WHERE h.featureId=fp.featureId) AS historyCount
      FROM featureLocation fp JOIN location p ON p.id=fp.locationId
      JOIN locationRevision r ON r.id=fp.factsRevisionId AND r.locationId=fp.locationId
      WHERE fp.featureId=?`)
    for (const plan of plans) {
      const row = query.get(plan.featureId) as {
        locationId: string
        factsRevisionId: string
        locationRevisionId: string
        overrides: string
        ownerOrganisationId: string
        state: string
        ssId: string | null
        facts: string
        origin: string
        historyCount: number
      } | null
      if (
        !row ||
        row.locationId !== plan.locationId ||
        row.factsRevisionId !== plan.revisionId ||
        row.locationRevisionId !== plan.revisionId ||
        row.ownerOrganisationId !== (db.query('SELECT organisationId FROM project WHERE id=?').get(plan.projectId) as { organisationId: string } | null)?.organisationId ||
        row.state !== 'unresolved' ||
        row.ssId !== null ||
        row.origin !== 'local' ||
        row.historyCount !== 1
      )
        throw new Error('Split identity, ownership or history mismatch')
      const facts = readLocationFacts(row.facts)
      const overrides = FeatureLocationOverridesSchema.parse(JSON.parse(row.overrides))
      if (
        !equalLocationValue(
          resolveFeatureLocation(facts, facts.location, overrides),
          resolveFeatureLocation(plan.facts, plan.facts.location, plan.overrides),
        )
      )
        throw new Error('Effective split values changed')
    }
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign key violations')
    const integrity = db.query('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (integrity.integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed')
    console.log(
      JSON.stringify({
        verified: plans.length,
        originalFeatureRowsUnchanged: true,
        effectiveValuesPreserved: true,
        oneHistoryPerSplit: true,
        integrity: 'ok',
        foreignKeyViolations: 0,
      }),
    )
  } finally {
    db.close()
  }
}
main()
