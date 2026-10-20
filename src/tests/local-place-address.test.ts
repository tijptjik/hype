import { describe, expect, it } from 'vitest'
import {
  LocalPlaceAddressSchema,
  createLocalPlaceAddress,
} from '#lib/addresses/localPlaceAddress.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
import { materializePlaceAdoption } from '#lib/places/adoptionMaterialize.js'
import { planPlaceAdoption } from '#lib/places/adoption.js'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'
import type { AdoptionSourceRevision } from '#lib/places/adoption.js'

const authored = LocalPlaceAddressSchema.parse({
  ...createLocalPlaceAddress(),
  granularity: 'building',
  i18n: {
    en: {
      formattedAddress: '',
      buildingName: 'Example House',
      buildingNumberFrom: '12',
      buildingNumberTo: '14',
      streetName: 'Example Road',
      blockTypeBeforeNumber: false,
    },
    'zh-hant': { formattedAddress: '例子道12號' },
  },
  unit: {
    unitRef: 'A',
    unitType: 'S',
    floorRef: '2',
    floorType: 'F',
    unitPortion: null,
  },
})
const address = {
  ...emptyFeatureAddress(),
  source: { ...emptyFeatureAddress().source, authored },
}
const facts = {
  names: { en: 'Bakery' },
  phoneNumber: [],
  brands: [],
  location: {
    geometry: {
      type: 'Point' as const,
      coordinates: [114.17, 22.3] as [number, number],
    },
    address: address.source,
  },
}

describe('locally authored SaanSeoi address content', () => {
  it('round-trips canonical component types, locale content and unit semantics without upstream IDs', () => {
    expect(
      LocalPlaceInputSchema.parse({ state: 'manual', facts }).facts.location.address
        .authored,
    ).toEqual(authored)
    expect(getAddressLocale(address, 'en')).toMatchObject({
      buildingName: 'Example House',
      blockTypeBeforeNumber: false,
    })
    expect(getAddressDisplay(address, 'en')).toContain('Example House')
    expect(getAddressDisplay(address, 'en')).toContain('12-14 Example Road')
    expect(getAddressDisplay(address, 'en')).toContain('A')
    expect(getAddressDisplay(address, 'zhHant')).toContain('例子道12號')
  })
  it('rejects invented publisher evidence and wrong canonical types', () => {
    expect(
      LocalPlaceInputSchema.safeParse({
        state: 'manual',
        facts: {
          ...facts,
          location: {
            ...facts.location,
            address: { ...address.source, address2dId: 'fake' },
          },
        },
      }).success,
    ).toBe(false)
    expect(
      LocalPlaceAddressSchema.safeParse({
        ...authored,
        unit: { ...authored.unit, floorType: 'invalid' },
      }).success,
    ).toBe(false)
    expect(
      LocalPlaceAddressSchema.safeParse({
        ...authored,
        i18n: { en: { formattedAddress: '', blockTypeBeforeNumber: 'true' } },
      }).success,
    ).toBe(false)
    expect(
      LocalPlaceAddressSchema.safeParse({
        ...authored,
        unit: null,
        unitI18n: { en: { floorExpression: '2/F', unitExpression: 'Shop A' } },
      }).success,
    ).toBe(false)
  })
  it('preserves Feature corrections without mutating shared local content', () => {
    const corrected = {
      ...address,
      overrides: { en: { buildingName: 'Feature label' } },
    }
    expect(getAddressDisplay(corrected, 'en')).toContain('Feature label')
    expect(authored.i18n.en.buildingName).toBe('Example House')
    const materialized = materializePlaceAdoption({
      fieldGroup: 'location',
      facts,
      locationFacts: facts,
      overrides: {},
      data: {},
      i18n: { en: { title: 'Bakery' } },
    })
    expect(materialized.data.addressMeta?.address?.source.authored).toEqual(authored)
    expect(materialized.i18n.en.displayAddress).toBe(getAddressDisplay(address, 'en'))
  })
  it('reviews local address and unit changes without requiring a fabricated publisher identity', () => {
    const old: AdoptionSourceRevision = {
      id: 'one',
      placeId: 'p',
      sequence: 1,
      origin: 'local',
      ssId: null,
      payload: {},
      facts,
    }
    const next = structuredClone(old)
    next.id = 'two'
    next.sequence = 2
    next.facts.location.address.authored!.i18n.en.streetName = 'New Road'
    next.facts.location.address.authored!.unit!.unitRef = 'B'
    const plan = planPlaceAdoption({
      facts: old,
      location: old,
      candidate: next,
      overrides: {},
      policy: DEFAULT_PROJECT_PLACE_POLICY,
    })
    expect(plan.blockers).toEqual([])
    expect(plan.evidence).toMatchObject({
      addressChanged: true,
      unitChanged: true,
      establishmentChanged: false,
    })
    expect(plan.decision.location).toBe('review')
    const inherited = planPlaceAdoption({
      facts: old,
      location: old,
      candidate: next,
      overrides: { location: { mode: 'override', value: facts.location } },
      policy: {
        ...DEFAULT_PROJECT_PLACE_POLICY,
        address: 'automatic',
        unit: 'automatic',
      },
    })
    expect(inherited.effective.location).toEqual(facts.location)
  })
})
