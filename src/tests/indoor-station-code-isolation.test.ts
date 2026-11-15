// TEST
import { describe, expect, it } from 'bun:test'
// DOMAIN
import {
  collection,
  layerNames,
  places,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

describe('reviewed station code corrections', () => {
  it('corrects only the three reviewed Sheung Wan units and retains raw source labels', () => {
    const labels = [
      ['82553377-d9d9-43af-998b-292f31fb5ea4', 'SWH 3', 'SHW 3'],
      ['0e4e859d-66c1-4d7e-b44f-7ee7b9a5e47e', 'SWH 2', 'SHW 2'],
      ['03e314d3-c413-40e9-8f7b-91962d8f7cc8', 'SWH 9', 'SHW 9'],
      ['32c63a50-e9cf-4c1a-8a2f-e2842cf3203a', 'SWH 8', 'SWH 8'],
      ['unreviewed', 'SWH 9', 'SWH 9'],
      ['032c7d51-0338-4f28-98d4-1a36b82263b8', 'HOK 62', 'HOK 62'],
    ]
    const data = {
      ...Object.fromEntries(layerNames.map(layer => [layer, collection([])])),
      retrievedAt: '2026-11-16T00:00:00Z',
    } as IndoorData
    data.unit_polygon = collection(
      labels.map(
        ([id, label]): IndoorFeature => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [114, 22] },
          properties: {
            unit_id: id,
            unit_name_en: label,
            unit_unitnumbername: label,
            unit_category: 'retail',
          },
        }),
      ),
    )
    const before = structuredClone(data)
    const result = places(data)
    for (const [id, , code] of labels) {
      expect(result.find(place => place.id === id)?.code).toBe(code)
      expect(result.find(place => place.id === id)?.name.en).toBe(code)
    }
    expect(data).toEqual(before)
  })
})
