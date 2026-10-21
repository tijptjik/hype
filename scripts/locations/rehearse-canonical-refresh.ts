// Refs #194. Real source transport and durable refresh on an isolated destination.
// NODE
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openLocalSourceApi } from './lib/local-source-api'
import { openSqliteDomain } from './lib/sqlite-domain'
import { refreshLocations } from '../../src/lib/locations/refresh'

/**
 * Exercise monthly canonical discovery, scanning and adoption against real source exports.
 * @returns Completion evidence after durable processing, integrity and idle replay checks.
 * @remarks The input HYPE database is backed up read-only; only the new isolated copy
 * changes. Source exports are sealed and read-only. No routing or publisher-feed
 * dispatch is invoked, and no new establishment identities are accepted.
 */
async function main(): Promise<void> {
  const [input, sourceDirectory, currentPath, output] = process.argv.slice(2)
  if (!input || !sourceDirectory || !currentPath || !output)
    throw new Error(
      'Usage: rehearse-canonical-refresh.ts HYPE.sqlite SOURCE_DIRECTORY CURRENT.sqlite NEW_OUTPUT_DIRECTORY',
    )
  const directory = resolve(output)
  assert.ok(directory.startsWith(resolve('.local/places') + '/') && !existsSync(directory))
  process.umask(0o077)
  mkdirSync(directory, { recursive: true })
  const database = resolve(directory, 'result.sqlite')
  const backup = spawnSync('python3', ['-c', String.raw`import pathlib,sqlite3,sys
s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
t=sqlite3.connect(sys.argv[2]);s.backup(t);t.close();s.close()`, input, database], {
    encoding: 'utf8',
  })
  assert.equal(backup.status, 0, backup.stderr)
  const inputSha256 = createHash('sha256').update(readFileSync(database)).digest('hex')
  const target = openSqliteDomain(database)
  let source: ReturnType<typeof openLocalSourceApi> | undefined
  try {
    source = openLocalSourceApi(sourceDirectory, currentPath)
    /** Snapshot ordered table rows for exact local preservation checks. @param table Trusted table name. @returns Stable row bytes. */
    const snapshot = (table: string): string =>
      JSON.stringify(target.sqlite.query(`SELECT * FROM "${table.replaceAll('"', '""')}"`)
        .all().map(row => JSON.stringify(row)).sort())
    const tables = (target.sqlite.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as { name: string }[]).map(row => row.name)
    const before = new Map(tables.map(table => [table, snapshot(table)]))
    const identities = target.sqlite.query(
      'SELECT id,ssId,state,ownerOrganisationId FROM location ORDER BY id',
    ).all()
    const overrides = target.sqlite.query(
      'SELECT featureId,locationId,overrides FROM featureLocation ORDER BY featureId',
    ).all()
    const state = target.sqlite.query('SELECT phase,checkedMonth FROM locationRefresh WHERE id=1').get() as {
      phase: string
      checkedMonth: string | null
    }
    assert.equal(state.phase, 'idle', 'Input must not contain an unfinished refresh run')
    assert.notEqual(state.checkedMonth, new Date().toISOString().slice(0, 7),
      'Use an input whose monthly refresh has not already run')
    const outcomes: Record<string, number> = {}
    let completed = false
    // Execute bounded production steps without replacing publication reads or pagination.
    for (let step = 0; step < 10000; step++) {
      const result = await refreshLocations(target.binding, source.client)
      outcomes[result] = (outcomes[result] ?? 0) + 1
      if (step % 100 === 0 || result !== 'scanned')
        console.log(JSON.stringify({ step, result, requests: source.requests.length }))
      if (result === 'complete') {
        completed = true
        break
      }
      assert.ok(['started', 'scanned', 'ingested', 'assessed', 'processed', 'review'].includes(result),
        `Refresh did not make progress: ${result}`)
      const phase = target.sqlite.query('SELECT phase FROM locationRefresh WHERE id=1').get() as { phase: string }
      assert.notEqual(phase.phase, 'review', 'Publication requires external review')
    }
    assert.ok(completed, 'Refresh exceeded the bounded rehearsal budget')
    const changedTables = tables.filter(table => before.get(table) !== snapshot(table))
    // Source refresh must preserve reviewed identities, associations and explicit corrections.
    assert.deepEqual(target.sqlite.query(
      'SELECT id,ssId,state,ownerOrganisationId FROM location ORDER BY id',
    ).all(), identities)
    assert.deepEqual(target.sqlite.query(
      'SELECT featureId,locationId,overrides FROM featureLocation ORDER BY featureId',
    ).all(), overrides)
    for (const table of ['locationIdentityHistory', 'locationIdentityReview'])
      assert.equal(snapshot(table), before.get(table))
    const beforeReplay = tables.map(snapshot)
    const requests = source.requests.length
    assert.equal(await refreshLocations(target.binding, source.client), 'idle')
    assert.equal(source.requests.length, requests)
    assert.deepEqual(tables.map(snapshot), beforeReplay)
    assert.deepEqual(target.sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(Object.values(target.sqlite.query('PRAGMA integrity_check').get()!)[0], 'ok')
    const receipt = {
      status: 'verified-canonical-refresh',
      inputSha256,
      outcomes,
      requests,
      changedTables,
      state: target.sqlite.query('SELECT phase,scanMode,nextOffset,total,failures FROM locationRefresh WHERE id=1').get(),
      items: target.sqlite.query('SELECT status,COUNT(*) AS count FROM locationRefreshItem GROUP BY status').all(),
      features: target.sqlite.query("SELECT json_extract(value,'$.outcome') AS outcome,json_extract(value,'$.geometryChanged') AS geometryChanged,COUNT(*) AS count FROM locationRefreshItem,json_each(outcomes) GROUP BY outcome,geometryChanged").all(),
      idleReplayUnchanged: true,
      identitiesAndOverridesUnchanged: true,
      integrity: 'ok',
      primaryModified: false,
    }
    writeFileSync(resolve(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
    console.log(JSON.stringify(receipt))
  } finally {
    source?.close()
    target.close()
  }
}
await main()
