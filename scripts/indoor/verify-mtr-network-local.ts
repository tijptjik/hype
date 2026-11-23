// NODE
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { premisesMapArtwork } from '../../src/lib/db/services/premisesMapPresentation'

/** Verify imported source coverage and actual server artwork projection against local data.
 * @returns A persisted verification receipt. @remarks Read-only; browser evidence is separate.
 */
async function main(): Promise<void> {
  const [database] = process.argv.slice(2)
  const domain = openSqliteDomain(database)
  const plan = JSON.parse(readFileSync('.local/places/mtr-network/plan.json', 'utf8'))
  const before = openSqliteDomain('.local/places/mtr-network/before.sqlite')
  try {
    for (const unit of plan.units) {
      const row = domain.sqlite
        .query('SELECT locationId FROM locationCanonicalDraft WHERE sourceKey=?')
        .get(unit.ref) as { locationId: string } | null
      assert.ok(row, unit.ref)
      assert.equal(
        (
          domain.sqlite
            .query('SELECT count(*) n FROM premisesMapUnit WHERE locationId=?')
            .get(row.locationId) as { n: number }
        ).n,
        1,
      )
    }
    // Previously reviewed station and unit facts must survive the network expansion byte for byte.
    const originals = before.sqlite
      .query(
        `SELECT r.id,r.facts,r.contentHash FROM locationRevisionContent r JOIN locationCanonicalDraft d ON d.locationId=r.locationId`,
      )
      .all() as Array<{ id: string; facts: string; contentHash: string }>
    for (const row of originals)
      assert.deepEqual(
        domain.sqlite
          .query('SELECT id,facts,contentHash FROM locationRevisionContent WHERE id=?')
          .get(row.id),
        row,
      )
    const shops = domain.sqlite
      .query(
        `SELECT l.id,l.ssId FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId WHERE d.sourceKey LIKE 'mtr-shop:%'`,
      )
      .all() as Array<{ id: string; ssId: string | null }>
    assert.equal(shops.length, 1758)
    assert.ok(
      shops.every(shop => shop.ssId === null),
      'Import must not accept upstream identities',
    )
    const artwork: Record<string, number> = {}
    const maps = domain.sqlite
      .query(
        `SELECT DISTINCT m.id FROM premisesMap m JOIN premisesMapUnit u ON u.mapId=m.id`,
      )
      .all() as Array<{ id: string }>
    for (const map of maps)
      artwork[map.id] = Object.keys(await premisesMapArtwork(domain.db, map.id)).length
    const foreignKeys = domain.sqlite.query('PRAGMA foreign_key_check').all()
    assert.deepEqual(foreignKeys, [])
    const receipt = {
      physicalParts: plan.units.length,
      establishments: shops.length,
      unchangedPriorRevisions: originals.length,
      stationMaps: maps.length,
      logoPolygons: Object.values(artwork).reduce((a, b) => a + b, 0),
      artwork,
      foreignKeyViolations: foreignKeys.length,
    }
    writeFileSync(
      '.local/places/mtr-network/verification.json',
      JSON.stringify(receipt, null, 2) + '\n',
    )
    console.log(JSON.stringify(receipt))
  } finally {
    domain.close()
    before.close()
  }
}
await main()
