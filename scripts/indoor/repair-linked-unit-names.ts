// NODE
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { updateCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'

type Decision = {
  locationId: string
  unitId: string
  previousNames: Record<string, string>
  names: Record<string, string> | null
  evidence: Array<{ layer: string; properties: Record<string, unknown> }>
}

/** Compare names independent of locale insertion order.
 * @param a Current names. @param b Reviewed names. @returns Whether every locale agrees.
 */
function sameNames(a: Record<string, string>, b: Record<string, string>): boolean {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([locale, name]) => b[locale] === name)
  )
}

/** Apply reviewed functional names from exact source unit links to local drafts.
 * @returns Nothing; prints a receipt including backup and changed IDs.
 * @remarks Preview by default. Run against an offline local D1 database. Preserves
 * raw source evidence, tenant identities, and any names edited since the audit.
 */
async function main(): Promise<void> {
  const [database, audit, flag] = process.argv.slice(2)
  if (flag && flag !== '--apply') throw new Error('Unknown flag')
  const path = realpathSync(database)
  if (!path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/'))
    throw new Error('Managed local D1 only')
  const decisions = JSON.parse(readFileSync(audit, 'utf8')).rows as Decision[]
  const domain = openSqliteDomain(path)
  const changed: string[] = []
  let backup: string | null = null
  try {
    domain.sqlite.exec('BEGIN IMMEDIATE')
    // Snapshot the locked database before applying any reviewed name changes.
    if (flag === '--apply') {
      mkdirSync('.local/places/mtr-onboarding', { recursive: true })
      backup = `.local/places/mtr-onboarding/before-linked-unit-names-${Date.now()}.sqlite`
      writeFileSync(backup, domain.sqlite.serialize(), { flag: 'wx' })
    }
    for (const decision of decisions) {
      if (!decision.names) continue
      const row = domain.sqlite
        .query(`SELECT r.id revisionId,r.contentHash,r.facts,r.rawSource
        FROM location l JOIN locationCanonicalDraft d ON d.locationId=l.id
        JOIN locationRevisionContent r ON r.locationId=l.id
        WHERE l.id=? AND d.sourceKey LIKE 'landsd-mtr-unit:%'
        AND l.state='unresolved' AND l.ssId IS NULL AND l.ownerOrganisationId IS NULL
        AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)`)
        .get(decision.locationId) as {
        revisionId: string
        contentHash: string
        facts: string
        rawSource: string
      } | null
      if (!row) throw new Error(`Draft unavailable: ${decision.locationId}`)
      const source = JSON.parse(row.rawSource)
      if (source.record?.rawSource?.properties?.unit_id !== decision.unitId)
        throw new Error(`Source unit changed: ${decision.locationId}`)
      // Require each proposed locale to appear verbatim on an explicitly linked record.
      for (const [locale, name] of Object.entries(decision.names)) {
        const suffix = locale === 'en' ? 'en' : locale === 'zh-hant' ? 'zh' : null
        if (
          !suffix ||
          !decision.evidence.some(
            e =>
              e.properties.unit_id === decision.unitId &&
              e.properties[`${e.layer.replace('_point', '')}_name_${suffix}`] === name,
          )
        )
          throw new Error(`Unsupported source name: ${decision.locationId}/${locale}`)
      }
      const facts = readLocationFacts(row.facts)
      if (sameNames(facts.names, decision.names)) continue
      if (!sameNames(facts.names, decision.previousNames))
        throw new Error(`Names edited since audit: ${decision.locationId}`)
      changed.push(decision.locationId)
      if (flag === '--apply') {
        const result = await updateCanonicalLocationDraft(domain.db, {
          locationId: decision.locationId,
          sourceRevisionId: row.revisionId,
          expectedDraftVersion: row.contentHash,
          facts: { ...facts, names: decision.names },
        })
        if (!result) throw new Error(`Draft changed: ${decision.locationId}`)
      }
    }
    domain.sqlite.exec(flag === '--apply' ? 'COMMIT' : 'ROLLBACK')
    console.log(
      JSON.stringify({
        applied: flag === '--apply',
        backup,
        count: changed.length,
        changed,
      }),
    )
  } catch (error) {
    domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
