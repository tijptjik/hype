// NODE
import { readFileSync } from 'node:fs'
// SQLITE
import { Database } from 'bun:sqlite'
// CONTRACTS
import { AddressContentSchema } from '@saanseoi/address'
import { LocationFactsSnapshotSchema } from '../../src/lib/locations/factsSnapshot'
import {
  FeatureAddressSchema,
  getAddressDisplay,
  getAddressLocale,
} from '../../src/lib/addresses/featureAddress'
import { FeatureRevisionContentSchema } from '../../src/lib/revisions/featureContent'

/** Check migrated rows against the application contracts, independently of SQLite constraints.
 * @param path Disposable rehearsal database path.
 * @returns Number of validated historical Feature revisions.
 */
function verify(path: string): number {
  const db = new Database(path, { readonly: true })
  const fixture = JSON.parse(
    readFileSync('scripts/locations/fixtures/former-bookstores.json', 'utf8'),
  ) as {
    records: {
      featureId: string
      reviewedCurrentState?: { addressMeta: unknown }
      rawAddress: string
      content: { i18n: { en: Record<string, unknown> } }
    }[]
  }
  try {
    for (const {
      featureId,
      rawAddress,
      content: expectedAddress,
      reviewedCurrentState,
    } of fixture.records) {
      const revision = db
        .query(
          'SELECT r.content FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.id=?',
        )
        .get(featureId) as { content: string }
      const content = FeatureRevisionContentSchema.parse(JSON.parse(revision.content))
      const envelope = FeatureAddressSchema.parse(
        content.placement.addressMeta?.address,
      )
      const preservesReviewedEdit =
        reviewedCurrentState &&
        JSON.stringify(content.placement.addressMeta) ===
          JSON.stringify(reviewedCurrentState.addressMeta)
      if (!preservesReviewedEdit && getAddressDisplay(envelope, 'en') !== rawAddress)
        throw new Error(`Original display lost for ${featureId}`)
      const components = getAddressLocale(envelope, 'en')
      for (const field of ['buildingName', 'streetName', 'buildingNumberExpression']) {
        const expected = expectedAddress.i18n.en[field]
        if (
          !preservesReviewedEdit &&
          expected &&
          components[field as keyof typeof components] !== expected
        )
          throw new Error(`Component ${field} lost for ${featureId}`)
      }
      const facts = db
        .query('SELECT facts FROM locationRevision WHERE locationId=?')
        .get(`former-bookstore:${featureId}`) as { facts: string }
      LocationFactsSnapshotSchema.parse(JSON.parse(facts.facts))
      const address = db
        .query('SELECT components FROM addressRevision WHERE id=?')
        .get(`former-bookstore:${featureId}:address:v1`) as { components: string }
      AddressContentSchema.parse(JSON.parse(address.components))
    }
    const buildingRows = db
      .query(
        "SELECT r.facts FROM locationRevision r JOIN location l ON l.id=r.locationId WHERE l.kind='building' AND json_extract(r.rawSource,'$.migration')='0207_former_bookstore_occupancy'",
      )
      .all() as { facts: string }[]
    for (const row of buildingRows)
      LocationFactsSnapshotSchema.parse(JSON.parse(row.facts))
    return fixture.records.length
  } finally {
    db.close()
  }
}

if (!Bun.argv[2]) throw new Error('Usage: verify-former-bookstores.ts REHEARSAL.sqlite')
console.log(`Validated ${verify(Bun.argv[2])} Feature, Location and Address contracts`)
