// @vitest-environment node
import { expect, it } from 'vitest'
import {
  BuildingEvidenceSchema,
  combineBuildingOutlines,
  type BuildingEvidence,
} from '#lib/locations/buildingEvidence.js'

/** Make a source footprint for adjacency and gap tests. @param x Western edge. @returns Reviewed evidence. */
function piece(x: number): BuildingEvidence {
  return {
    type: 'map',
    source: 'test-map',
    id: String(x),
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + 1, 0],
          [x + 1, 1],
          [x, 1],
          [x, 0],
        ],
      ],
    },
  }
}
it('combines adjacent slices into one outline without modifying source pieces', () => {
  const evidence = [piece(0), piece(1)]
  const original = structuredClone(evidence)
  const outline = combineBuildingOutlines(evidence)
  expect(outline?.type).toBe('MultiPolygon')
  expect(outline?.coordinates).toHaveLength(1)
  expect(evidence).toEqual(original)
})
it('retains gaps between separate footprint pieces', () => {
  expect(combineBuildingOutlines([piece(0), piece(3)])?.coordinates).toHaveLength(2)
})
it('does not invent geometry for upstream references', () => {
  const reference = BuildingEvidenceSchema.parse({
    type: 'saanseoi',
    source: { id: 'slice-1', release: 'release-1', addressId: 'address-1' },
  })
  expect(combineBuildingOutlines([reference])).toBeNull()
  expect(reference).toMatchObject({
    source: { id: 'slice-1', release: 'release-1', addressId: 'address-1' },
  })
})
it('requires a revision for HYPE evidence and a closed map outline', () => {
  expect(
    BuildingEvidenceSchema.safeParse({ type: 'location', locationId: 'building' })
      .success,
  ).toBe(false)
  expect(
    BuildingEvidenceSchema.safeParse({
      type: 'map',
      source: 'map',
      id: 'piece',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      },
    }).success,
  ).toBe(false)
})
