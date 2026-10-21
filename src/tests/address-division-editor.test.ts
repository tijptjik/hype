// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  AddressDivisionOverridesSchema,
  effectiveAddressDivisions,
  orderAddressDivisions,
} from '#lib/addresses/divisions.js'
import {
  createLocalLocationAddress,
  LocalLocationAddressSchema,
} from '#lib/addresses/localLocationAddress.js'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
} from '#lib/addresses/featureAddress.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import type {
  AddressDivision,
  AddressDivisionContext,
} from '#lib/addresses/divisions.js'

const division = (
  id: string,
  kind: string,
  level: number,
  category = 'hood',
): AddressDivision => ({
  id,
  class: kind,
  category,
  level,
  names: { en: { name: id } },
})
const district = division('Central and Western', 'district', 3, 'administrative')
const island = division('Hong Kong Island', 'major_island', 3, 'landform')
const hood = division('Sheung Wan', 'neighbourhood', 5)
const other = division('Central', 'neighbourhood', 5)
const context: AddressDivisionContext = {
  available: true,
  memberships: [district, island, hood],
  options: [hood, other],
}

describe('marker-derived geography and subjective address choices', () => {
  it('rejects city overrides in Feature and Location address contracts', () => {
    expect(
      AddressDivisionOverridesSchema.safeParse({ cityId: 'kowloon' }).success,
    ).toBe(false)
    expect(
      FeatureAddressSchema.safeParse({
        ...emptyFeatureAddress(),
        divisionOverrides: { cityId: 'kowloon' },
      }).success,
    ).toBe(false)
    expect(
      LocationFactsSchema.shape.location.shape.address.safeParse({
        ...emptyFeatureAddress().source,
        divisionOverrides: { cityId: 'kowloon' },
      }).success,
    ).toBe(false)
    expect(
      LocalLocationAddressSchema.safeParse({
        ...createLocalLocationAddress(),
        cityId: 'kowloon',
      }).success,
    ).toBe(false)
  })
  it('excludes city memberships while keeping districts even when their names contain City', () => {
    const city = division('Kowloon', 'city', 3, 'locality')
    const cityDistrict = division(
      'Kowloon City District',
      'district',
      3,
      'administrative',
    )
    const source = {
      ...context,
      memberships: [city, cityDistrict, hood],
      options: [city, hood],
    }
    expect(effectiveAddressDivisions(source, {}).map(item => item.id)).toEqual([
      hood.id,
      cityDistrict.id,
    ])
    expect(orderAddressDivisions([city])).toEqual([])
    expect(source.memberships).toContain(city)
  })
  it('rejects administrative and landform override keys, including transport payloads', () => {
    for (const key of ['countryId', 'areaId', 'districtId', 'islandId'])
      expect(
        AddressDivisionOverridesSchema.safeParse({ [key]: 'invented' }).success,
      ).toBe(false)
    expect(AddressDivisionOverridesSchema.parse({ neighbourhoodId: other.id })).toEqual(
      { neighbourhoodId: other.id },
    )
  })
  it('replaces or omits a hood while factual geography stays fixed', () => {
    expect(
      effectiveAddressDivisions(context, { neighbourhoodId: other.id }).map(
        item => item.id,
      ),
    ).toEqual([other.id, district.id, island.id])
    expect(
      effectiveAddressDivisions(context, { neighbourhoodId: null }).map(
        item => item.id,
      ),
    ).toEqual([district.id, island.id])
    expect(
      effectiveAddressDivisions(context, { neighbourhoodId: district.id }).map(
        item => item.id,
      ),
    ).toEqual([district.id, island.id])
  })
  it('keeps From marker dynamic across moves, instead of freezing the old membership', () => {
    const reset = { neighbourhoodId: { mode: 'marker' as const } }
    expect(effectiveAddressDivisions(context, reset)).toContain(hood)
    const moved = { ...context, memberships: [district, island, other] }
    expect(effectiveAddressDivisions(moved, reset)).toContain(other)
    expect(effectiveAddressDivisions(moved, reset)).not.toContain(hood)
  })
  it('keeps country last and preserves the special Hong Kong Island order', () => {
    const country = division('China', 'country', 1, 'administrative')
    const area = division('Hong Kong', 'area', 2, 'administrative')
    expect(
      orderAddressDivisions([country, island, hood, area, district]).map(
        item => item.id,
      ),
    ).toEqual([hood.id, district.id, island.id, area.id, country.id])
    const minor = division('Other island', 'minor_island', 2, 'landform')
    expect(
      orderAddressDivisions([country, minor, district, area]).map(item => item.id),
    ).toEqual([minor.id, district.id, area.id, country.id])
  })
})
