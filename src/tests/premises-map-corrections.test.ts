import { describe, expect, it } from 'vitest'
import {
  applyMapCorrection,
  assessMapCorrection,
  type MapCorrection,
} from '../lib/indoor/corrections'
import { layerNames, type IndoorData } from '../lib/indoor/model'
import type { MapBundle } from '../lib/indoor/releases'

const correction: MapCorrection = {
  sourceDataset: 'landsd-mtr',
  sourceLayer: 'level_polygon',
  sourceEntityId: 'exit-b',
  field: 'level_name_en',
  originalValue: 'Platform Level',
  correctedValue: 'Exit B Staircase',
  sourceSnapshotHash: 'a'.repeat(64),
  reason: 'Exit B stairs and landing',
}
function source(): MapBundle {
  const data = Object.fromEntries(
    layerNames.map(layer => [layer, { type: 'FeatureCollection', features: [] }]),
  ) as unknown as IndoorData
  data.retrievedAt = '2026-11-15'
  const feature = {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
    properties: { level_id: 'exit-b', level_name_en: 'Platform Level' },
  }
  data.level_polygon.features.push(feature)
  data.unit_polygon.features.push(structuredClone(feature))
  return { schemaVersion: 1, data, documents: [] }
}
describe('materialized map corrections', () => {
  it('reapplies by identity without mutating raw source and keeps child labels consistent', () => {
    const raw = source(),
      next = source(),
      derived = structuredClone(next)
    next.data.retrievedAt = '2026-11-16'
    expect(assessMapCorrection(next, raw, correction)).toBe('applied')
    applyMapCorrection(derived, correction)
    expect(derived.data.level_polygon.features[0].properties.level_name_en).toBe(
      'Exit B Staircase',
    )
    expect(derived.data.unit_polygon.features[0].properties.level_name_en).toBe(
      'Exit B Staircase',
    )
    expect(raw.data.level_polygon.features[0].properties.level_name_en).toBe(
      'Platform Level',
    )
  })
  it('does not transfer a correction to an identical polygon with a new identity', () => {
    const next = source()
    next.data.level_polygon.features[0].properties.level_id = 'replacement'
    expect(assessMapCorrection(next, source(), correction)).toBe('missing')
  })
  it('requires attention for changed geometry, changed text or a missing baseline', () => {
    const next = source()
    next.data.level_polygon.features[0].geometry = {
      type: 'Point',
      coordinates: [2, 2],
    }
    expect(assessMapCorrection(next, source(), correction)).toBe('changed')
    expect(assessMapCorrection(source(), undefined, correction)).toBe(
      'baseline-unavailable',
    )
    const renamed = source()
    renamed.data.level_polygon.features[0].properties.level_name_en = 'New use'
    expect(assessMapCorrection(renamed, source(), correction)).toBe('changed')
    const recategorized = source()
    recategorized.data.level_polygon.features[0].properties.level_category = 'platform'
    expect(assessMapCorrection(recategorized, source(), correction)).toBe('changed')
  })
  it('recognizes upstream adoption only when geometry still matches', () => {
    const next = source()
    next.data.level_polygon.features[0].properties.level_name_en =
      correction.correctedValue
    expect(assessMapCorrection(next, source(), correction)).toBe('upstream-adopted')
    next.data.level_polygon.features[0].geometry = {
      type: 'Point',
      coordinates: [2, 2],
    }
    expect(assessMapCorrection(next, source(), correction)).toBe('changed')
  })
})
