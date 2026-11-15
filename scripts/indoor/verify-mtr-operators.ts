// NODE
import { strict as assert } from 'node:assert'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { listLocationResources } from '../../src/lib/db/services/locationDirectory'

const domain = openSqliteDomain(process.argv[2])
try {
  const expected = domain.sqlite
    .query(
      "SELECT locationId,sourceKey FROM locationCanonicalDraft WHERE sourceKey LIKE 'mtr-station:%'",
    )
    .all() as { locationId: string; sourceKey: string }[]
  const seen = new Set<string>()
  let after: string | undefined
  do {
    const result = await listLocationResources(domain.db, {
      publication: 'draft',
      kind: 'premises',
      q: 'MTR',
      after,
      includeCount: true,
    })
    assert.equal(result.totalCount, expected.length)
    for (const row of result.data) {
      const code = expected
        .find(entry => entry.locationId === row.id)!
        .sourceKey.slice('mtr-station:'.length)
      assert.equal(row.operator?.referenceCode, code)
      const mapId =
        code === 'KET' ? 'kennedy-town-mtr' : code === 'HOK' ? 'hong-kong-mtr' : null
      assert.equal(row.premisesMapId, mapId)
      assert.equal(row.premisesMap?.href ?? null, mapId ? `/premises/${mapId}` : null)
      assert.equal(row.operator?.id, 'mtr-corporation')
      assert.equal(row.operator?.names.en, 'MTR Corporation')
      assert.equal(row.operator?.logo, '/mapSprites/breadline-light/exit.svg')
      assert.ok(row.facts?.names.en.endsWith(' MTR'))
      seen.add(row.id)
    }
    after = result.nextCursor ?? undefined
  } while (after)
  assert.deepEqual(seen, new Set(expected.map(row => row.locationId)))
  console.log(
    `PASS: application directory projects operator codes, map references, logos and titles for all ${seen.size} stations`,
  )
} finally {
  domain.close()
}
