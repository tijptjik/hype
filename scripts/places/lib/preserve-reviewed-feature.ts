// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { openSqliteDomain } from './sqlite-domain'
import { getAcceptedFeaturePlace } from '../../../src/lib/db/services/place'
import { relinkFeaturePlace } from '../../../src/lib/db/services/placeRelink'

/**
 * Begin source inheritance after a reviewed local identity transition, retaining current values.
 * @param database Explicit local target already validated by the command.
 * @param directory Private successful identity application evidence.
 * @returns Verified count-only receipt after backup and guarded reassociation.
 * @remarks The source revision must be the exact accepted identity revision and still
 * latest. Existing explicit corrections survive; equal inherited fields remain inheritable.
 */
export async function preserveReviewedFeature(
  database: string,
  directory: string,
): Promise<void> {
  const application = JSON.parse(
    readFileSync(resolve(directory, 'primary-apply.json'), 'utf8'),
  )
  assert.equal(application.status, 'applied-primary-local')
  const backupPath = resolve(directory, 'before-preserving-reassociation.sqlite')
  const receiptPath = resolve(directory, 'preserving-reassociation.json')
  assert.ok(
    !existsSync(backupPath) && !existsSync(receiptPath),
    'Retained reassociation evidence exists; inspect before retry',
  )
  const target = openSqliteDomain(database)
  try {
    const identity = target.sqlite
      .query(`SELECT h.sourceRevisionId FROM placeIdentityHistory h
      JOIN place p ON p.id=h.placeId WHERE h.reviewId=? AND h.placeId=? AND h.ssId=?
      AND p.ssId=h.ssId AND p.state='linked' AND p.sourceAvailability='current'
      AND NOT EXISTS (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id)
      AND h.sourceRevisionId=(SELECT id FROM placeRevision WHERE placeId=p.id ORDER BY sequence DESC LIMIT 1)`)
      .get(
        application.identityReviewId,
        application.retainedPlaceId,
        application.ssId,
      ) as { sourceRevisionId: string } | null
    assert.ok(identity, 'Identity or latest source revision changed since acceptance')
    const feature = target.sqlite
      .query('SELECT projectId,modifiedAt FROM feature WHERE id=?')
      .get(application.featureId) as { projectId: string; modifiedAt: string } | null
    assert.ok(feature)
    const before = await getAcceptedFeaturePlace(
      target.db,
      application.featureId,
      feature.projectId,
    )
    assert.ok(before)
    assert.equal(before.placeId, application.retainedPlaceId)
    assert.notEqual(
      before.factsRevisionId,
      identity.sourceRevisionId,
      'Source is already associated',
    )
    const tables = (
      target.sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'feature%' OR name LIKE 'place%') ORDER BY name",
        )
        .all() as { name: string }[]
    )
      .map(row => row.name)
      .filter(name => !['featurePlace', 'featurePlaceHistory'].includes(name))
    /** Capture domain rows outside the single association/history write. @returns Sorted table bytes. */
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
    const rowsBefore = snapshot()
    const associationsBefore = target.sqlite
      .query('SELECT * FROM featurePlace WHERE featureId != ? ORDER BY featureId')
      .all(application.featureId)
    const historiesBefore = target.sqlite
      .query('SELECT * FROM featurePlaceHistory ORDER BY id')
      .all()
    // Retain a complete recovery copy before changing the Feature's accepted revision inputs.
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
    const input = {
      featureId: application.featureId,
      projectId: feature.projectId,
      placeId: application.retainedPlaceId,
      revisionId: identity.sourceRevisionId,
      expectedFeatureModifiedAt: feature.modifiedAt,
      expectedRevision: before.revision,
      actorId: 'system:reviewed-place-migration',
    }
    const result = await relinkFeaturePlace(target.db, input)
    assert.equal(result.status, 'linked')
    const after = await getAcceptedFeaturePlace(
      target.db,
      application.featureId,
      feature.projectId,
    )
    assert.ok(after)
    assert.deepEqual(after.effective, before.effective)
    assert.equal(after.placeId, before.placeId)
    assert.equal(after.factsRevisionId, identity.sourceRevisionId)
    assert.equal(after.locationRevisionId, identity.sourceRevisionId)
    assert.deepEqual(snapshot(), rowsBefore)
    assert.deepEqual(
      target.sqlite
        .query('SELECT * FROM featurePlace WHERE featureId != ? ORDER BY featureId')
        .all(application.featureId),
      associationsBefore,
    )
    const historiesAfter = target.sqlite
      .query('SELECT * FROM featurePlaceHistory ORDER BY id')
      .all()
    assert.equal(historiesAfter.length, historiesBefore.length + 1)
    assert.deepEqual(historiesAfter.slice(0, -1), historiesBefore)
    assert.equal((await relinkFeaturePlace(target.db, input)).status, 'conflict')
    assert.deepEqual(
      target.sqlite.query('SELECT * FROM featurePlaceHistory ORDER BY id').all(),
      historiesAfter,
    )
    assert.deepEqual(target.sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(
      Object.values(target.sqlite.query('PRAGMA integrity_check').get()!)[0],
      'ok',
    )
    const overrides = JSON.parse(
      (
        target.sqlite
          .query('SELECT overrides FROM featurePlace WHERE featureId=?')
          .get(application.featureId) as { overrides: string }
      ).overrides,
    )
    const receipt = {
      status: 'preserved-reviewed-source-association',
      featureId: application.featureId,
      placeId: before.placeId,
      sourceRevisionId: identity.sourceRevisionId,
      previousRevision: before.revision,
      revision: after.revision,
      overrideFields: Object.keys(overrides),
      phoneMode: overrides.phoneNumber?.mode ?? 'inherit',
      effectiveValuesUnchanged: true,
      otherAssociationsUnchanged: true,
      newHistoryRows: 1,
      unchangedTables: tables.length,
      staleReplayRefused: true,
      integrity: 'ok',
      productionModified: false,
    }
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify(receipt))
  } finally {
    target.close()
  }
}
