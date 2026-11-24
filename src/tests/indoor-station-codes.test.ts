import { expect, test } from 'vitest'
import {
  collection,
  layerNames,
  places,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

for (const [id, number] of [
  ['82553377-d9d9-43af-998b-292f31fb5ea4', 3],
  ['0e4e859d-66c1-4d7e-b44f-7ee7b9a5e47e', 2],
  ['03e314d3-c413-40e9-8f7b-91962d8f7cc8', 9],
] as const) {
  test(`Sheung Wan ${number} uses SHW for code and fallback name without changing source`, () => {
    const unit: IndoorFeature = {
      type: 'Feature',
      properties: {
        unit_id: id,
        unit_name_en: `SWH ${number}`,
        unit_category: 'retail',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    }
    const data = {
      ...Object.fromEntries(layerNames.map(name => [name, collection([])])),
      unit_polygon: collection([unit]),
    } as IndoorData
    const place = places(data)[0]
    expect(place.code).toBe(`SHW ${number}`)
    expect(place.name.en).toBe(`SHW ${number}`)
    expect(unit.properties.unit_name_en).toBe(`SWH ${number}`)
  })
}
