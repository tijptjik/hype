// NODE
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { updateCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { deriveLocationId } from '../../src/lib/locations/id.server'

type Resolution = {
  record: {
    sourceRecordId: string
    sourceUrl: string
    businessName: string
    listingStatus: string
    properties: { shopNumber: string }
  }
  units: string[]
  method: string
}
type Draft = {
  id: string
  revisionId: string
  contentHash: string
  facts: string
  rawSource: string
}

/** Apply retained evidence to existing local drafts, preserving source and identity.
 * @returns A receipt of relationships, names and conflicts.
 * @remarks Offline local database only, rollback by default. Multi-unit shops occupy
 * existing polygons; shared service areas and incomplete groups are not inferred.
 */
async function main(): Promise<void> {
  const [database, flag] = process.argv.slice(2)
  if (flag && flag !== '--apply') throw new Error('Unknown flag')
  const path = realpathSync(database)
  if (!path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/'))
    throw new Error('Managed local D1 only')
  const plan = JSON.parse(
    readFileSync('.local/places/mtr-network/resolutions.json', 'utf8'),
  ) as {
    inputs: Record<string, string>
    resolutions: Resolution[]
    nameCorrections: Array<{
      unitRef: string
      expectedNames: Record<string, string>
      names: Record<string, string>
      evidence: string
      map: string
    }>
  }
  for (const [file, hash] of Object.entries(plan.inputs))
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
      throw new Error(`Source changed: ${file}`)
  const manifest = JSON.parse(
    readFileSync('.research/mtr-shops/2026-11-14/manifest.json', 'utf8'),
  )
  const domain = openSqliteDomain(path)
  const receipt: Array<Record<string, unknown>> = []
  let backup: string | null = null
  /** Read the latest mutable draft by retained source identity.
   * @param sourceKey Exact source key. @returns Guarded draft or an error.
   */
  function draft(sourceKey: string): Draft {
    const row = domain.sqlite
      .query(`SELECT l.id,r.id revisionId,r.contentHash,r.facts,r.rawSource
      FROM location l JOIN locationCanonicalDraft d ON d.locationId=l.id
      JOIN locationRevisionContent r ON r.locationId=l.id
      WHERE d.sourceKey=? AND l.state='unresolved' AND l.ssId IS NULL
      AND l.ownerOrganisationId IS NULL
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)`)
      .get(sourceKey) as Draft | null
    if (!row) throw new Error(`Mutable draft missing: ${sourceKey}`)
    return row
  }
  try {
    domain.sqlite.exec('BEGIN IMMEDIATE')
    if (flag === '--apply') {
      backup = `.local/places/mtr-network/before-resolutions-${Date.now()}.sqlite`
      writeFileSync(backup, domain.sqlite.serialize(), { flag: 'wx' })
    }
    for (const resolution of plan.resolutions) {
      const { record } = resolution
      const establishment = draft(`mtr-shop:${record.sourceRecordId}`)
      const containers = resolution.units.map(draft)
      const state =
        record.listingStatus === 'closed'
          ? 'former'
          : record.listingStatus === 'opening-soon'
            ? 'unconfirmed'
            : 'current'
      // Do not silently place a different current tenant over an accepted occupancy.
      const conflicts =
        state === 'current'
          ? containers.filter(unit =>
              domain.sqlite
                .query(`
        SELECT id FROM locationOccupancyHead WHERE containerLocationId=?
        AND establishmentLocationId<>? AND occupancyState='current'
        AND assertionState='asserted' AND scopeOrganisationId IS NULL LIMIT 1`)
                .get(unit.id, establishment.id),
            )
          : []
      if (conflicts.length) {
        receipt.push({
          code: record.properties.shopNumber,
          status: 'current-occupancy-conflict',
          containers: conflicts.map(c => c.id),
        })
        continue
      }
      for (const container of containers) {
        const exists = domain.sqlite
          .query(`SELECT id FROM locationOccupancyHead
          WHERE establishmentLocationId=? AND containerLocationId=?
          AND scopeOrganisationId IS NULL AND assertionState='asserted'`)
          .get(establishment.id, container.id)
        if (exists) continue
        const id = deriveLocationId(
          'canonical-draft',
          `mtr-shop-occupancy:${record.sourceRecordId}:${container.id}`,
        )
        if (flag === '--apply')
          await appendLocationRelationship(
            domain.db,
            {
              table: 'locationOccupancy',
              id,
              relationshipId: id,
              previousRevisionId: null,
              scopeOrganisationId: null,
              assertionState: 'asserted',
              establishmentLocationId: establishment.id,
              containerLocationId: container.id,
              addressRevisionId: null,
              occupancyState: state,
              observedAt: manifest.retrievedAt,
              verifiedAt: null,
              effectiveFrom: null,
              effectiveTo: null,
              evidence: [
                {
                  source: {
                    kind: 'url',
                    url: record.sourceUrl,
                    accessedAt: manifest.retrievedAt,
                  },
                  supports: [
                    'establishmentLocationId',
                    'containerLocationId',
                    'occupancyState',
                  ],
                  quotedText: `${record.businessName}: ${record.properties.shopNumber} (${record.listingStatus})`,
                  description: `Retained LandsD unit links and MTR directory: ${resolution.method}; source units ${resolution.units.join(', ')}. Unknown dates remain unset.`,
                  sourceDate: null,
                },
              ],
            },
            'hype-local-agent-admin',
          )
        receipt.push({
          code: record.properties.shopNumber,
          status: 'occupancy-added',
          containerId: container.id,
          establishmentId: establishment.id,
          state,
        })
      }
      // Replace only generated room labels, never an existing source or curated name.
      if (resolution.method === 'unique-linked-occupant' && containers.length === 1) {
        const unit = containers[0],
          facts = readLocationFacts(unit.facts)
        if (
          Object.keys(facts.names).length === 1 &&
          /^Room · /.test(facts.names.en ?? '')
        ) {
          const code = record.properties.shopNumber
          const label = /ATM|VEM|HSB/.test(code)
            ? `Self-service corner ${code}`
            : `Kiosk ${code}`
          if (
            flag === '--apply' &&
            !(await updateCanonicalLocationDraft(domain.db, {
              locationId: unit.id,
              sourceRevisionId: unit.revisionId,
              expectedDraftVersion: unit.contentHash,
              facts: { ...facts, names: { en: label } },
            }))
          )
            throw new Error(`Unit changed: ${unit.id}`)
          receipt.push({ status: 'unit-named', locationId: unit.id, name: label })
        }
      }
    }
    // Reviewed PDF corrections replace only the exact audited name, preserving subsequent edits.
    for (const correction of plan.nameCorrections) {
      const unit = draft(correction.unitRef),
        facts = readLocationFacts(unit.facts)
      const equal = (names: Record<string, string>): boolean =>
        Object.keys(names).length === Object.keys(facts.names).length &&
        Object.entries(names).every(([locale, name]) => facts.names[locale] === name)
      if (equal(correction.names)) continue
      if (!equal(correction.expectedNames)) {
        receipt.push({
          status: 'name-preserved',
          locationId: unit.id,
          names: facts.names,
        })
        continue
      }
      if (
        flag === '--apply' &&
        !(await updateCanonicalLocationDraft(domain.db, {
          locationId: unit.id,
          sourceRevisionId: unit.revisionId,
          expectedDraftVersion: unit.contentHash,
          facts: { ...facts, names: correction.names },
        }))
      )
        throw new Error(`Unit changed: ${unit.id}`)
      receipt.push({
        status: 'unit-named',
        locationId: unit.id,
        names: correction.names,
        evidence: correction.evidence,
        map: correction.map,
      })
    }
    domain.sqlite.exec(flag === '--apply' ? 'COMMIT' : 'ROLLBACK')
    const result = { applied: flag === '--apply', backup, receipt }
    writeFileSync(
      `.local/places/mtr-network/resolutions-${flag === '--apply' ? 'applied' : 'preview'}.json`,
      JSON.stringify(result, null, 2) + '\n',
    )
    console.log(
      JSON.stringify({
        applied: result.applied,
        backup,
        counts: Object.fromEntries(
          [...new Set(receipt.map(r => r.status))].map(s => [
            s,
            receipt.filter(r => r.status === s).length,
          ]),
        ),
      }),
    )
  } catch (error) {
    if (domain.sqlite.inTransaction) domain.sqlite.exec('ROLLBACK')
    throw error
  } finally {
    domain.close()
  }
}
await main()
