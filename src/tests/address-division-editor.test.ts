// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  AddressDivisionOverridesSchema,
  effectiveAddressDivisions,
  orderAddressDivisions,
} from '#lib/addresses/divisions.js'
import { localAddressContent, localAddressDraft } from '#lib/addresses/locationDraft.js'
import {
  createLocalLocationAddress,
  LocalLocationAddressSchema,
} from '#lib/addresses/localLocationAddress.js'
import {
  setAddressExpression,
  setStructuredAddressExpression,
} from '#lib/addresses/addressExpressions.js'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { addressComponentValue } from '#lib/addresses/presentation.js'
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
    expect(AddressDivisionOverridesSchema.parse({ localityPath: [other.id] })).toEqual({
      localityPath: [other.id],
    })
  })
  it('replaces or omits a hood while factual geography stays fixed', () => {
    expect(
      effectiveAddressDivisions(context, { localityPath: [other.id] }).map(
        item => item.id,
      ),
    ).toEqual([other.id, district.id, island.id])
    expect(
      effectiveAddressDivisions(context, { localityPath: [] }).map(item => item.id),
    ).toEqual([district.id, island.id])
    expect(
      effectiveAddressDivisions(context, { localityPath: [district.id] }).map(
        item => item.id,
      ),
    ).toEqual([district.id, island.id])
  })
  it('keeps From marker dynamic across moves, instead of freezing the old membership', () => {
    const reset = { localityPath: null }
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

describe('shared Location/Feature expression editor round trips', () => {
  it('preserves unparsed address text through a partial component correction', () => {
    const content = createLocalLocationAddress({
      en: 'Virtue Court, Man Mo Temple, 130 Hollywood Rd',
    })
    const draft = setAddressExpression(
      localAddressDraft(content),
      'en',
      'buildingNumberExpression',
      '140-142',
    )
    expect(getAddressDisplay(draft, 'en')).toBe(content.i18n.en.formattedAddress)
    const saved = localAddressContent(draft)
    expect(getAddressDisplay(localAddressDraft(saved), 'en')).toBe(
      content.i18n.en.formattedAddress,
    )
    expect(saved.i18n.en.buildingNumberFrom).toBe('140')
  })
  it('combines stored number endpoints into one field and saves parsed changes in all languages', () => {
    const content = createLocalLocationAddress()
    content.i18n = {
      en: {
        formattedAddress: '',
        streetName: 'Hollywood Road',
        buildingNumberFrom: '130',
        buildingNumberTo: '132',
      },
      'zh-hant': { formattedAddress: '', streetName: '荷李活道' },
    }
    const original = structuredClone(content)
    let draft = localAddressDraft(content)
    expect(addressComponentValue(draft, 'en', 'buildingNumberExpression')).toBe(
      '130-132',
    )
    draft = setAddressExpression(draft, 'en', 'buildingNumberExpression', '140-142')
    const saved = localAddressContent(draft)
    expect(saved.i18n.en).toMatchObject({
      buildingNumberFrom: '140',
      buildingNumberTo: '142',
      buildingNumberExpression: '140-142',
    })
    expect(saved.i18n['zh-hant']).toMatchObject({
      streetName: '荷李活道',
      buildingNumberFrom: '140',
    })
    expect(getAddressDisplay(localAddressDraft(saved), 'en')).toBe(
      '140-142 Hollywood Road',
    )
    expect(content).toEqual(original)
  })
  it('saves floor/unit semantics and translated expressions without source inventory identities', () => {
    const content = createLocalLocationAddress({ en: 'Example Road' })
    let draft = localAddressDraft(content)
    draft = setStructuredAddressExpression(draft, 'en', 'floorExpression', '3/F')
    draft = setStructuredAddressExpression(draft, 'en', 'unitExpression', 'Shop A')
    const saved = localAddressContent(draft)
    expect(saved.unit).toMatchObject({
      floorRef: '3',
      floorType: 'F',
      unitRef: 'A',
      unitType: 'S',
    })
    expect(saved.unitI18n['zh-hant'].floorExpression).toBeTruthy()
    expect(saved).not.toHaveProperty('address3dUnitId')
    expect(getAddressDisplay(localAddressDraft(saved), 'en')).toContain('Shop A')
  })
  it('removes factual authored IDs and resets inherited subjective IDs without storing fake IDs', () => {
    const content = createLocalLocationAddress()
    Object.assign(content, {
      countryId: 'country',
      areaId: 'area',
      districtId: 'district',
      islandId: 'island',
      neighbourhoodId: hood.id,
    })
    const draft = localAddressDraft(content)
    draft.divisionOverrides = { localityPath: null }
    const saved = localAddressContent(draft)
    for (const field of [
      'countryId',
      'areaId',
      'districtId',
      'islandId',
      'neighbourhoodId',
    ])
      expect(saved).not.toHaveProperty(field)
  })
  it('retains other-language names while changing one locale and derives block ordering', () => {
    const content = createLocalLocationAddress()
    content.i18n = {
      en: {
        formattedAddress: '',
        buildingName: 'Old House',
        blockRef: 'A',
        blockType: 'block',
      },
      'zh-hant': { formattedAddress: '', buildingName: '舊大廈' },
    }
    let draft = localAddressDraft(content)
    expect(addressComponentValue(draft, 'en', 'blockExpression')).toBe('Block A')
    draft = setAddressExpression(draft, 'en', 'buildingName', 'New House')
    const saved = localAddressContent(draft)
    expect(saved.i18n['zh-hant'].buildingName).toBe('舊大廈')
    expect(saved.i18n.en.buildingName).toBe('New House')
  })
})
