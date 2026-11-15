// NODE
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { updateCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import {
  assignLocationOperator,
  assignLocationPremisesMap,
} from '../../src/lib/db/services/locationOperator'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { premisesMaps } from '../../src/lib/indoor/registry'
import { mtrLocationTitles } from './mtr-location-titles'

/** Migrate and update the exact imported MTR station cohort in one local transaction.
 * @returns Nothing; prints counts and the retained backup path.
 * @remarks Offline by default. --apply-local requires managed local D1 and never targets
 * production. Existing facts, source evidence, locales and identity keys are preserved.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const applyLocal = args.includes('--apply-local')
  const [database, actorId] = args.filter(arg => arg !== '--apply-local')
  if (!database || !actorId?.trim())
    throw new Error('Usage: apply-mtr-operators.ts DATABASE ACTOR_ID [--apply-local]')
  const path = realpathSync(database)
  const managedLocal =
    existsSync('.wrangler/state/v3/d1') &&
    path.startsWith(`${realpathSync('.wrangler/state/v3/d1')}/`)
  if (managedLocal !== applyLocal)
    throw new Error('Use an offline copy, or --apply-local for managed local D1')
  const catalogue = JSON.parse(
    readFileSync('src/lib/routing/mtr-catalog.json', 'utf8'),
  ) as {
    stations: { id: string }[]
  }
  const expected = new Set(
    catalogue.stations.map(station => `mtr-station:${station.id}`),
  )
  const domain = openSqliteDomain(path)
  const migrations = ['0253_location_operator.sql', '0254_location_premises_map.sql']
  let renamed = 0
  const backup = resolve(
    '.local/places/mtr-onboarding',
    `before-operators-${Date.now()}.sqlite`,
  )
  try {
    // Hold the write lock across the backup, schema change and all station updates.
    domain.sqlite.exec('BEGIN IMMEDIATE')
    mkdirSync(resolve('.local/places/mtr-onboarding'), { recursive: true })
    writeFileSync(backup, domain.sqlite.serialize(), { flag: 'wx' })
    const rows = domain.sqlite
      .query(`SELECT d.sourceKey,l.id,l.matchingType,l.state,l.ssId,
      l.ownerOrganisationId,r.id revisionId,r.contentHash,r.facts
      FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
      JOIN locationRevisionContent r ON r.locationId=l.id
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
      WHERE d.sourceKey LIKE 'mtr-station:%'`)
      .all() as {
      sourceKey: string
      id: string
      matchingType: string
      state: string
      ssId: string | null
      ownerOrganisationId: string | null
      revisionId: string
      contentHash: string
      facts: string
    }[]
    if (rows.length !== expected.size || rows.some(row => !expected.has(row.sourceKey)))
      throw new Error('Imported station cohort differs from the reviewed MTR catalogue')
    if (
      rows.some(
        row =>
          row.matchingType !== 'premises' ||
          row.state !== 'unresolved' ||
          row.ssId ||
          row.ownerOrganisationId,
      )
    )
      throw new Error('Station is no longer a shared draft; review before changing it')
    for (const migration of migrations) {
      if (
        !domain.sqlite.query('SELECT 1 FROM d1_migrations WHERE name=?').get(migration)
      ) {
        domain.sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
        domain.sqlite.query('INSERT INTO d1_migrations(name) VALUES (?)').run(migration)
      }
    }
    for (const row of rows) {
      const facts = readLocationFacts(row.facts)
      const names = mtrLocationTitles(facts.names)
      if (names.en !== facts.names.en) {
        const version = await updateCanonicalLocationDraft(domain.db, {
          locationId: row.id,
          sourceRevisionId: row.revisionId,
          expectedDraftVersion: row.contentHash,
          facts: { ...facts, names },
        })
        if (!version) throw new Error(`Station changed during update: ${row.sourceKey}`)
        renamed++
      }
      await assignLocationOperator(domain.db, {
        locationId: row.id,
        operatorId: 'mtr-corporation',
        referenceCode: row.sourceKey.slice('mtr-station:'.length),
        actorId,
      })
      const map = premisesMaps.find(
        entry => entry.code === row.sourceKey.slice('mtr-station:'.length),
      )
      if (map)
        await assignLocationPremisesMap(domain.db, {
          locationId: row.id,
          mapId: map.id,
          actorId,
        })
    }
    domain.sqlite.exec('COMMIT')
    console.log(
      JSON.stringify({
        stations: rows.length,
        renamed,
        operator: 'mtr-corporation',
        backup,
      }),
    )
  } catch (error) {
    if (domain.sqlite.inTransaction) domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
