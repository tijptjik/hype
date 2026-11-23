// NODE
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
// DOMAIN
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { createCanonicalLocationDraft } from '../../src/lib/db/services/locationCanonicalDraft'
import { appendLocationRelationship } from '../../src/lib/db/services/locationRelationships'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { deriveLocationId } from '../../src/lib/locations/id.server'
import { mtrShopCode, mtrShopUnitKey } from './mtr-shop-codes'
// TYPES
import type { LocationFacts } from '../../src/lib/locations/model'

type Shop = {
  sourceRecordId: string
  sourceUrl: string
  businessName: string
  listingStatus: string
  properties: { station: string; shopNumber: string }
}
type Unit = { ref: string; rawSource: { properties: Record<string, unknown> } }

/** Import exact publisher identities and proven physical placements into an explicit local copy.
 * @returns Receipt with every unresolved brand, station and polygon.
 * @remarks Defaults to rollback. Never assigns ssId or overwrites an existing draft or occupancy.
 */
async function main(): Promise<void> {
  const [database, planPath, receiptPath, flag] = process.argv.slice(2)
  if (!database || !planPath || !receiptPath || (flag && flag !== '--apply'))
    throw new Error(
      'Usage: import-mtr-shops-local.ts LOCAL.sqlite PLAN.json RECEIPT.json [--apply]',
    )
  const path = realpathSync(database)
  if (
    !path.startsWith(realpathSync('.wrangler/state/v3/d1') + '/') &&
    !path.startsWith(realpathSync('.local/places/mtr-network') + '/')
  )
    throw new Error('Local MTR database only')
  const sourceDirectory = '.research/mtr-shops/2026-11-14'
  const cataloguePlan = JSON.parse(
    readFileSync('scripts/catalogue/mtr-network-reconciliation.json', 'utf8'),
  )
  // Catalogue source mappings are valid only for the exact reviewed capture.
  for (const [file, hash] of [
    ['records.ndjson', cataloguePlan.recordsSha256],
    ['businesses.json', cataloguePlan.businessesSha256],
    ['manifest.json', cataloguePlan.sourceManifestSha256],
  ]) {
    if (
      createHash('sha256')
        .update(readFileSync(`${sourceDirectory}/${file}`))
        .digest('hex') !== hash
    )
      throw new Error(`Reviewed source changed: ${file}`)
  }
  const manifest = JSON.parse(readFileSync(`${sourceDirectory}/manifest.json`, 'utf8'))
  const records: Shop[] = readFileSync(`${sourceDirectory}/records.ndjson`, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  if (
    !manifest.complete ||
    records.length !== manifest.expected ||
    new Set(records.map(r => r.sourceRecordId)).size !== records.length
  )
    throw new Error('Incomplete or duplicate shop capture')
  const businesses: Array<{ businessKey: string; sourceRecordIds: string[] }> =
    JSON.parse(readFileSync(`${sourceDirectory}/businesses.json`, 'utf8'))
  const plan: {
    units: Unit[]
    occupantEvidence: Array<{ unitRef: string; names: Record<string, string> }>
  } = JSON.parse(readFileSync(planPath, 'utf8'))
  const stationAnchors = JSON.parse(
    readFileSync('scripts/indoor/mtr-shop-station-anchors.json', 'utf8'),
  ) as Record<
    string,
    { geometry: LocationFacts['location']['geometry']; sourceRecord: unknown }
  >
  const codes = new Map<string, Set<string>>()
  /** Retain every exact reference candidate so ambiguity cannot pick an arbitrary unit.
   * @param code Source label. @param ref Physical source key. @returns Nothing.
   */
  function add(code: unknown, ref: string): void {
    if (typeof code !== 'string' || !/^[A-Z]{3}\s*[A-Z\d]/i.test(code)) return
    const key = mtrShopUnitKey(code),
      candidates = codes.get(key) ?? new Set<string>()
    candidates.add(ref)
    codes.set(key, candidates)
  }
  for (const unit of plan.units)
    for (const key of ['unit_name_en', 'unit_unitnumbername'])
      add(unit.rawSource.properties[key], unit.ref)
  for (const occupant of plan.occupantEvidence) add(occupant.names.en, occupant.unitRef)
  const businessByRecord = new Map(
    businesses.flatMap(b => b.sourceRecordIds.map(id => [id, b.businessKey] as const)),
  )
  const domain = openSqliteDomain(path),
    actorId = 'hype-local-agent-admin'
  const receipt: Array<Record<string, unknown>> = []
  domain.sqlite.exec('BEGIN IMMEDIATE')
  try {
    for (const record of records) {
      const shopCode = mtrShopCode(record.properties.shopNumber)
      const stationCode = shopCode.slice(0, 3)
      const candidates = [
        ...(codes.get(mtrShopUnitKey(record.properties.shopNumber)) ?? []),
      ]
      const unitRef = candidates.length === 1 ? candidates[0] : null
      const sourceKey = unitRef ?? `mtr-station:${stationCode}`
      const anchor = domain.sqlite
        .query(
          `SELECT r.facts,d.locationId FROM locationCanonicalDraft d JOIN locationRevisionContent r ON r.locationId=d.locationId WHERE d.sourceKey=? ORDER BY r.version DESC LIMIT 1`,
        )
        .get(sourceKey) as { facts: string; locationId: string } | null
      const businessKey = businessByRecord.get(record.sourceRecordId)
      const brand = domain.sqlite
        .query(
          `SELECT c.id,json_extract(r.content,'$.code') code FROM identityCatalogueSource s JOIN identityCatalogue c ON c.id=s.catalogueId JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE s.source='brand:mtr-business-label' AND s.sourceId=? AND c.kind='brand' AND coalesce(json_extract(r.content,'$.isArchived'),0)=0`,
        )
        .get(businessKey ?? '') as { id: string; code: string } | null
      const row: Record<string, unknown> = {
        sourceRecordId: record.sourceRecordId,
        stationCode,
        shopCode,
        brandId: brand?.id ?? null,
        brandCode: brand?.code ?? null,
        unitCandidates: candidates,
        listingStatus: record.listingStatus,
      }
      receipt.push(row)
      const geometry = anchor
        ? readLocationFacts(anchor.facts).location.geometry
        : stationAnchors[stationCode]?.geometry
      if (!geometry) {
        row.status = 'station-anchor-unavailable'
        continue
      }
      const facts: LocationFacts = {
        names: {
          [/\p{Script=Han}/u.test(record.businessName) &&
          !/[a-z]/i.test(record.businessName)
            ? 'zh-hant'
            : 'en']: record.businessName,
        },
        entity: { kind: 'establishment', details: { brands: [] } },
        phoneNumber: [],
        brands: [],
        brandId: brand?.id ?? null,
        location: {
          geometry,
          address: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            snapshotId: null,
            rawSource: {
              shopNumber: record.properties.shopNumber,
              station: record.properties.station,
            },
            fallbackDisplay: {
              en: `${record.properties.shopNumber}, MTR ${record.properties.station} Station`,
            },
          },
        },
      }
      const draft = await createCanonicalLocationDraft(domain.db, {
        sourceKey: `mtr-shop:${record.sourceRecordId}`,
        kind: 'establishment',
        facts,
        actorId,
        rawSource: {
          record,
          retrievedAt: manifest.retrievedAt,
          businessKey,
          coordinateEvidence: {
            sourceKey,
            precision: unitRef ? 'building-part' : 'station',
            ...(!anchor
              ? { sourceRecord: stationAnchors[stationCode].sourceRecord }
              : {}),
          },
        },
      })
      row.locationId = draft.locationId
      row.status = unitRef
        ? 'placed'
        : candidates.length
          ? 'ambiguous-unit'
          : 'unit-unmatched'
      if (!unitRef || !anchor) continue
      const id = deriveLocationId(
        'canonical-draft',
        `mtr-shop-occupancy:${record.sourceRecordId}`,
      )
      if (domain.sqlite.query('SELECT id FROM locationOccupancy WHERE id=?').get(id))
        continue
      await appendLocationRelationship(
        domain.db,
        {
          table: 'locationOccupancy',
          id,
          relationshipId: id,
          previousRevisionId: null,
          scopeOrganisationId: null,
          assertionState: 'asserted',
          establishmentLocationId: draft.locationId,
          containerLocationId: anchor.locationId,
          addressRevisionId: null,
          occupancyState:
            record.listingStatus === 'closed'
              ? 'former'
              : record.listingStatus === 'opening-soon'
                ? 'unconfirmed'
                : 'current',
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
              description:
                'MTR shop index record matched to the complete LandsD shop code; unknown operating dates remain unset.',
              sourceDate: null,
            },
          ],
        },
        actorId,
      )
    }
    domain.sqlite.exec(flag === '--apply' ? 'COMMIT' : 'ROLLBACK')
    writeFileSync(
      receiptPath,
      JSON.stringify({ applied: flag === '--apply', records: receipt }, null, 2) + '\n',
    )
    console.log(
      JSON.stringify({
        applied: flag === '--apply',
        records: receipt.length,
        establishments: receipt.filter(r => r.locationId).length,
        placed: receipt.filter(r => r.status === 'placed').length,
        missingBrands: receipt.filter(r => !r.brandId).length,
        receiptPath,
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
