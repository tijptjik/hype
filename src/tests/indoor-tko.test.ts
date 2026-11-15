import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { layerNames, places, type IndoorData } from '../lib/indoor/model'
import { stationProjection } from '../lib/indoor/scene'
import { findIndoorRoute, indoorNavigation } from '../lib/indoor/routing'
import { existsSync } from 'node:fs'

if (existsSync('.research/indoor/tko-plaza/manifest.json')) {
  // NODE
  // TESTS
  // DATA
  const base = '.research/indoor/tko-plaza'
  const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, 'utf8'))
  const data = {
    ...Object.fromEntries(
      layerNames.map(layer => [
        layer,
        JSON.parse(readFileSync(`${base}/${layer}.json`, 'utf8')),
      ]),
    ),
    retrievedAt: manifest.retrievedAt,
    coordinateSpace: manifest.coordinateSpace,
  } as IndoorData

  it('preserves source hotspot coordinates, bilingual shop links and unmapped omissions', () => {
    expect(data.coordinateSpace).toBe('image-pixels')
    expect(data.unit_polygon.features).toHaveLength(125)
    expect(data.occupant_point.features).toHaveLength(91)
    expect(data.level_polygon.features).toHaveLength(2)
    expect(manifest.unmappedPlaces).toHaveLength(2)
    for (const entry of manifest.entries) {
      const raw = readFileSync(`${base}/${entry.layer}.json`)
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.sha256)
      expect(JSON.parse(raw.toString()).features).toHaveLength(entry.count)
    }
    const units = new Set(data.unit_polygon.features.map(f => f.properties.unit_id))
    for (const occupant of data.occupant_point.features) {
      expect(units.has(occupant.properties.unit_id)).toBe(true)
      expect(occupant.properties.occupant_name_zh).toBeTruthy()
    }
    const milksha = places(data).find(p => p.code === 'L1-001')
    if (!milksha) throw new Error('Missing source shop L1-001')
    expect(milksha.name.en).toBe('MILKSHA')
    expect(milksha.feature.properties.source_coords).toBe('193,295,214,328')
    expect(milksha.feature.properties.boundary_correction).toBe(
      'minimum-corridor-width',
    )
    expect(manifest.boundaryCorrection.minimumCorridorWidthPixels).toBe(10)
    expect(data.opening_line.features).toHaveLength(0)
    expect(data.amenity_point.features).toHaveLength(25)
  })
  it('projects schematic pixels upright and refuses geographic routing', async () => {
    const level = String(data.level_polygon.features[0].properties.level_id)
    const projection = stationProjection(data, false, { bearing: 0, tilt: 0 })
    const a = projection.project([0, 0], level),
      b = projection.project([100, 100], level)
    expect(b[0] - a[0]).toBeCloseTo(20)
    expect(b[1] - a[1]).toBeCloseTo(20)
    expect(() => indoorNavigation(data)).toThrow('Schematic hotspots')
    expect(
      await findIndoorRoute(data, data.occupant_point.features[0], places(data)[0]),
    ).toBeNull()
  })

  it('includes reviewed boundaries, source unit identity and selectable facility anchors', () => {
    expect(
      data.level_polygon.features.every(
        f => f.properties.geometry_role === 'reviewed_artwork_trace',
      ),
    ).toBe(true)
    const entries = places(data)
    expect(
      entries.find(p => p.code === 'L1-130')?.feature.properties.geometry_role,
    ).toBe('clickable_hotspot')
    expect(entries.filter(p => p.category === 'escalator')).toHaveLength(7)
    expect(entries.filter(p => p.category === 'elevator')).toHaveLength(2)
    expect(entries.filter(p => p.category === 'restroom.accessible')).toHaveLength(2)
    expect(manifest.unmappedPlaces.map((p: { code: string }) => p.code)).toContain(
      'L1-006a',
    )
  })
} else {
  it.skip('requires external indoor archive in .research/indoor', () => {})
}
