import { describe, expect, it } from 'vitest'
import { prepareCorrectedMap } from '../lib/db/services/premisesMapCorrection'
import { layerNames, type IndoorData } from '../lib/indoor/model'
import type { Database } from '../lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'

describe('source retention and facility normalization', () => {
  it('retains the raw baseline before normalizing the derived draft', async () => {
    const data = {
      ...Object.fromEntries(
        layerNames.map(layer => [layer, { type: 'FeatureCollection', features: [] }]),
      ),
      retrievedAt: '2026-11-15T00:00:00Z',
      connections: [],
    } as unknown as IndoorData
    const feature = (properties: Record<string, unknown>) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [114, 22] },
      properties,
    })
    data.venue_polygon.features = [feature({ venue_id: 'venue' })]
    data.level_polygon.features = [feature({ level_id: 'level' })]
    data.unit_polygon.features = [
      feature({
        unit_id: 'ramp',
        level_id: 'level',
        unit_category: 'ramp',
        unit_name_en: 'RAMP',
      }),
    ]
    const writes: string[] = []
    const bucket = {
      put: async (_key: string, text: string) => {
        writes.push(text)
      },
    } as unknown as R2Bucket
    const result = await prepareCorrectedMap({} as Database, bucket, {
      id: 'station',
      sourceDataset: 'landsd-mtr',
      bundle: { schemaVersion: 1, data, documents: [] },
      corrections: [],
    })
    expect(writes).toHaveLength(1)
    expect(
      JSON.parse(writes[0]).data.unit_polygon.features[0].properties.unit_name_en,
    ).toBe('RAMP')
    expect(result.data.unit_polygon.features[0].properties.unit_name_en).toBe('Ramp')
    expect(result.data.sourceSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(data.unit_polygon.features[0].properties.unit_name_en).toBe('RAMP')
  })
})
