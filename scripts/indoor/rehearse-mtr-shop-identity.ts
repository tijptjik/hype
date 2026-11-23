// NODE
import assert from 'node:assert/strict'
import { realpathSync, readFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import {
  captureLocationMergeReview,
  applyLocationMergeReview,
} from '../../src/lib/db/services/locationMerge'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { currentLocationFacts } from '../../src/lib/db/services/locationReadProjection'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
  acceptLocationIdentityReview,
} from '../../src/lib/db/services/locationIdentityReview'

/** Rehearse reviewed MTR identity merge on an isolated database copy only.
 * @returns Assertion completion. @remarks Never accepts a user's real pending review.
 */
async function main(): Promise<void> {
  const [database] = process.argv.slice(2)
  if (
    !realpathSync(database).startsWith(realpathSync('.local/places/mtr-network') + '/')
  )
    throw new Error('Offline MTR copy only')
  const domain = openSqliteDomain(database)
  try {
    if (process.argv.includes('--direct')) {
      const evidence = JSON.parse(
        readFileSync('.local/places/mtr-network/upstream-candidates.json', 'utf8'),
      )
      const candidate = evidence.candidates.find(
        (candidate: { projection: { ssId: string } }) =>
          !domain.sqlite
            .query('SELECT id FROM location WHERE ssId=?')
            .get(candidate.projection.ssId),
      )
      assert.ok(
        candidate,
        'Expected an unmirrored upstream candidate in the offline copy',
      )
      const draft = domain.sqlite
        .query(
          `SELECT d.locationId,r.facts FROM locationCanonicalDraft d JOIN locationRevisionContent r ON r.id=d.locationId||'_draft' WHERE d.sourceKey=?`,
        )
        .get(`mtr-shop:${candidate.sourceRecordIds[0]}`) as {
        locationId: string
        facts: string
      }
      const before = readLocationFacts(draft.facts)
      assert.ok(before.brandId)
      const baseline = await readLocationIdentityBaseline(
        domain.db,
        draft.locationId,
        null,
      )
      assert.ok(baseline)
      const reviewId = await captureLocationIdentityReview(
        domain.db,
        baseline,
        candidate.projection,
        'hype-local-agent-admin',
      )
      assert.ok(reviewId)
      const input = {
        locationId: draft.locationId,
        ownerOrganisationId: null,
        reviewId,
        actorId: 'hype-local-agent-admin',
        reason: 'Offline direct identity acceptance rehearsal',
      }
      assert.equal(
        (await acceptLocationIdentityReview(domain.db, input)).status,
        'applied',
      )
      const latest = domain.sqlite
        .query(
          'SELECT facts FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
        )
        .get(draft.locationId) as { facts: string }
      const after = await currentLocationFacts(
        domain.db,
        draft.locationId,
        readLocationFacts(latest.facts),
        null,
      )
      assert.equal(after.brandId, before.brandId)
      assert.equal(
        (await acceptLocationIdentityReview(domain.db, input)).status,
        'conflict',
      )
      console.log(
        JSON.stringify({
          linkedOffline: draft.locationId,
          retainedBrand: after.brandId,
          staleReplayRejected: true,
        }),
      )
      return
    }
    const row = domain.sqlite
      .query(
        `SELECT review.id reviewId,review.locationId,source.id sourceLocationId,r.facts FROM locationIdentityReview review JOIN locationCanonicalDraft d ON d.locationId=review.locationId JOIN locationRevisionContent r ON r.id=review.locationId||'_draft' JOIN location source ON source.ssId=json_extract(review.projection,'$.ssId') WHERE d.sourceKey LIKE 'mtr-shop:%' AND json_extract(r.facts,'$.common.brandId') IS NOT NULL LIMIT 1`,
      )
      .get() as {
      reviewId: string
      locationId: string
      sourceLocationId: string
      facts: string
    } | null
    // Facts serialize catalogue fields in the establishment details; use the typed reader for selection.
    const rows = row
      ? [row]
      : (domain.sqlite
          .query(
            `SELECT review.id reviewId,review.locationId,source.id sourceLocationId,r.facts FROM locationIdentityReview review JOIN locationCanonicalDraft d ON d.locationId=review.locationId JOIN locationRevisionContent r ON r.id=review.locationId||'_draft' JOIN location source ON source.ssId=json_extract(review.projection,'$.ssId') WHERE d.sourceKey LIKE 'mtr-shop:%'`,
          )
          .all() as NonNullable<typeof row>[])
    const selected = rows.find(candidate => readLocationFacts(candidate.facts).brandId)
    assert.ok(selected, 'Expected a branded review fixture')
    const before = readLocationFacts(selected.facts)
    const occupancyBefore = domain.sqlite
      .query('SELECT * FROM locationOccupancy WHERE establishmentLocationId=?')
      .all(selected.locationId)
    const input = {
      locationId: selected.locationId,
      sourceLocationId: selected.sourceLocationId,
      ownerOrganisationId: null,
      sourceOwnerOrganisationId: null,
      actorId: 'hype-local-agent-admin',
    }
    const review = await captureLocationMergeReview(domain.db, {
      ...input,
      identityReviewId: selected.reviewId,
    })
    assert.equal(review.status, 'ready')
    if (review.status !== 'ready') throw new Error('Merge review unavailable')
    const result = await applyLocationMergeReview(domain.db, {
      ...input,
      reviewId: review.reviewId,
      reason: 'Offline MTR catalogue retention rehearsal',
    })
    assert.equal(result.status, 'applied')
    const latest = domain.sqlite
      .query(
        'SELECT facts FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
      )
      .get(selected.locationId) as { facts: string }
    const after = await currentLocationFacts(
      domain.db,
      selected.locationId,
      readLocationFacts(latest.facts),
      null,
    )
    assert.equal(after.brandId, before.brandId)
    assert.deepEqual(
      domain.sqlite
        .query('SELECT * FROM locationOccupancy WHERE establishmentLocationId=?')
        .all(selected.locationId),
      occupancyBefore,
    )
    assert.equal(
      (
        await applyLocationMergeReview(domain.db, {
          ...input,
          reviewId: review.reviewId,
          reason: 'Stale duplicate rehearsal',
        })
      ).status,
      'conflict',
    )
    console.log(
      JSON.stringify({
        mergedOffline: selected.locationId,
        retainedBrand: after.brandId,
        retainedOccupancies: occupancyBefore.length,
        staleReplayRejected: true,
      }),
    )
  } finally {
    domain.close()
  }
}
await main()
