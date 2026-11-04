// @vitest-environment node
import { expect, it } from 'vitest'
import { emptyFeatureAddress, getAddressLocale } from '#lib/addresses/featureAddress.js'
import {
  missingMapParts,
  applyMapMissingParts,
} from '#lib/addresses/mapMissingParts.js'
import { buildingNamesAt } from '#lib/map/buildingAddress.js'

it('offers Tower B from the containing building label, without changing the draft', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    premisesName: 'Hollywood Terrace',
    buildingNumberExpression: '123',
    streetName: 'Hollywood Road',
  }
  const parts = missingMapParts(address, ['Hollywood Terrace Tower B'], '123')
  expect(parts).toEqual({ block: { type: 'tower', ref: 'B', label: 'Tower B' } })
  expect(getAddressLocale(address, 'en').blockRef).toBeUndefined()
  const next = applyMapMissingParts(address, parts)
  expect(getAddressLocale(next, 'en')).toMatchObject({
    blockType: 'tower',
    blockRef: 'B',
    blockExpression: 'Tower B',
    premisesName: 'Hollywood Terrace',
    buildingNumberExpression: '123',
    streetName: 'Hollywood Road',
  })
  expect(next.source).toEqual(address.source)
})
it('rejects conflicting labels and does not parse an ordinary building name as a block', () => {
  expect(
    missingMapParts(
      emptyFeatureAddress(),
      ['Hollywood Terrace Tower A', 'Hollywood Terrace Tower B'],
      null,
    ),
  ).toEqual({})
  expect(
    missingMapParts(emptyFeatureAddress(), ['Tower Hill', 'Hollywood Terrace'], null),
  ).toEqual({})
  expect(
    missingMapParts(
      emptyFeatureAddress(),
      ['Hollywood Terrace Tower B', 'Hollywood Terrace Tower B'],
      null,
    ).block?.ref,
  ).toBe('B')
})
it('preserves values entered or explicitly cleared before acceptance', () => {
  const address = emptyFeatureAddress()
  const parts = missingMapParts(address, ['Tower B'], '123')
  address.overrides.en = { blockRef: 'A', buildingNumberExpression: '125' }
  expect(getAddressLocale(applyMapMissingParts(address, parts), 'en')).toMatchObject({
    blockRef: 'A',
    buildingNumberExpression: '125',
  })
  address.overrides.en = { blockExpression: null, buildingNumberExpression: null }
  expect(missingMapParts(address, ['Tower B'], '123')).toEqual({})
})
it('only reads labels inside the containing building footprint', async () => {
  const polygon = {
    id: 'b',
    properties: { kind: 'building', source_id: 'b' },
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
      ],
    },
  }
  const label = (name: string, coordinates: number[]) => ({
    properties: { name },
    geometry: { type: 'Point', coordinates },
  })
  const map = {
    getZoom: () => 20,
    areTilesLoaded: () => true,
    getStyle: () => ({ layers: [{ source: 'base', 'source-layer': 'buildings' }] }),
    getSource: () => ({}),
    querySourceFeatures: (source: string) =>
      source === 'base'
        ? [polygon]
        : [
            label('Hollywood Terrace Tower B', [2, 2]),
            label('Hollywood Terrace Tower A', [6, 2]),
          ],
  }
  expect(await buildingNamesAt(map as never, [2, 2])).toEqual([
    'Hollywood Terrace Tower B',
  ])
})

it('finds Tower B through overlapping podium and tower geometry in either source order', async () => {
  const polygon = (id: string, coordinates: number[][]) => ({
    id,
    properties: { kind: 'building', source_id: id },
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  })
  const podium = polygon('podium', [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ])
  const tower = polygon('tower', [
    [2, 2],
    [5, 2],
    [5, 5],
    [2, 5],
    [2, 2],
  ])
  const label = {
    properties: { name: 'Hollywood Terrace Tower B' },
    geometry: { type: 'Point', coordinates: [3, 3] },
  }
  for (const buildings of [
    [podium, tower],
    [tower, podium],
  ]) {
    const map = {
      getZoom: () => 20,
      areTilesLoaded: () => true,
      getStyle: () => ({ layers: [{ source: 'base', 'source-layer': 'buildings' }] }),
      getSource: () => ({}),
      querySourceFeatures: (source: string) =>
        source === 'base' ? buildings : [label],
    }
    const names = await buildingNamesAt(map as never, [4, 4])
    expect(names).toEqual(['Hollywood Terrace Tower B'])
    expect(missingMapParts(emptyFeatureAddress(), names, null).block?.ref).toBe('B')
  }
})

it('preserves conflicting tower labels for ambiguity checking instead of choosing the first footprint', async () => {
  const polygon = (id: string, name: string) => ({
    id,
    properties: { kind: 'building', source_id: id, name },
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
      ],
    },
  })
  const map = {
    getZoom: () => 20,
    areTilesLoaded: () => true,
    getStyle: () => ({ layers: [{ source: 'base', 'source-layer': 'buildings' }] }),
    getSource: () => null,
    querySourceFeatures: () => [polygon('a', 'Tower A'), polygon('b', 'Tower B')],
  }
  const names = await buildingNamesAt(map as never, [2, 2])
  expect(names).toEqual(['Tower A', 'Tower B'])
  expect(missingMapParts(emptyFeatureAddress(), names, null)).toEqual({})
})
