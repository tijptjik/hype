import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { initialLevel, layerNames, places, type IndoorData } from '../lib/indoor/model'
import { existsSync } from 'node:fs'

if (existsSync('.research/indoor/hong-kong/manifest.json')) {
  const base = '.research/indoor/hong-kong'
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

  describe('Hong Kong station snapshot', () => {
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
    it('chooses a concourse and retains combined kiosk codes on one source polygon', () => {
      expect(initialLevel(data).properties.level_name_en).toBe(
        'Concourse Level (Tung Chung Line)',
      )
      const directory = places(data)
      expect(directory.filter(p => p.feature.geometry.type !== 'Point')).toHaveLength(
        249,
      )
      expect(directory.find(p => p.code === 'HOK 3a & 3b')).toBeDefined()
      expect(directory.find(p => p.code === 'HOK 43-44')).toBeDefined()
      expect(directory.reduce((total, p) => total + p.occupants.length, 0)).toBe(83)
    })
  })
} else {
  it.skip('requires external indoor archive in .research/indoor', () => {})
}
