// Refs #194. See spec/breadline/proposal/places-migration-runbook.md.
// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { preserveReviewedFeature } from './lib/preserve-reviewed-feature'
import { openSqliteDomain } from './lib/sqlite-domain'
import { equalPlaceValue } from '../../src/lib/places/baseline'
import {
  readPlaceIdentityBaseline,
  captureMirroredPlaceIdentityReview,
  acceptPlaceIdentityReview,
} from '../../src/lib/db/services/placeIdentityReview'
import {
  capturePlaceMergeReview,
  applyPlaceMergeReview,
} from '../../src/lib/db/services/placeMerge'

/**
 * Apply an independently reviewed and successfully rehearsed identity to primary local state.
 * @returns A private applied receipt, or a non-mutating description without --apply-local.
 * @remarks Only real paths beneath the repository's local D1 state are accepted. Both
 * identities and all Feature-owned rows must still equal the rehearsed baseline. This
 * identity acceptance never adopts source facts/location. The separate preserving mode
 * switches revision inputs with unchanged effective values. No remote/deployment operation exists.
 */
async function main(): Promise<void> {
  const [input, rehearsal, flag] = process.argv.slice(2)
  if (
    !input ||
    !rehearsal ||
    (flag && !['--apply-local', '--preserve-feature-values'].includes(flag))
  )
    throw new Error(
      'Usage: apply-reviewed-identity.ts LOCAL_D1.sqlite REHEARSAL_DIRECTORY [--apply-local | --preserve-feature-values]',
    )
  const database = realpathSync(input)
  assert.ok(
    database.startsWith(realpathSync('.wrangler/state/v3/d1') + '/') &&
      database.endsWith('.sqlite'),
    'Only primary local D1 files are accepted',
  )
  const directory = realpathSync(rehearsal)
  assert.ok(
    directory.startsWith(realpathSync('.local/places') + '/'),
    'Expected private Places rehearsal',
  )
  const receipt = JSON.parse(readFileSync(resolve(directory, 'receipt.json'), 'utf8'))
  assert.equal(receipt.status, 'verified-isolated-identity-match')
  assert.equal(receipt.consumedReviewReplayUnchanged, true)
  if (!flag) {
    console.log(
      JSON.stringify({
        action: 'reviewed-local-identity',
        database,
        featureId: receipt.featureId,
        ssId: receipt.ssId,
        applies: false,
      }),
    )
    return
  }
  if (flag === '--preserve-feature-values') {
    await preserveReviewedFeature(database, directory)
    return
  }
  const backupPath = resolve(directory, 'before-primary-apply.sqlite')
  const appliedPath = resolve(directory, 'primary-apply.json')
  assert.ok(
    !existsSync(backupPath) && !existsSync(appliedPath),
    'Retained application evidence exists; inspect it before any retry',
  )
  const evidence = openSqliteDomain(resolve(directory, 'result.sqlite'))
  const target = openSqliteDomain(database)
  try {
    const review = evidence.sqlite
      .query('SELECT baseline FROM placeIdentityReview WHERE id=?')
      .get(receipt.identityReviewId) as { baseline: string }
    const merge = evidence.sqlite
      .query('SELECT sourceBaseline,sourceRevisionId FROM placeMergeReview WHERE id=?')
      .get(receipt.mergeReviewId) as {
      sourceBaseline: string
      sourceRevisionId: string
    }
    assert.ok(review && merge)
    const baseline = JSON.parse(review.baseline)
    const sourceBaseline = JSON.parse(merge.sourceBaseline)
    // Current identity/revision/history must still match the evidence selected before rehearsal.
    assert.ok(
      equalPlaceValue(
        await readPlaceIdentityBaseline(
          target.db,
          baseline.placeId,
          baseline.expectedOwnerProjectId,
        ),
        baseline,
      ),
      'Target identity changed since rehearsal',
    )
    assert.ok(
      equalPlaceValue(
        await readPlaceIdentityBaseline(
          target.db,
          sourceBaseline.placeId,
          sourceBaseline.expectedOwnerProjectId,
        ),
        sourceBaseline,
      ),
      'Source identity changed since rehearsal',
    )
    const tableNames = target.sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'feature%' ORDER BY name",
      )
      .all() as { name: string }[]
    /** Read sorted row bytes from an inspected table name. @param connection Local connection. @param name Trusted schema name. @returns Exact serialized rows. */
    const rows = (connection: typeof target, name: string): string =>
      JSON.stringify(
        connection.sqlite
          .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
          .all()
          .map(row => JSON.stringify(row))
          .sort(),
      )
    const before = new Map(tableNames.map(({ name }) => [name, rows(target, name)]))
    for (const { name } of tableNames)
      assert.equal(
        before.get(name),
        rows(evidence, name),
        'Feature data changed since rehearsal: ' + name,
      )
    // A consistent full backup precedes every primary write, including retained review creation.
    const backup = spawnSync(
      'python3',
      [
        '-c',
        String.raw`import pathlib,sqlite3,sys
s=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True)
t=sqlite3.connect(sys.argv[2]);s.backup(t);t.close();s.close()`,
        database,
        backupPath,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(backup.status, 0, backup.stderr)
    const actorId = 'system:reviewed-place-migration'
    const reason = `Local application of reviewed rehearsal ${receipt.identityReviewId}: ${receipt.reason}`
    const identityReviewId = await captureMirroredPlaceIdentityReview(
      target.db,
      baseline,
      merge.sourceRevisionId,
      actorId,
    )
    assert.ok(identityReviewId)
    assert.equal(
      (
        await acceptPlaceIdentityReview(target.db, {
          placeId: baseline.placeId,
          ownerProjectId: baseline.expectedOwnerProjectId,
          reviewId: identityReviewId,
          actorId,
          reason,
        })
      ).status,
      'merge-required',
    )
    const scope = {
      placeId: baseline.placeId,
      ownerProjectId: baseline.expectedOwnerProjectId,
      sourcePlaceId: sourceBaseline.placeId,
      sourceOwnerProjectId: sourceBaseline.expectedOwnerProjectId,
      actorId,
    }
    const prepared = await capturePlaceMergeReview(target.db, {
      ...scope,
      identityReviewId,
    })
    assert.equal(prepared.status, 'ready')
    if (prepared.status !== 'ready') throw new Error('Merge no longer ready')
    assert.equal(prepared.affectedFeatures, 0)
    const result = await applyPlaceMergeReview(target.db, {
      ...scope,
      reviewId: prepared.reviewId,
      reason,
    })
    assert.equal(result.status, 'applied')
    for (const { name } of tableNames)
      assert.equal(
        rows(target, name),
        before.get(name),
        'Feature data changed: ' + name,
      )
    const identity = target.sqlite
      .query('SELECT ssId,state FROM place WHERE id=?')
      .get(baseline.placeId)
    assert.deepEqual(identity, { ssId: receipt.ssId, state: 'linked' })
    assert.deepEqual(target.sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(
      Object.values(target.sqlite.query('PRAGMA integrity_check').get()!)[0],
      'ok',
    )
    writeFileSync(
      appliedPath,
      JSON.stringify(
        {
          status: 'applied-primary-local',
          featureId: receipt.featureId,
          ssId: receipt.ssId,
          retainedPlaceId: baseline.placeId,
          identityReviewId,
          mergeReviewId: prepared.reviewId,
          actorId,
          reason,
          unchangedFeatureTables: tableNames.length,
          integrity: 'ok',
          productionModified: false,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    console.log(
      JSON.stringify({
        status: 'applied-primary-local',
        unchangedFeatureTables: tableNames.length,
        integrity: 'ok',
        productionModified: false,
      }),
    )
  } finally {
    target.close()
    evidence.close()
  }
}
await main()
