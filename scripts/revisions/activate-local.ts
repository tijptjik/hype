// RUNTIME
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { enrollLegacyRevisions, projectionHashes } from './enroll'

/** Atomically activates only the exact cohort already verified on a database copy.
 * @param database Explicit local SQLite database. @param cache Exact verified media cache.
 * @param rehearsal Successful enrollment receipt from the matching pre-activation snapshot.
 * @param output New private backup/activation receipt directory.
 * @returns Enrollment counts after creation cutover commits.
 * @remarks Coordinate external database refreshers before calling. SQLite holds a write lock across
 * drift verification, consistent backup, enrollment and activation. Remote databases are unsupported.
 * Missing legacy media remains explicitly excluded, matching the rehearsal's exact exception list.
 */
export async function activateLocalRevisions(
  database: string,
  cache: string,
  rehearsal: string,
  output: string,
): Promise<{ images: number; features: number; blocked: number }> {
  process.umask(0o077)
  const path = resolve(database),
    directory = resolve(output)
  if (
    ![resolve('.wrangler') + '/', resolve('.local') + '/', '/tmp/'].some(root =>
      path.startsWith(root),
    )
  )
    throw new Error(
      'Activation accepts only explicit local development or rehearsal files',
    )
  if (existsSync(directory)) throw new Error('Use a new activation evidence directory')
  const expected = JSON.parse(readFileSync(rehearsal, 'utf8'))
  assert.ok(
    ['verified', 'partial-verified'].includes(expected.status) && expected.features > 0,
    'A successful populated enrollment rehearsal is required',
  )
  assert.deepEqual(expected.before, expected.after, 'Rehearsal changed projections')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const domain = openSqliteDomain(path)
  let committed = false
  try {
    domain.sqlite.exec('BEGIN IMMEDIATE')
    assert.equal(
      (
        domain.sqlite
          .query('SELECT enabled FROM featureRevisionCreationPolicy WHERE singleton=1')
          .get() as { enabled: number }
      ).enabled,
      0,
      'Creation is already enabled',
    )
    assert.equal(
      (
        domain.sqlite.query('SELECT count(*) n FROM featureRevisionHead').get() as {
          n: number
        }
      ).n,
      0,
      'Activation expects the rehearsed unenrolled state',
    )
    assert.deepEqual(
      projectionHashes(domain),
      expected.before,
      'Database changed after rehearsal; capture and rehearse again',
    )
    const backup = spawnSync(
      'python3',
      [
        '-c',
        'import pathlib,sqlite3,sys; s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); t=sqlite3.connect(sys.argv[2]); s.backup(t); t.close(); s.close()',
        path,
        join(directory, 'before-activation.sqlite'),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(backup.status, 0, 'Consistent pre-activation backup failed')
    const receipt = join(directory, 'enrollment.json')
    const result = await enrollLegacyRevisions(path, cache, receipt, domain)
    const actual = JSON.parse(readFileSync(receipt, 'utf8'))
    assert.deepEqual(
      result,
      {
        images: expected.images,
        features: expected.features,
        blocked: expected.blocked,
      },
      'Enrollment cohort changed',
    )
    assert.deepEqual(actual.issues, expected.issues, 'Enrollment exceptions changed')
    domain.sqlite
      .query('UPDATE featureRevisionCreationPolicy SET enabled=1 WHERE singleton=1')
      .run()
    domain.sqlite.exec('COMMIT')
    committed = true
    writeFileSync(
      join(directory, 'receipt.json'),
      JSON.stringify(
        {
          status: 'activated-local',
          database: path,
          ...result,
          creationEnabled: true,
          projectionsUnchanged: true,
          remoteWrites: false,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    return result
  } catch (error) {
    if (domain.sqlite.inTransaction) domain.sqlite.exec('ROLLBACK')
    // A filesystem failure after COMMIT must never be reported as a database rollback.
    writeFileSync(
      join(directory, 'receipt.json'),
      JSON.stringify({
        status: committed ? 'committed-receipt-failed' : 'rolled-back',
        database: path,
        remoteWrites: false,
      }) + '\n',
      { mode: 0o600 },
    )
    throw error
  } finally {
    domain.close()
  }
}

if (import.meta.main) {
  const [database, cache, rehearsal, output] = process.argv.slice(2)
  if (!database || !cache || !rehearsal || !output)
    throw new Error(
      'Usage: activate-local.ts DATABASE MEDIA_CACHE REHEARSAL_RECEIPT NEW_DIRECTORY',
    )
  console.log(
    JSON.stringify(await activateLocalRevisions(database, cache, rehearsal, output)),
  )
}
