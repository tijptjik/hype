import { expect, it } from 'vitest'
import {
  ASSOCIATION_ATTENTION_SCORE,
  associationGroupDiffers,
  associationMatch,
} from '#lib/locations/associationMatch.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'

const original = (): Result => ({
  id: 'address',
  kind: 'address',
  names: {},
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: {
      en: {
        buildingName: 'Fu Yee Court',
        streetName: 'Ferry Street',
        buildingNumberExpression: '11–16',
        blockTypeBeforeNumber: true,
      },
    },
  },
})
const candidate = (number = '11-16'): Result => ({
  ...original(),
  id: `building:${number}`,
  kind: 'building',
  names: { en: 'Fu Yee Court' },
  buildingSource: { id: 'fu-yee', release: 'test', addressId: number },
  address: {
    ...original().address,
    overrides: {
      en: {
        buildingName: 'Fu Yee Court',
        streetName: 'Ferry Street',
        buildingNumberFrom: number.split('-')[0],
        buildingNumberTo: number.split('-')[1] ?? '',
        buildingNumberConnector: '-',
      },
    },
  },
})
it('matches equivalent structured ranges and ignores empty block formatting flags', () => {
  expect(
    associationGroupDiffers(original().address, candidate().address, 'number'),
  ).toBe(false)
  expect(
    associationGroupDiffers(original().address, candidate().address, 'block'),
  ).toBe(false)
  expect(associationMatch(original(), candidate())).toEqual({ score: 100, exact: true })
})
it('ranks the exact range above individual entrances without treating overlap as equality', () => {
  expect(associationMatch(original(), candidate('14'))).toEqual({
    score: 75,
    exact: false,
  })
})
it('does not infer identity from names outside the matching radius or with a conflicting unit', () => {
  const distant = candidate()
  distant.address.coordinates = [114.2, 22.3]
  expect(associationMatch(original(), distant).exact).toBe(false)
  const different = candidate()
  different.address.overrides.en.unitExpression = 'Flat B'
  expect(associationMatch(original(), different).exact).toBe(false)
})

it('surfaces a nearby cross-kind theatre name without treating missing fields as conflicts or inferring identity', () => {
  const building: Result = {
    id: 'theatre-building',
    kind: 'building',
    names: { en: 'Disney’s Storybook Theater' },
    address: {
      ...emptyFeatureAddress(),
      coordinates: [114.15, 22.3],
      overrides: { en: { buildingName: 'Disney’s Storybook Theater' } },
    },
  }
  const theatre: Result = {
    id: 'theatre-place',
    kind: 'establishment',
    names: { en: 'Storybook Theater' },
    address: { ...emptyFeatureAddress(), coordinates: [114.15014, 22.3] },
  }
  expect(associationMatch(building, theatre)).toEqual({ score: 70, exact: false })
  expect(associationMatch(building, theatre).score).toBeGreaterThanOrEqual(
    ASSOCIATION_ATTENTION_SCORE,
  )
  expect(
    associationMatch(building, { ...theatre, names: { en: 'Theater' } }).score,
  ).toBeLessThan(ASSOCIATION_ATTENTION_SCORE)
  expect(
    associationMatch(building, { ...theatre, names: { en: 'Unrelated Cafe' } }).score,
  ).toBeLessThan(ASSOCIATION_ATTENTION_SCORE)
  expect(
    associationMatch(building, {
      ...theatre,
      address: { ...theatre.address, coordinates: [114.2, 22.3] },
    }).score,
  ).toBeLessThan(ASSOCIATION_ATTENTION_SCORE)
})
