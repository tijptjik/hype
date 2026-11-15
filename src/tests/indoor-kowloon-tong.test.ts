import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { initialLevel, layerNames, places, type IndoorData } from '../lib/indoor/model'
import { existsSync } from 'node:fs'

if (existsSync('.research/indoor/kowloon-tong/manifest.json')) {
  const base = '.research/indoor/kowloon-tong'
  const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'))
  const data = {
    ...Object.fromEntries(
      layerNames.map(layer => [
        layer,
        JSON.parse(readFileSync(`${base}/${layer}.json`, 'utf8')),
      ]),
    ),
    retrievedAt: manifest.retrievedAt,
  } as IndoorData

  describe('Kowloon Tong station snapshot', () => {
    it('preserves complete raw layers, hashes and venue/level/occupant identities', () => {
      const levels = new Set(
        data.level_polygon.features.map(f => f.properties.level_id),
      )
      const units = new Set(data.unit_polygon.features.map(f => f.properties.unit_id))
      for (const entry of manifest.entries) {
        const raw = readFileSync(`${base}/${entry.layer}.json`)
        const collection = JSON.parse(raw.toString())
        expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.sha256)
        expect(collection.features.length).toBe(entry.count)
        expect(collection.totalFeatures).toBe(entry.count)
        expect(entry.count).toBeLessThan(5000)
        for (const feature of collection.features) {
          expect(feature.properties.venue_id).toBe(manifest.venueId)
          if (feature.properties.level_id)
            expect(levels.has(feature.properties.level_id)).toBe(true)
          if (entry.layer === 'occupant_point')
            expect(units.has(feature.properties.unit_id)).toBe(true)
        }
      }
    })
    it('indexes every occupant and keeps all six 7-Eleven units separate', () => {
      const directory = places(data)
      expect(directory.reduce((total, p) => total + p.occupants.length, 0)).toBe(40)
      const shops = directory.filter(p =>
        p.occupants.some(o => o.properties.occupant_name_en === '7-Eleven'),
      )
      expect(shops.map(p => p.code).sort()).toEqual([
        'KOT 113',
        'KOT 121',
        'KOT 122',
        'KOT 2',
        'KOT 203',
        'KOT 206',
      ])
      expect(new Set(shops.map(p => p.id)).size).toBe(6)
      expect(directory.find(p => p.code === 'KOT 5 & 6')).toBeDefined()
      expect(data.level_polygon.features).toHaveLength(12)
      expect(data.unit_polygon.features).toHaveLength(205)
      expect(initialLevel(data)).toBeDefined()
    })
    it('maps six existing establishments to exact source shop identities', () => {
      const mappings = JSON.parse(
        readFileSync('scripts/indoor/kowloon-tong-occupancies.json', 'utf8'),
      ) as {
        sourceOccupantId: string
        establishmentLocationId: string
        unitCode: string
      }[]
      expect(mappings).toHaveLength(6)
      expect(new Set(mappings.map(row => row.establishmentLocationId)).size).toBe(6)
      for (const mapping of mappings) {
        const place = places(data).find(place =>
          place.occupants.some(
            occupant => occupant.properties.occupant_id === mapping.sourceOccupantId,
          ),
        )
        expect(place?.name.en).toBe('7-Eleven')
        expect(place?.code).toBe(mapping.unitCode)
      }
    })
  })
} else {
  it.skip('requires external indoor archive in .research/indoor', () => {})
}
