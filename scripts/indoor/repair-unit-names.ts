// NODE
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { updateCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { indoorUnitNames } from '../../src/lib/locations/indoorUnitNames'

/** Repair untouched imported unit names while preserving raw tenant evidence and identity.
 * @returns Counts and backup path.
 * @remarks Local-only, preview by default. Curated names and published identities are skipped.
 */
async function main(): Promise<void> {
  const [database, flag] = process.argv.slice(2)
  const path = realpathSync(database)
  if (!path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/'))
    throw new Error('Managed local D1 only')
  const domain = openSqliteDomain(path)
  const changes: string[] = []
  try {
    domain.sqlite.exec('BEGIN IMMEDIATE')
    if (flag === '--apply') {
      mkdirSync('.local/places/mtr-onboarding', { recursive: true })
      const backup = `.local/places/mtr-onboarding/before-unit-names-${Date.now()}.sqlite`
      writeFileSync(backup, domain.sqlite.serialize(), { flag: 'wx' })
      console.log({ backup })
    }
    const rows = domain.sqlite
      .query(`SELECT l.id,r.id revisionId,r.contentHash,r.facts,r.rawSource FROM location l
      JOIN locationCanonicalDraft d ON d.locationId=l.id JOIN locationRevisionContent r ON r.locationId=l.id
      WHERE d.sourceKey LIKE 'landsd-mtr-unit:%' AND l.state='unresolved' AND l.ssId IS NULL
      AND l.ownerOrganisationId IS NULL AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)`)
      .all() as Array<{
      id: string
      revisionId: string
      contentHash: string
      facts: string
      rawSource: string
    }>
    for (const row of rows) {
      const source = JSON.parse(row.rawSource)
      const original = source.record?.names
      if (!original || !source.record.rawSource?.properties) continue
      const facts = readLocationFacts(row.facts)
      // Only repair unchanged imported names; a human-authored label wins.
      if (
        Object.entries(original).some(
          ([locale, name]) => facts.names[locale.toLowerCase()] !== name,
        ) ||
        Object.keys(original).length !== Object.keys(facts.names).length
      )
        continue
      const names = indoorUnitNames(
        original,
        source.record.rawSource.properties,
        source.occupantEvidence ?? [],
      )
      if (
        names === original ||
        (Object.keys(names).length === Object.keys(facts.names).length &&
          Object.entries(names).every(([locale, name]) => facts.names[locale] === name))
      )
        continue
      changes.push(row.id)
      if (flag === '--apply') {
        const result = await updateCanonicalLocationDraft(domain.db, {
          locationId: row.id,
          sourceRevisionId: row.revisionId,
          expectedDraftVersion: row.contentHash,
          facts: { ...facts, names },
        })
        if (!result) throw new Error(`Draft changed: ${row.id}`)
      }
    }
    domain.sqlite.exec(flag === '--apply' ? 'COMMIT' : 'ROLLBACK')
    console.log({
      applied: flag === '--apply',
      count: changes.length,
      locations: changes,
    })
  } catch (error) {
    domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
