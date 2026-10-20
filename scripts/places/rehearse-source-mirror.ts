// Refs #194. Full local source API and bulk mirror integration; no remote mutation.
// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openLocalSourceApi } from './lib/local-source-api'
import { openSqliteDomain } from './lib/sqlite-domain'
import { mirrorSourceSubset } from './lib/mirror-source-subset'
import { readMirrorCheckpoint } from './lib/mirror-checkpoint'
import { parsePlacePublication } from '../../src/lib/places/publication'

/**
 * Rehearse bulk hydration and checkpoint upgrade against the real local source API.
 * @returns Private completion evidence after full pagination, restart and preservation checks.
 * @remarks Input databases are read-only. All HYPE writes go to a new isolated backup.
 * Source shards must be sealed and CURRENT compatible with the checked-out API schema.
 */
async function main(): Promise<void> {
  const [input, sourceDirectory, currentPath, publicationPath, checkpointPath, output] =
    process.argv.slice(2)
  if (
    !input ||
    !sourceDirectory ||
    !currentPath ||
    !publicationPath ||
    !checkpointPath ||
    !output
  )
    throw new Error(
      'Usage: rehearse-source-mirror.ts HYPE.sqlite SOURCE_DIRECTORY CURRENT.sqlite PUBLICATION.json CHECKPOINT.json NEW_OUTPUT_DIRECTORY',
    )
  const directory = resolve(output)
  assert.ok(
    directory.startsWith(resolve('.local/places') + '/') && !existsSync(directory),
    'Use a new private Places directory',
  )
  process.umask(0o077)
  mkdirSync(directory, { recursive: true })
  const database = resolve(directory, 'result.sqlite')
  const backup = spawnSync(
    'python3',
    [
      '-c',
      String.raw`import pathlib,sqlite3,sys
s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
t=sqlite3.connect(sys.argv[2]);s.backup(t);t.close();s.close()`,
      input,
      database,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(backup.status, 0, backup.stderr)
  const { pin } = parsePlacePublication(
    JSON.parse(readFileSync(publicationPath, 'utf8')),
  )
  const legacy = JSON.parse(readFileSync(checkpointPath, 'utf8'))
  const checkpoint = readMirrorCheckpoint(legacy, pin, legacy.filters)
  writeFileSync(
    resolve(directory, 'input-checkpoint.json'),
    JSON.stringify(legacy, null, 2) + '\n',
    { mode: 0o600 },
  )
  const target = openSqliteDomain(database)
  let source: ReturnType<typeof openLocalSourceApi> | undefined
  try {
    source = openLocalSourceApi(sourceDirectory, currentPath)
    const tables = (
      target.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'feature%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(row => row.name)
    /** Snapshot unchanged Feature-owned rows, including routing and association history. @returns Sorted row bytes. */
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
    const final = await mirrorSourceSubset({
      db: target.db,
      client: source.client,
      checkpoint,
      saveCheckpoint: next => {
        const path = resolve(directory, 'checkpoint.json')
        writeFileSync(path + '.tmp', JSON.stringify(next, null, 2) + '\n', {
          mode: 0o600,
        })
        renameSync(path + '.tmp', path)
      },
      report: progress => console.log(JSON.stringify(progress)),
    })
    assert.equal(final.complete, true)
    assert.equal(final.offset, final.total)
    assert.deepEqual(snapshot(), before)
    const requests = source.requests.length
    const revisionsBeforeReplay = target.sqlite
      .query('SELECT * FROM placeRevision ORDER BY placeId,sequence')
      .all()
    await mirrorSourceSubset({
      db: target.db,
      client: source.client,
      checkpoint: final,
      saveCheckpoint: () => {
        throw new Error('Completed checkpoint unexpectedly changed')
      },
      report: () => {},
    })
    assert.equal(source.requests.length, requests)
    assert.deepEqual(
      target.sqlite
        .query('SELECT * FROM placeRevision ORDER BY placeId,sequence')
        .all(),
      revisionsBeforeReplay,
    )
    const addressStates: Record<string, number> = {}
    for (const id of final.revisions) {
      const row = target.sqlite
        .query('SELECT facts,payload FROM placeRevision WHERE id=?')
        .get(id) as { facts: string; payload: string }
      assert.ok(row)
      const facts = JSON.parse(row.facts),
        payload = JSON.parse(row.payload)
      const state =
        facts.location.address.status === 'resolved'
          ? 'resolved'
          : (payload.addressHydration?.reason ?? 'no-reference')
      addressStates[state] = (addressStates[state] ?? 0) + 1
    }
    assert.deepEqual(target.sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(
      Object.values(target.sqlite.query('PRAGMA integrity_check').get()!)[0],
      'ok',
    )
    const receipt = {
      status: 'verified-bulk-source-mirror',
      oldVersion: legacy.version,
      version: final.version,
      processed: final.offset,
      sourceRequests: requests,
      addressStates,
      unchangedFeatureTables: tables.length,
      completedReplayRequests: 0,
      integrity: 'ok',
      primaryModified: false,
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
