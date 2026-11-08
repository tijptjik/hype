import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
// Refs #194. Real source API hydration from sealed exports; no remote writes.
// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
// DOMAIN
import { openLocalSourceApi } from './lib/local-source-api'
import { openSqliteDomain } from './lib/sqlite-domain'
import { hydrateSaanSeoiPlaceAddress } from '../../src/lib/locations/sourceAddress'
import { persistSaanSeoiPlace } from '../../src/lib/db/services/locationSource'
// TYPES
import type { SaanSeoiPlaceProjection } from '../../src/lib/locations/saanseoi'

/**
 * Resolve a retained Location's exact Address dependency using the local source API implementation.
 * @returns Private evidence and optional guarded local persistence receipt.
 * @remarks Default mode writes only a private report. --apply-local backs up HYPE,
 * persists one source revision and verifies unchanged Feature data. It never adopts
 * that revision into Features, changes source exports or opens a network listener.
 */
async function main(): Promise<void> {
  const [input, locationId, sourceDirectory, currentPath, output, flag] =
    process.argv.slice(2)
  if (
    !input ||
    !locationId ||
    !sourceDirectory ||
    !currentPath ||
    !output ||
    (flag && flag !== '--apply-local')
  )
    throw new Error(
      'Usage: hydrate-local-place.ts LOCAL_D1.sqlite LOCATION_ID SOURCE_DIRECTORY CURRENT.sqlite NEW_OUTPUT_DIRECTORY [--apply-local]',
    )
  const database = realpathSync(input)
  assert.ok(
    database.startsWith(realpathSync('.wrangler/state/v3/d1') + '/') &&
      database.endsWith('.sqlite'),
    'Expected local D1 database',
  )
  const directory = resolve(output)
  assert.ok(
    directory.startsWith(realpathSync('.local/places') + '/') && !existsSync(directory),
    'Use a new private Locations output directory',
  )
  process.umask(0o077)
  mkdirSync(directory, { recursive: true })
  const target = openSqliteDomain(database)
  let source: ReturnType<typeof openLocalSourceApi> | undefined
  try {
    source = openLocalSourceApi(sourceDirectory, currentPath)
    const row = target.sqlite
      .query(`SELECT r.* FROM locationRevision r JOIN location p ON p.id=r.locationId
      WHERE p.id=? AND p.state='linked' AND p.sourceAvailability='current' AND r.origin='saanseoi' AND r.ssId=p.ssId
      AND r.sequence=(SELECT max(sequence) FROM locationRevision WHERE locationId=p.id)`)
      .get(locationId) as {
      id: string
      ssId: string
      apiVersion: string
      releaseId: string
      snapshotId: string
      facts: string
      payload: string
    } | null
    assert.ok(row, 'Location needs a current source-backed latest revision')
    const { issues = [], ...payload } = JSON.parse(row.payload)
    const projection: SaanSeoiPlaceProjection = {
      ssId: row.ssId,
      apiVersion: row.apiVersion,
      releaseId: row.releaseId,
      snapshotId: row.snapshotId,
      facts: readLocationFacts(row.facts),
      payload,
      issues,
    }
    const hydrated = await hydrateSaanSeoiPlaceAddress(source.client, projection)
    writeFileSync(
      resolve(directory, 'projection.json'),
      JSON.stringify(hydrated, null, 2) + '\n',
      { mode: 0o600 },
    )
    assert.equal(
      hydrated.facts.location.address.status,
      'resolved',
      'Address remains unresolved; inspect private evidence',
    )
    assert.deepEqual(hydrated.payload.resource, projection.payload.resource)
    assert.deepEqual(hydrated.facts.names, projection.facts.names)
    assert.deepEqual(hydrated.facts.brands, projection.facts.brands)
    assert.deepEqual(hydrated.facts.phoneNumber, projection.facts.phoneNumber)
    assert.deepEqual(
      hydrated.facts.location.geometry,
      projection.facts.location.geometry,
    )
    let revisionId: string | null = null
    let unchangedFeatureTables = 0
    if (flag) {
      const tables = (
        target.sqlite
          .query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'feature%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map(row => row.name)
      /** Snapshot Feature-owned data before source persistence. @returns Sorted row bytes. */
      const snapshot = (): string[] =>
        tables.map(table =>
          JSON.stringify(
            target.sqlite
              .query(`SELECT * FROM "${table.replaceAll('"', '""')}"`)
              .all()
              .map(row => JSON.stringify(row))
              .sort(),
          ),
        )
      const before = snapshot()
      const backup = spawnSync(
        'python3',
        [
          '-c',
          String.raw`import pathlib,sqlite3,sys
s=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True)
t=sqlite3.connect(sys.argv[2]);s.backup(t);t.close();s.close()`,
          database,
          resolve(directory, 'before-apply.sqlite'),
        ],
        { encoding: 'utf8' },
      )
      assert.equal(backup.status, 0, backup.stderr)
      const result = await persistSaanSeoiPlace(
        target.db,
        hydrated,
        sql`EXISTS(SELECT 1 FROM location p WHERE p.id=${locationId} AND p.ssId=${row.ssId} AND p.state='linked' AND p.sourceAvailability='current'
          AND (SELECT id FROM locationRevision WHERE locationId=p.id ORDER BY sequence DESC LIMIT 1)=${row.id})`,
      )
      assert.equal(result.locationId, locationId)
      revisionId = result.revisionId
      const count = target.sqlite
        .query('SELECT count(*) AS n FROM locationRevision')
        .get()
      assert.deepEqual(await persistSaanSeoiPlace(target.db, hydrated), result)
      assert.deepEqual(
        target.sqlite.query('SELECT count(*) AS n FROM locationRevision').get(),
        count,
      )
      assert.deepEqual(snapshot(), before)
      unchangedFeatureTables = tables.length
      assert.deepEqual(target.sqlite.query('PRAGMA foreign_key_check').all(), [])
      assert.equal(
        Object.values(target.sqlite.query('PRAGMA integrity_check').get()!)[0],
        'ok',
      )
    }
    const receipt = {
      status: flag ? 'hydrated-primary-local' : 'verified-address-hydration',
      locationId,
      previousRevisionId: row.id,
      revisionId,
      addressId: hydrated.facts.location.address.address2dId,
      addressSnapshotId: hydrated.facts.location.address.addressSnapshotId,
      requests: source.requests.length,
      unchangedFeatureTables,
      sourceModified: false,
      productionModified: false,
    }
    writeFileSync(
      resolve(directory, 'receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { mode: 0o600 },
    )
    console.log(JSON.stringify(receipt))
  } finally {
    source?.close()
    target.close()
  }
}
await main()
