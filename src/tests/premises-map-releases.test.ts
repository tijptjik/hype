// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  validateMapBundle,
  mapHash,
  mapReleaseKey,
  type MapBundle,
  type MapConnection,
} from '../lib/indoor/releases'
import { collection, type IndoorData } from '../lib/indoor/model'
import { connectionCandidates } from '../lib/indoor/spatial'

function fixture(): MapBundle & {
  data: IndoorData & { connections: MapConnection[] }
} {
  const polygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }
  const data: IndoorData = {
    retrievedAt: '2026-01-01',
    connections: [],
    venue_polygon: collection([]),
    level_polygon: collection([]),
    unit_polygon: collection([]),
    opening_line: collection([]),
    amenity_point: collection([]),
    occupant_point: collection([]),
  }
  data.venue_polygon.features = [
    { type: 'Feature', properties: { venue_id: 'venue' }, geometry: polygon },
  ]
  data.level_polygon.features = ['lower', 'upper'].map(level_id => ({
    type: 'Feature',
    properties: { level_id },
    geometry: polygon,
  }))
  data.unit_polygon.features = ['lower', 'upper'].map((level_id, i) => ({
    type: 'Feature',
    properties: { unit_id: `stairs-${i}`, level_id, unit_category: 'stairs' },
    geometry: polygon,
  }))
  data.connections = [
    {
      from: 'stairs-0',
      to: 'stairs-1',
      fromLevel: 'lower',
      toLevel: 'upper',
      category: 'stairs',
      direction: 'both',
      enabled: true,
      evidence: 'reviewed-layout',
      evidenceUrl: 'https://example.com/layout',
    },
  ]
  return {
    schemaVersion: 1,
    data: { ...data, connections: data.connections ?? [] },
    documents: [],
  }
}
describe('published map contract', () => {
  it('retains explicit edited connections and never recomputes an empty authored graph', () => {
    const bundle = validateMapBundle(fixture())
    expect(connectionCandidates(bundle.data)).toHaveLength(1)
    bundle.data.connections = []
    expect(connectionCandidates(bundle.data)).toEqual([])
  })
  it('rejects dangling endpoints, wrong floors and duplicate reversed connections', () => {
    const missing = fixture()
    missing.data.connections[0].to = 'missing'
    expect(() => validateMapBundle(missing)).toThrow('endpoints')
    const floor = fixture()
    floor.data.connections[0].toLevel = 'lower'
    expect(() => validateMapBundle(floor)).toThrow('endpoints')
    const duplicate = fixture()
    const c = duplicate.data.connections[0]
    duplicate.data.connections.push({
      ...c,
      from: c.to,
      to: c.from,
      fromLevel: c.toLevel,
      toLevel: c.fromLevel,
    })
    expect(() => validateMapBundle(duplicate)).toThrow('Duplicate')
  })
  it('requires evidence for reviewed links and finite geometry', () => {
    const evidence = fixture()
    delete evidence.data.connections[0].evidenceUrl
    expect(() => validateMapBundle(evidence)).toThrow('evidence')
    const invalid = fixture()
    invalid.data.unit_polygon.features[0].geometry = {
      type: 'Point',
      coordinates: [NaN, 1],
    }
    expect(() => validateMapBundle(invalid)).toThrow('coordinates')
  })
  it('changes immutable identities for edits and rejects key traversal', async () => {
    const a = fixture(),
      b = fixture()
    b.data.connections[0].enabled = false
    const hash = await mapHash(JSON.stringify(a))
    expect(hash).toHaveLength(64)
    expect(await mapHash(JSON.stringify(b))).not.toBe(hash)
    expect(mapReleaseKey('sample', hash)).toBe(
      `premises-maps/sample/releases/${hash}.json`,
    )
    expect(() => mapReleaseKey('../other', hash)).toThrow()
  })
})
