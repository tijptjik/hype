// NODE
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
// DOMAIN
import { places, type IndoorData } from '../../src/lib/indoor/model'
import {
  mapHash,
  validateMapBundle,
  type MapCatalogueEntry,
} from '../../src/lib/indoor/releases'
import catalogue from '../../src/lib/routing/mtr-catalog.json'

// Central's connecting concourse contains Hong Kong-numbered shops. The retained MTR
// directory explicitly lists HOK 62 and HOK 63 near the Island Line platform.
const sharedConcourseUnits = new Set([
  'CEN:032c7d51-0338-4f28-98d4-1a36b82263b8:HOK 62',
  'CEN:b993eec4-7890-4400-b20a-120a5fa53875:HOK 63',
])
const stationCodes = new Set(catalogue.stations.map(station => station.id))

/** Identify explicit station prefixes without treating equipment codes as stations.
 * @param label Published unit label or projected code. @returns Candidate three-letter prefix, if present.
 * @remarks An unknown prefix is retained separately for review; it is never auto-corrected.
 */
function prefix(label: string): string | undefined {
  return /^(?:Kiosk |Shop |F&B )?([A-Z]{3})(?=\s*(?:[A-Z]{0,4}\s*)?\d)/i
    .exec(label.trim())?.[1]
    .toUpperCase()
}

/** Audit every published station using the same place projection as the application.
 * @returns Nothing; saves a reviewable receipt and fails on unexplained prefix mismatches.
 * @remarks Read-only HTTP requests; original source labels and shared-concourse numbering survive.
 */
async function main(): Promise<void> {
  const [
    base = 'http://127.0.0.1:4173',
    output = '.local/places/station-code-audit/live.json',
  ] = process.argv.slice(2)
  /** Read a required JSON response. @param path API path. @returns Parsed response. */
  async function read(path: string): Promise<unknown> {
    const response = await fetch(new URL(path, base))
    assert(response.ok, `${path}: ${response.status}`)
    return response.json()
  }
  const maps = ((await read('/api/premises-maps')) as MapCatalogueEntry[]).filter(
    map => map.kind === 'station' && map.publishedHash,
  )
  const mismatches: object[] = [],
    sourceMismatches: object[] = [],
    equipmentCandidates: object[] = []
  const checked: object[] = []
  let units = 0
  // Check releases sequentially to avoid overwhelming the local D1/R2 server.
  for (const map of maps) {
    const response = await fetch(
      new URL(`/api/premises-maps/${map.id}/releases/${map.publishedHash}`, base),
    )
    assert(response.ok, `${map.id}: ${response.status}`)
    const text = await response.text()
    assert.equal(await mapHash(text), map.publishedHash)
    const { data } = validateMapBundle(JSON.parse(text))
    units += data.unit_polygon.features.length
    const projected = places(data)
    for (const unit of data.unit_polygon.features) {
      for (const field of [
        'unit_name_en',
        'unit_unitnumbername',
        'unit_name_zh',
        'unit_alt_name',
      ]) {
        const label = String(unit.properties[field] ?? '')
        const code = prefix(label)
        if (!code || code === map.code) continue
        const entry = {
          station: map.code,
          unitId: unit.properties.unit_id,
          field,
          label,
        }
        if (stationCodes.has(code)) sourceMismatches.push(entry)
        else equipmentCandidates.push(entry)
      }
    }
    for (const place of projected) {
      const code = prefix(place.code || place.name.en)
      if (!code || !stationCodes.has(code) || code === map.code) continue
      if (sharedConcourseUnits.has(`${map.code}:${place.id}:${place.code}`)) continue
      mismatches.push({
        station: map.code,
        unitId: place.id,
        code: place.code,
        name: place.name.en,
      })
    }
    if (map.code === 'SHW') {
      const presentation = (await read(
        `/api/premises-maps/${map.id}/presentation`,
      )) as IndoorData['unitArtwork']
      for (const [id, code] of [
        ['82553377-d9d9-43af-998b-292f31fb5ea4', 'SHW 3'],
        ['0e4e859d-66c1-4d7e-b44f-7ee7b9a5e47e', 'SHW 2'],
        ['03e314d3-c413-40e9-8f7b-91962d8f7cc8', 'SHW 9'],
      ]) {
        assert.equal(projected.find(place => place.id === id)?.code, code)
        assert(presentation?.[id]?.src, `${code}: missing current tenant artwork`)
      }
    }
    checked.push({
      station: map.code,
      mapId: map.id,
      hash: map.publishedHash,
      units: data.unit_polygon.features.length,
    })
  }
  const receipt = {
    checkedAt: new Date().toISOString(),
    stations: maps.length,
    units,
    mismatches,
    sourceMismatches,
    equipmentCandidates,
    checked,
  }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(
    JSON.stringify({
      stations: maps.length,
      units,
      mismatches,
      sourceMismatches,
      equipmentCandidates: equipmentCandidates.length,
      output,
    }),
  )
  assert(maps.length > 0, 'No published station maps')
  assert.equal(mismatches.length, 0, 'Unexplained displayed station prefix mismatches')
}
await main()
