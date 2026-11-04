// @vitest-environment node
import { expect, it } from 'vitest'
import {
  buildingStreetNumber,
  type SelectedBuilding,
} from '#lib/map/buildingAddress.js'

const building: SelectedBuilding = {
  id: '71',
  source: 'map',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ],
      [
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 2],
        [1, 1],
      ],
    ],
  },
}
const label = (number: string, point = [3, 3]) => ({
  properties: { kind: 'address', addr_housenumber: number },
  geometry: { type: 'Point' as const, coordinates: point },
})
it('uses a contained address point, excluding neighbouring buildings and courtyards', () => {
  expect(
    buildingStreetNumber(building, [
      label('71'),
      label('72', [5, 3]),
      label('73', [1.5, 1.5]),
    ]),
  ).toBe('71')
})
it('deduplicates tile labels and preserves number ranges', () => {
  expect(buildingStreetNumber(building, [label('71-75'), label('71-75')])).toBe('71-75')
})
it('rejects missing and conflicting numbers, including footprint conflicts', () => {
  expect(buildingStreetNumber(building, [])).toBeNull()
  expect(buildingStreetNumber(building, [label('71'), label('72')])).toBeNull()
  expect(
    buildingStreetNumber({ ...building, properties: { 'addr:housenumber': '70' } }, [
      label('71'),
    ]),
  ).toBeNull()
})
it('reads footprint number aliases without interpreting a building name', () => {
  expect(
    buildingStreetNumber(
      { ...building, properties: { 'addr:housenumber': '71A' } },
      [],
    ),
  ).toBe('71A')
  expect(
    buildingStreetNumber({ ...building, properties: { name: '71' } }, []),
  ).toBeNull()
})
