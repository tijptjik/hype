import { describe, expect, it } from 'vitest'
import {
  LocalLocationAddressSchema,
  createLocalLocationAddress,
} from '#lib/addresses/localLocationAddress.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
import { materializeLocationAdoption } from '#lib/locations/adoptionMaterialize.js'
import { planLocationAdoption } from '#lib/locations/adoption.js'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
import type { AdoptionSourceRevision } from '#lib/locations/adoption.js'

const authored = LocalLocationAddressSchema.parse({
  ...createLocalLocationAddress(),
  scope: 'building',
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
  it('uses unit and unit_portion scope while retaining room as a unit type', () => {
    for (const scope of ['unit', 'unit_portion'])
      expect(LocalLocationAddressSchema.safeParse({ ...authored, scope }).success).toBe(
        true,
      )
    for (const scope of ['room', 'room_part'])
      expect(LocalLocationAddressSchema.safeParse({ ...authored, scope }).success).toBe(
        false,
      )
    expect(
      LocalLocationAddressSchema.safeParse({
        ...authored,
        unit: { ...authored.unit, unitType: 'R' },
      }).success,
    ).toBe(true)
  })

  it('round-trips canonical component types, locale content and unit semantics without upstream IDs', () => {
    expect(
      LocalLocationInputSchema.parse({ state: 'manual', facts }).facts.location.address
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
      LocalLocationInputSchema.safeParse({
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
      LocalLocationAddressSchema.safeParse({
        ...authored,
        unit: { ...authored.unit, floorType: 'invalid' },
      }).success,
    ).toBe(false)
    expect(
      LocalLocationAddressSchema.safeParse({
        ...authored,
        i18n: { en: { formattedAddress: '', blockTypeBeforeNumber: 'true' } },
      }).success,
    ).toBe(false)
    expect(
      LocalLocationAddressSchema.safeParse({
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
    const materialized = materializeLocationAdoption({
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
      locationId: 'p',
      version: 1,
      origin: 'local',
      ssId: null,
      rawSource: {},
      facts,
    }
    const next = structuredClone(old)
    next.id = 'two'
    next.version = 2
    next.facts.location.address.authored!.i18n.en.streetName = 'New Road'
    next.facts.location.address.authored!.unit!.unitRef = 'B'
    const plan = planLocationAdoption({
      facts: old,
      location: old,
      candidate: next,
      overrides: {},
      policy: DEFAULT_PROJECT_LOCATION_POLICY,
    })
    expect(plan.blockers).toEqual([])
    expect(plan.comparison).toMatchObject({
      addressChanged: true,
      unitChanged: true,
      establishmentChanged: false,
    })
    expect(plan.decision.location).toBe('review')
    const inherited = planLocationAdoption({
      facts: old,
      location: old,
      candidate: next,
      overrides: { location: { mode: 'override', value: facts.location } },
      policy: {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        address: 'follow',
        unit: 'follow',
      },
    })
    expect(inherited.effective.location).toEqual(facts.location)
  })
})

it('retains premises names in each locale through shared address materialisation', async () => {
  const { localAddressDraft, localAddressContent } = await import(
    '#lib/addresses/locationDraft.js'
  )
  const content = LocalLocationAddressSchema.parse({
    ...createLocalLocationAddress(),
    scope: 'unit',
    i18n: {
      en: {
        formattedAddress: 'Shop A, Example Estate',
        premisesName: 'Example Estate',
      },
      'zh-hant': {
        formattedAddress: '示例屋苑A舖',
        premisesName: '示例屋苑',
      },
    },
  })
  const draft = localAddressDraft(content)
  expect(getAddressLocale(draft, 'en').premisesName).toBe('Example Estate')
  expect(getAddressLocale(draft, 'zhHant').premisesName).toBe('示例屋苑')
  expect(localAddressContent(draft)).toEqual(content)
  expect(content).not.toHaveProperty('premisesType')
})
