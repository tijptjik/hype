// NODE
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import {
  captureLocationIdentityReview,
  captureMirroredLocationIdentityReview,
  readLocationIdentityBaseline,
} from '../../src/lib/db/services/locationIdentityReview'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { persistSaanSeoiPlace } from '../../src/lib/db/services/locationSource'
import { mtrShopCode } from './mtr-shop-codes'
// TYPES
import type { SaanSeoiPlaceProjection } from '../../src/lib/locations/saanseoi'

/** Capture deduplicated comparisons without accepting an identity or modifying any occupancy.
 * @returns Review receipt. @remarks Only the explicit managed local database is writable.
 */
async function main(): Promise<void> {
  const [database] = process.argv.slice(2)
  const path = realpathSync(database)
  if (!path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/'))
    throw new Error('Managed local database only')
  const evidence = JSON.parse(
    readFileSync('.local/places/mtr-network/upstream-candidates.json', 'utf8'),
  ) as {
    complete: boolean
    candidates: Array<{
      sourceRecordIds: string[]
      projection: SaanSeoiPlaceProjection
    }>
  }
  if (!evidence.complete) throw new Error('Discovery is incomplete')
  const domain = openSqliteDomain(path),
    receipt: unknown[] = []
  domain.sqlite.exec('BEGIN IMMEDIATE')
  try {
    // Keep a separate verified upstream subject available for historical occupancy authoring.
    for (const candidate of evidence.candidates) {
      if (
        !domain.sqlite
          .query('SELECT id FROM location WHERE ssId=?')
          .get(candidate.projection.ssId)
      )
        await persistSaanSeoiPlace(domain.db, candidate.projection)
    }
    const shops = domain.sqlite
      .query(
        `SELECT d.locationId,json_extract(r.rawSource,'$.record.sourceRecordId') sourceRecordId,json_extract(r.rawSource,'$.record.properties.shopNumber') code FROM locationCanonicalDraft d JOIN locationRevisionContent r ON r.id=d.locationId||'_draft' WHERE d.sourceKey LIKE 'mtr-shop:%'`,
      )
      .all() as Array<{ locationId: string; sourceRecordId: string; code: string }>
    const mirrored = domain.sqlite
      .query(
        `SELECT r.id,r.ssId,r.facts FROM location l JOIN locationRevisionContent r ON r.locationId=l.id WHERE l.state='linked' AND l.ownerOrganisationId IS NULL AND r.origin='saanseoi' AND r.ssId=l.ssId AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)`,
      )
      .all() as Array<{ id: string; ssId: string; facts: string }>
    for (const shop of shops) {
      const baseline = await readLocationIdentityBaseline(
        domain.db,
        shop.locationId,
        null,
      )
      if (!baseline || baseline.expectedSsId) continue
      const candidates = evidence.candidates
        .filter(c => c.sourceRecordIds.includes(shop.sourceRecordId))
        .map(c => ({
          ssId: c.projection.ssId,
          projection: c.projection,
          revisionId: null as string | null,
        }))
      const code = mtrShopCode(shop.code)
      if (code.length > 3) {
        const pattern = new RegExp(
          `(?<![A-Z0-9])${[...code].map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')}(?![A-Z0-9])`,
          'i',
        )
        for (const source of mirrored) {
          const address = JSON.stringify(
            readLocationFacts(source.facts).location.address,
          )
          if (
            /MTR|港鐵|地鐵/i.test(address) &&
            pattern.test(address) &&
            !candidates.some(c => c.ssId === source.ssId)
          )
            candidates.push({
              ssId: source.ssId,
              revisionId: source.id,
              projection: null as unknown as SaanSeoiPlaceProjection,
            })
        }
      }
      for (const candidate of candidates) {
        const prior = domain.sqlite
          .query(
            `SELECT id FROM locationIdentityReview WHERE locationId=? AND json_extract(projection,'$.ssId')=? AND json_extract(baseline,'$.expectedLatestRevisionId')=?`,
          )
          .get(shop.locationId, candidate.ssId, baseline.expectedLatestRevisionId) as {
          id: string
        } | null
        const reviewId =
          prior?.id ??
          (candidate.revisionId
            ? await captureMirroredLocationIdentityReview(
                domain.db,
                baseline,
                candidate.revisionId,
                'hype-local-agent-admin',
              )
            : await captureLocationIdentityReview(
                domain.db,
                baseline,
                candidate.projection,
                'hype-local-agent-admin',
              ))
        if (!reviewId) throw new Error(`Candidate changed: ${candidate.ssId}`)
        receipt.push({
          locationId: shop.locationId,
          sourceRecordId: shop.sourceRecordId,
          ssId: candidate.ssId,
          reviewId,
        })
      }
    }
    domain.sqlite.exec('COMMIT')
    writeFileSync(
      '.local/places/mtr-network/reviews.json',
      JSON.stringify(receipt, null, 2) + '\n',
    )
    console.log(JSON.stringify({ reviews: receipt.length }))
  } catch (error) {
    if (domain.sqlite.inTransaction) domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
