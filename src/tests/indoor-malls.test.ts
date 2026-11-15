import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { initialLevel, layerNames, places, type IndoorData } from '../lib/indoor/model'
import {
  loadPremisesCatalogue,
  premisesCode,
  premisesPath,
  searchPremises,
} from '../lib/indoor/registry'
import { existsSync } from 'node:fs'

if (existsSync('.research/indoor/hysan-place/manifest.json')) {
  // NODE
  // TESTS
  // DATA

  it('keeps building identities separate from MTR and registers TKO separately', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 'hysan-place',
            code: 'HYSAN',
            name: 'Hysan Place',
            nameZh: '希慎廣場',
            kind: 'building',
            publishedHash: 'a'.repeat(64),
            footprint: null,
          },
          {
            id: 'tko-plaza',
            code: 'TKOP',
            name: 'TKO Plaza',
            nameZh: '將軍澳廣場',
            kind: 'building',
            publishedHash: 'b'.repeat(64),
            footprint: null,
          },
        ],
      }),
    )
    await loadPremisesCatalogue()
    vi.unstubAllGlobals()

    expect(premisesCode('hysan-place')).toBe('HYSAN')
    expect(premisesCode('tko-plaza')).toBe('TKOP')
    expect(premisesCode('mtr-hysan')).toBeUndefined()
    expect(premisesPath('HYSAN', 'unit')).toBe('/buildings/hysan-place/places/unit')
    expect(premisesPath('KET')).toBe('/premises/kennedy-town-mtr')
    expect(searchPremises('希慎')[0].id).toBe('HYSAN')
    expect(searchPremises('TKO Plaza')[0].id).toBe('TKOP')
  })
  it('preserves complete building layers and chooses ground level rather than an arbitrary tower floor', () => {
    const base = '.research/indoor/hysan-place'
    const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'))
    const data = { retrievedAt: manifest.retrievedAt } as IndoorData
    for (const layer of layerNames) {
      const raw = readFileSync(`${base}/${layer}.json`)
      const entry = manifest.entries.find((e: { layer: string }) => e.layer === layer)
      data[layer] = JSON.parse(raw.toString())
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.sha256)
      expect(data[layer].features.length).toBe(entry.count)
      expect(JSON.parse(raw.toString()).totalFeatures).toBe(entry.count)
      expect(entry.count).toBeLessThan(5000)
      expect(
        data[layer].features.every(f => f.properties.venue_id === manifest.venueId),
      ).toBe(true)
    }
    expect(initialLevel(data).properties.level_name_en).toBe('Ground Floor')
    expect(data.level_polygon.features).toHaveLength(48)
    expect(places(data).reduce((n, p) => n + p.occupants.length, 0)).toBe(138)
  })
} else {
  it.skip('requires external indoor archive in .research/indoor', () => {})
}
