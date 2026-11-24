// @vitest-environment node
import { expect, it } from 'vitest'
import {
  addFloorLine,
  distributeFloorLines,
  facadeViews,
  floorLineLabel,
  validFloorDesignation,
  moveFloorLine,
  removeFloorLine,
} from '../lib/locations/exterior/floorAlignment'
import {
  surfaceMarkerPosition,
  type BuildingSurface,
} from '../lib/locations/exterior/surfacePlacement'
import { segmentFacades } from '../lib/locations/exterior/facades'
const lines = [0, 1, 4, 8, 10].map((elevation, i) => ({
  id: String(i),
  elevation,
  locked: i === 2,
}))
it('distributes unlocked lines separately between locked anchors and endpoints', () => {
  expect(distributeFloorLines(lines).map(line => line.elevation)).toEqual([
    0, 2, 4, 7, 10,
  ])
  expect(lines.map(line => line.elevation)).toEqual([0, 1, 4, 8, 10])
})
it('allows dragging a top boundary without moving other lines; locks prevent dragging', () => {
  expect(moveFloorLine(lines, '4', 12, [0, 20]).map(line => line.elevation)).toEqual([
    0, 1, 4, 8, 12,
  ])
  expect(moveFloorLine(lines, '2', 6, [0, 20])).toEqual(lines)
  expect(moveFloorLine(lines, '1', 9, [0, 20])[1].elevation).toBeCloseTo(3.99)
})
it('adds and distributes a floor without moving the endpoints or a locked line', () => {
  const result = addFloorLine(lines, 'new')
  expect(result).toHaveLength(6)
  expect(result[0].elevation).toBe(0)
  expect(result.at(-1)?.elevation).toBe(10)
  expect(result.find(line => line.id === '2')?.elevation).toBe(4)
  expect(result.filter(line => line.elevation > 4).map(line => line.elevation)).toEqual(
    [6, 8, 10],
  )
})
it('combines disconnected facade fragments into a directional view rather than 177 individual choices', () => {
  const analysis = segmentFacades(
    [
      {
        id: 'a',
        vertices: [
          [0, 0, 0],
          [4, 0, 0],
          [4, 6, 0],
        ],
      },
      {
        id: 'b',
        vertices: [
          [10, 0, 0],
          [14, 0, 0],
          [14, 6, 0],
        ],
      },
    ],
    { assetId: 'a' },
  )
  const views = facadeViews(analysis.facades)
  expect(views).toHaveLength(1)
  expect(views[0].surfaceIds).toHaveLength(2)
  expect(views[0].width).toBe(14)
})
const surface: BuildingSurface = {
  id: 'wall',
  revisionId: 'alignment-1',
  modelAssetId: 'revision',
  buildingPartId: 'unit',
  realm: 'exterior',
  floorId: '1',
  unitId: 'A',
  frame: { origin: [10, 3, 20], right: [1, 0, 0], up: [0, 1, 0], width: 8, height: 4 },
  polygon: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ],
}
const marker = {
  surfaceId: 'wall',
  surfaceRevisionId: 'alignment-1',
  modelAssetId: 'revision',
  buildingPartId: 'unit',
  realm: 'exterior' as const,
  u: 0.25,
  v: 0.5,
}
it('resolves normalized coordinates in a vertical exterior or horizontal interior frame', () => {
  expect(surfaceMarkerPosition(surface, marker)).toEqual([12, 5, 20])
  expect(
    surfaceMarkerPosition(
      { ...surface, realm: 'interior', frame: { ...surface.frame, up: [0, 0, 1] } },
      { ...marker, realm: 'interior' },
    ),
  ).toEqual([12, 3, 22])
})
it('rejects mismatched revisions, realms, out-of-range percentages and polygon holes', () => {
  expect(() =>
    surfaceMarkerPosition(surface, { ...marker, modelAssetId: 'old' }),
  ).toThrow()
  expect(() =>
    surfaceMarkerPosition(surface, { ...marker, surfaceRevisionId: 'old' }),
  ).toThrow()
  expect(() =>
    surfaceMarkerPosition(surface, { ...marker, realm: 'interior' }),
  ).toThrow()
  expect(() => surfaceMarkerPosition(surface, { ...marker, u: 1.1 })).toThrow()
  expect(() =>
    surfaceMarkerPosition(
      {
        ...surface,
        polygon: [
          ...surface.polygon,
          [
            [0.1, 0.1],
            [0.6, 0.1],
            [0.6, 0.6],
            [0.1, 0.6],
          ],
        ],
      },
      marker,
    ),
  ).toThrow()
})

it('removes only unlocked intermediate boundaries without redistributing', () => {
  expect(removeFloorLine(lines, '1')).toEqual([lines[0], lines[2], lines[3], lines[4]])
  for (const id of ['0', '4', '2', 'missing'])
    expect(removeFloorLine(lines, id)).toEqual(lines)
  const two = [lines[0], lines[4]]
  expect(removeFloorLine(two, '0')).toEqual(two)
  expect(removeFloorLine(two, '4')).toEqual(two)
})

it('names basement and ground floors independently of boundary order and preserves metadata during edits', () => {
  const named = lines.map((line, index) => ({
    ...line,
    designation: {
      type:
        index < 2
          ? ('basement' as const)
          : index === 2
            ? ('ground' as const)
            : ('floor' as const),
      number: index < 2 ? 2 - index : 1,
    },
  }))
  expect(named.map((line, index) => floorLineLabel(line, index, named.length))).toEqual(
    ['Basement 2', 'Basement 1', 'Ground floor', 'Floor 1', 'Top'],
  )
  const edited = removeFloorLine(distributeFloorLines(addFloorLine(named, 'new')), '1')
  for (const line of edited.filter(line => line.id !== 'new'))
    expect(line.designation).toEqual(
      named.find(original => original.id === line.id)?.designation,
    )
  expect(validFloorDesignation(undefined)).toBe(true)
  expect(validFloorDesignation({ type: 'basement', number: -1 })).toBe(false)
  expect(validFloorDesignation({ type: 'unknown', number: 1 })).toBe(false)
})

it('supports arbitrary multilingual names and restores generated names when cleared', () => {
  for (const name of ['LG2', '12A', 'Mezzanine / Podium', '天台', '地下低層']) {
    const line = {
      ...lines[1],
      designation: { type: 'floor' as const, number: 12, name },
    }
    expect(validFloorDesignation(line.designation)).toBe(true)
    expect(floorLineLabel(line, 1, 5)).toBe(name)
    expect(floorLineLabel(JSON.parse(JSON.stringify(line)), 1, 5)).toBe(name)
    expect(distributeFloorLines([lines[0], line, lines[4]])[1].designation?.name).toBe(
      name,
    )
    expect(
      floorLineLabel(
        { ...line, designation: { ...line.designation, name: '  ' } },
        1,
        5,
      ),
    ).toBe('Floor 12')
  }
  expect(validFloorDesignation({ type: 'floor', number: 1, name: 123 })).toBe(false)
})
