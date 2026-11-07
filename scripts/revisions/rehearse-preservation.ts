// RUNTIME
import assert from 'node:assert/strict'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { preserveReviewedFeature } from '../locations/lib/preserve-reviewed-feature'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
  acceptLocationIdentityReview,
} from '../../src/lib/db/services/locationIdentityReview'

/** Rehearses reviewed source adoption on a new database copy using labelled synthetic source evidence.
 * @param input Enrolled snapshot; never modified. @param output New private evidence directory.
 * @returns Nothing after the preservation helper verifies lineage, attribution, value equality and stale replay.
 * @remarks Synthetic identity acceptance is confined to the copy and is not a real establishment match.
 */
export async function rehearseRevisionPreservation(
  input: string,
  output: string,
): Promise<void> {
  process.umask(0o077)
  const directory = resolve(output),
    database = join(directory, 'result.sqlite')
  if (existsSync(directory))
    throw new Error('Use a new preservation evidence directory')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const backup = spawnSync(
    'python3',
    [
      '-c',
      'import pathlib,sqlite3,sys; s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); t=sqlite3.connect(sys.argv[2]); s.backup(t); t.close(); s.close()',
      resolve(input),
      database,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(backup.status, 0, backup.stderr)
  const domain = openSqliteDomain(database)
  try {
    const row = domain.sqlite
      .query(`SELECT f.id featureId,l.id locationId,l.ownerOrganisationId,r.facts FROM feature f
      JOIN featureRevisionHead h ON h.featureId=f.id JOIN featureLocation fl ON fl.featureId=f.id
      JOIN location l ON l.id=fl.locationId JOIN locationRevision r ON r.id=fl.factsRevisionId
      WHERE h.publishedRevisionId IS NOT NULL AND h.state='active' AND l.state='unresolved' AND f.isArchived=0
      AND NOT EXISTS (SELECT 1 FROM task t WHERE t.featureId=f.id AND t.isReviewed=0)
      ORDER BY f.id LIMIT 1`)
      .get() as {
      featureId: string
      locationId: string
      ownerOrganisationId: string
      facts: string
    } | null
    assert.ok(
      row,
      'Rehearsal needs an enrolled published Feature with an unresolved Location',
    )
    const baseline = await readLocationIdentityBaseline(
      domain.db,
      row.locationId,
      row.ownerOrganisationId,
    )
    assert.ok(baseline)
    const facts = readLocationFacts(row.facts)
    facts.names = {
      ...facts.names,
      en: 'Synthetic upstream name for preservation rehearsal',
    }
    const ssId = `rehearsal:${crypto.randomUUID()}`,
      actorId = 'system:isolated-revision-preservation'
    const reviewId = await captureLocationIdentityReview(
      domain.db,
      baseline,
      {
        ssId,
        apiVersion: 'rehearsal',
        releaseId: 'rehearsal',
        snapshotId: 'rehearsal',
        facts,
        rawSource: { synthetic: true, purpose: 'Feature revision migration rehearsal' },
        issues: [],
      },
      actorId,
    )
    assert.ok(reviewId)
    const accepted = await acceptLocationIdentityReview(domain.db, {
      locationId: row.locationId,
      ownerOrganisationId: row.ownerOrganisationId,
      reviewId,
      actorId,
      reason: 'Synthetic identity on disposable rehearsal copy only',
    })
    assert.equal(accepted.status, 'applied')
    writeFileSync(
      join(directory, 'primary-apply.json'),
      JSON.stringify(
        {
          status: 'applied-primary-local',
          synthetic: true,
          sourceDatabaseModified: false,
          featureId: row.featureId,
          retainedLocationId: row.locationId,
          ssId,
          identityReviewId: reviewId,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
  } finally {
    domain.close()
  }
  await preserveReviewedFeature(database, directory)
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output)
    throw new Error('Usage: rehearse-preservation.ts ENROLLED_SNAPSHOT NEW_DIRECTORY')
  await rehearseRevisionPreservation(input, output)
}
