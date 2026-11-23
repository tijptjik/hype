import { describe, expect, it } from 'vitest'
import {
  createExteriorConnection,
  setConnectionDirection,
} from '../lib/indoor/connectionEditor'
import { validateMapBundle, type MapBundle } from '../lib/indoor/releases'
import {
  connectionIdentity,
  connectionValue,
  assessConnectionCorrection,
  applyConnectionCorrection,
} from '../lib/indoor/connectionCorrections'
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

function fixture(): MapBundle {
  const unit: IndoorFeature = {
    type: 'Feature',
    properties: { unit_id: 'ramp', unit_category: 'ramp', level_id: 'ground' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [114, 22],
          [114.001, 22],
          [114.001, 22.001],
          [114, 22.001],
          [114, 22],
        ],
      ],
    },
  }
  const data = Object.fromEntries(
    layerNames.map(name => [name, collection([])]),
  ) as unknown as IndoorData
  data.retrievedAt = '2026-11-16'
  data.venue_polygon = collection([{ ...unit, properties: { venue_id: 'v' } }])
  data.level_polygon = collection([
    { ...unit, properties: { level_id: 'ground', level_z_value: 0 } },
  ])
  data.unit_polygon = collection([unit])
  data.connections = [
    createExteriorConnection(
      unit,
      { label: 'Exit B · street', point: [114.002, 22] },
      { polygonIndex: 0, edgeIndex: 1 },
      'both',
    ),
  ]
  return { schemaVersion: 1, data, documents: [] }
}
describe('explicit exterior connections', () => {
  it('validates a portal and preserves its coordinate and physical entrance through all directions', () => {
    const bundle = fixture()
    const original = bundle.data.connections![0]
    for (const direction of ['forward', 'reverse', 'unknown', 'both'] as const) {
      const connection = setConnectionDirection(original, 'ramp', direction)
      bundle.data.connections = [connection]
      const checked = validateMapBundle(bundle).data.connections![0]
      expect(checked.fromExterior ?? checked.toExterior).toEqual(original.toExterior)
      expect(checked.fromEntrance ?? checked.toEntrance).toEqual(original.fromEntrance)
      expect(connectionIdentity(checked)).toBe(connectionIdentity(original))
    }
  })
  it('rejects fake floors, absent indoor entrances, two exterior endpoints and malformed coordinates', () => {
    for (const mutate of [
      (c: NonNullable<IndoorData['connections']>[number]) => {
        c.toLevel = 'ground'
      },
      (c: NonNullable<IndoorData['connections']>[number]) => {
        c.fromEntrance = null
      },
      (c: NonNullable<IndoorData['connections']>[number]) => {
        c.fromExterior = c.toExterior
      },
      (c: NonNullable<IndoorData['connections']>[number]) => {
        if (c.toExterior) c.toExterior.point = [999, 22]
      },
    ]) {
      const bundle = fixture()
      mutate(bundle.data.connections![0])
      expect(() => validateMapBundle(bundle)).toThrow()
    }
  })
  it('replays exterior metadata and requires review when the indoor geometry changes', () => {
    const baseline = fixture(),
      source = structuredClone(baseline)
    baseline.data.connections = []
    source.data.connections = []
    const pair = fixture().data.connections![0]
    const correction = {
      sourceDataset: 'test',
      sourceLayer: 'connection',
      sourceEntityId: connectionIdentity(pair),
      field: 'connection',
      originalValue: null,
      correctedValue: JSON.stringify(pair),
      sourceSnapshotHash: 'a'.repeat(64),
      reason: 'Outside ramp',
    }
    expect(assessConnectionCorrection(source, baseline, correction)).toBe('applied')
    applyConnectionCorrection(source, correction)
    expect(source.data.connections![0].toExterior).toEqual(pair.toExterior)
    expect(
      connectionValue({
        ...pair,
        toExterior: { label: 'Other street', point: [114.003, 22] },
      }),
    ).not.toBe(connectionValue(pair))
    source.data.unit_polygon.features[0].geometry = {
      type: 'Point',
      coordinates: [114, 22],
    }
    expect(assessConnectionCorrection(source, baseline, correction)).toBe('changed')
  })
})
