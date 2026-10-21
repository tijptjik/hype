// Refs #194. Local-only identity rehearsal; never modifies its input database.
// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openSqliteDomain } from './lib/sqlite-domain'
import {
  readLocationIdentityBaseline,
  captureMirroredLocationIdentityReview,
  acceptLocationIdentityReview,
} from '../../src/lib/db/services/locationIdentityReview'
import {
  captureLocationMergeReview,
  applyLocationMergeReview,
} from '../../src/lib/db/services/locationMerge'

/**
 * Rehearse one explicitly selected mirrored candidate against an existing Feature.
 * @returns Completion receipt after identity acceptance and effective-value preservation checks.
 * @remarks Requires independent establishment review; name/proximity alone is insufficient.
 * All decisions use an explicitly labelled rehearsal actor and remain in a new isolated copy.
 * A candidate already associated with Features is rejected to keep this evidence boundary narrow.
 */
async function main(): Promise<void> {
  const [input, output, featureId, ssId, reason] = process.argv.slice(2)
  if (!input || !output || !featureId || !ssId || !reason?.trim())
    throw new Error(
      'Usage: rehearse-identity-match.ts SOURCE.sqlite NEW_OUTPUT_DIRECTORY FEATURE_ID SS_ID REVIEW_REASON',
    )
  const directory = resolve(output)
  if (!directory.startsWith(resolve('.local/places') + '/') || existsSync(directory))
    throw new Error('Use a new private .local/places/ output directory')
  process.umask(0o077)
  mkdirSync(directory, { recursive: true })
  const database = resolve(directory, 'result.sqlite')
  const backup = spawnSync(
    'python3',
    [
      '-c',
      String.raw`import sqlite3,pathlib,sys
source=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
target=sqlite3.connect(sys.argv[2]);source.backup(target);target.close();source.close()`,
      resolve(input),
      database,
    ],
    { encoding: 'utf8' },
  )
  if (backup.status !== 0) throw new Error('Input snapshot failed: ' + backup.stderr)
  const inputHash = createHash('sha256').update(readFileSync(database)).digest('hex')
  const { db, sqlite, close } = openSqliteDomain(database)
  try {
    const target = sqlite
      .query(`SELECT p.id,p.ownerOrganisationId,p.state FROM featureLocation fp
      JOIN location p ON p.id=fp.locationId WHERE fp.featureId=?`)
      .get(featureId) as {
      id: string
      ownerOrganisationId: string | null
      state: string
    } | null
    assert.ok(target, 'Feature must already have an unresolved Location')
    assert.equal(target.state, 'unresolved')
    const source = sqlite
      .query(`SELECT p.id,p.ownerOrganisationId,r.id AS revisionId FROM location p
      JOIN locationRevision r ON r.locationId=p.id WHERE p.ssId=? AND p.state='linked'
      AND p.sourceAvailability='current' ORDER BY r.sequence DESC LIMIT 1`)
      .get(ssId) as {
      id: string
      ownerOrganisationId: string | null
      revisionId: string
    } | null
    assert.ok(source, 'Import the pinned canonical candidate before this rehearsal')
    assert.equal(
      (
        sqlite
          .query('SELECT count(*) AS n FROM featureLocation WHERE locationId=?')
          .get(source.id) as { n: number }
      ).n,
      0,
      'This rehearsal only absorbs unassociated mirrored candidates',
    )
    // Compare every Feature-owned table, including routing decisions, media and association history.
    const tables = (
      sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'feature%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(row => row.name)
    /** Capture ordered rows from trusted schema table names. @returns Per-table exact serialization. */
    const snapshot = (): Map<string, string> =>
      new Map(
        tables.map(table => [
          table,
          JSON.stringify(
            sqlite
              .query(`SELECT * FROM "${table.replaceAll('"', '""')}"`)
              .all()
              .map(row => JSON.stringify(row))
              .sort(),
          ),
        ]),
      )
    const before = snapshot()
    const actorId = 'system:isolated-identity-rehearsal'
    const baseline = await readLocationIdentityBaseline(
      db,
      target.id,
      target.ownerOrganisationId,
    )
    assert.ok(baseline)
    const reviewId = await captureMirroredLocationIdentityReview(
      db,
      baseline,
      source.revisionId,
      actorId,
    )
    assert.ok(reviewId)
    const acceptance = await acceptLocationIdentityReview(db, {
      locationId: target.id,
      ownerOrganisationId: target.ownerOrganisationId,
      reviewId,
      actorId,
      reason,
    })
    assert.equal(acceptance.status, 'merge-required')
    const merge = await captureLocationMergeReview(db, {
      locationId: target.id,
      identityReviewId: reviewId,
      ownerOrganisationId: target.ownerOrganisationId,
      sourceLocationId: source.id,
      sourceOwnerOrganisationId: source.ownerOrganisationId,
      actorId,
    })
    assert.equal(merge.status, 'ready')
    if (merge.status !== 'ready') throw new Error('Identity merge was not ready')
    assert.equal(merge.affectedFeatures, 0)
    const applied = await applyLocationMergeReview(db, {
      reviewId: merge.reviewId,
      locationId: target.id,
      ownerOrganisationId: target.ownerOrganisationId,
      sourceLocationId: source.id,
      sourceOwnerOrganisationId: source.ownerOrganisationId,
      actorId,
      reason,
    })
    assert.equal(applied.status, 'applied')
    // Reusing a consumed review must not create another identity transition or redirect.
    const identityTables = [
      'location',
      'locationRevision',
      'locationIdentityHistory',
      'locationIdentityReview',
    ]
    const acceptedRows = identityTables.map(table =>
      JSON.stringify(sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    )
    const replay = await applyLocationMergeReview(db, {
      reviewId: merge.reviewId,
      locationId: target.id,
      ownerOrganisationId: target.ownerOrganisationId,
      sourceLocationId: source.id,
      sourceOwnerOrganisationId: source.ownerOrganisationId,
      actorId,
      reason,
    })
    assert.equal(replay.status, 'conflict')
    assert.deepEqual(
      identityTables.map(table =>
        JSON.stringify(sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
      ),
      acceptedRows,
    )
    const after = snapshot()
    for (const table of tables)
      assert.equal(
        after.get(table),
        before.get(table),
        'Feature-owned data changed: ' + table,
      )
    const identity = sqlite
      .query('SELECT id,ssId,state FROM location WHERE id=?')
      .get(target.id) as { id: string; ssId: string; state: string }
    assert.deepEqual(identity, { id: target.id, ssId, state: 'linked' })
    assert.equal(
      (
        sqlite.query('SELECT state FROM location WHERE id=?').get(source.id) as {
          state: string
        }
      ).state,
      'redirect',
    )
    assert.deepEqual(sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(Object.values(sqlite.query('PRAGMA integrity_check').get()!)[0], 'ok')
    const receipt = {
      status: 'verified-isolated-identity-match',
      inputHash,
      featureId,
      ssId,
      retainedLocationId: target.id,
      absorbedLocationId: source.id,
      actorId,
      reason,
      identityReviewId: reviewId,
      mergeReviewId: merge.reviewId,
      unchangedFeatureTables: tables,
      integrity: 'ok',
      consumedReviewReplayUnchanged: true,
      sourceDatabaseModified: false,
      productionDecision: false,
    }
    writeFileSync(
      resolve(directory, 'receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { mode: 0o600 },
    )
    console.log(
      JSON.stringify({
        status: receipt.status,
        unchangedFeatureTables: tables.length,
        integrity: 'ok',
        productionDecision: false,
      }),
    )
  } finally {
    close()
  }
}
await main()
