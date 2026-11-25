// @vitest-environment node
import { expect, it } from 'vitest'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
} from '#lib/locations/factsSnapshot.js'
import {
  addressBuildingNames,
  addressLocationNames,
  buildingProfileNames,
  localIdentityFromAddress,
} from '#lib/locations/addressIdentity.js'

function address() {
  const value = emptyFeatureAddress()
  value.coordinates = [114.15, 22.3]
  value.source.address2dId = 'address-id-not-building-id'
  value.source.rawSource = {
    data: {
      attributes: {
        i18n: {
          en: {
            formattedAddress: '',
            buildingName: 'C WISDOM CENTRE',
            streetName: 'Hollywood Road',
            buildingNumberExpression: '35',
            premisesName: 'Example Estate',
            floorExpression: '3/F',
          },
          'zh-hant': {
            formattedAddress: '',
            buildingName: '智慧中心',
            streetName: '荷李活道',
            buildingNumberExpression: '35',
            premisesName: '屋苑',
          },
        },
      },
    },
  }
  return value
}
it('uses only building components for identity suggestions', () => {
  const value = address()
  expect(addressBuildingNames(value)).toEqual({
    en: 'C Wisdom Centre',
    'zh-hant': '智慧中心',
  })
  value.overrides = {
    en: { formattedAddress: '', buildingName: null },
    'zh-hant': { formattedAddress: '', buildingName: null },
  }
  expect(addressBuildingNames(value)).toEqual({})
})
it('fills only missing building names from exact address languages', () => {
  const value = address()
  value.overrides = {
    en: { buildingName: 'Unison Building' },
    'fr-ca': { buildingName: 'Édifice Unison' },
    ja: { buildingName: null },
  }
  const explicit = { 'zh-hant': '自訂名稱', ja: '', de: 'Haus Unison' }
  expect(addressBuildingNames(value, explicit)).toEqual({
    ...explicit,
    en: 'Unison Building',
    'fr-CA': 'Édifice Unison',
  })
  value.overrides.en.buildingName = null
  expect(addressBuildingNames(value, explicit)).not.toHaveProperty('en')
})
it('reads a legacy community building name from its corrected address and honors naming decisions', () => {
  const sharedFacts = localIdentityFromAddress('building', {}, address()).facts
  sharedFacts.names = { 'zh-hant': '自訂名稱' }
  const place = {
    state: 'unresolved' as const,
    facts: { ...sharedFacts, names: { en: 'Organisation name' } },
    sharedFacts,
  }
  expect(buildingProfileNames(place)).toEqual({
    en: 'C Wisdom Centre',
    'zh-hant': '自訂名稱',
  })
  expect(sharedFacts.names).toEqual({ 'zh-hant': '自訂名稱' })
  expect(
    buildingProfileNames({
      ...place,
      communityLocks: { revision: null, available: true, openFields: { names: false } },
    }),
  ).toEqual(sharedFacts.names)
  expect(
    buildingProfileNames({
      ...place,
      sharedFacts: { ...sharedFacts, names: {}, confirmedUnnamed: true },
    }),
  ).toEqual({})
})
it('composes building support addresses while retaining estate context and full source components', () => {
  const value = address()
  const before = structuredClone(value)
  expect(getAddressDisplay(value, 'en', [], 'building')).toBe(
    'Example Estate, 35 Hollywood Road',
  )
  expect(getAddressDisplay(value, 'zhHant', [], 'building')).toBe('荷李活道35號屋苑')
  expect(getAddressDisplay(value, 'en', [], 'establishment')).toContain(
    'C Wisdom Centre',
  )
  expect(value).toEqual(before)
})
it('creates a local building without borrowing its address ID as an entity identity', () => {
  const value = address()
  const input = localIdentityFromAddress('building', addressBuildingNames(value), value)
  expect(input.kind).toBe('building')
  expect(input.sharingPreference).toBe('private')
  expect(input.facts.names.en).toBe('C Wisdom Centre')
  expect(input.facts.location.address.address2dId).toBeNull()
  expect(input.facts.location.address.authored?.i18n.en.buildingName).toBe(
    'C Wisdom Centre',
  )
  expect(input.facts.location.address.authored?.unit).toBeNull()
  expect(value.source.address2dId).toBe('address-id-not-building-id')
})
it('creates an address-kind identity from the reviewed address label without requiring a separate name', () => {
  const value = address()
  value.overrides.en = { formattedAddress: 'Reviewed address, 3/F' }
  const before = structuredClone(value)
  const input = localIdentityFromAddress('address', {}, value, 'exclusive')
  expect(input).toMatchObject({
    kind: 'address',
    state: 'manual',
    facts: { names: { en: 'Reviewed address, 3/F' } },
  })
  expect(input.facts.names).toEqual(addressLocationNames(value))
  expect(input.facts.location.address.authored?.i18n.en.formattedAddress).toBe(
    'Reviewed address, 3/F',
  )
  expect(input.facts.location.address.address2dId).toBeNull()
  expect(value).toEqual(before)
})
it('requires a separately supplied establishment name and keeps its building address', () => {
  const value = address()
  expect(() => localIdentityFromAddress('establishment', {}, value)).toThrow()
  const input = localIdentityFromAddress('establishment', { en: 'New Bakery' }, value)
  expect(input.facts.names).toEqual({ en: 'New Bakery' })
  expect(input.facts.location.address.authored?.i18n.en.buildingName).toBe(
    'C Wisdom Centre',
  )
})

it('persists the building-scoped display from the captured entity kind', () => {
  const value = address()
  const input = localIdentityFromAddress('building', addressBuildingNames(value), value)
  const facts = readLocationFacts(createLocationFactsSnapshot(input.facts, 'building'))
  const result = materializeEffectiveLocation({
    facts,
    locationFacts: facts,
    overrides: {},
    data: {},
    i18n: { en: { title: 'Old name' } },
  })
  expect(result.i18n.en.title).toBe('C Wisdom Centre')
  expect(result.i18n.en.displayAddress).toBe('Example Estate, 35 Hollywood Road')
  expect(result.i18n.en.displayAddressGen).toBe(true)
  expect(result.data.addressMeta?.address?.source.authored?.i18n.en.buildingName).toBe(
    'C Wisdom Centre',
  )
})
it('preserves an explicitly authored display label', () => {
  const value = address()
  value.overrides.en = { formattedAddress: 'Use the side entrance at C Wisdom Centre' }
  expect(getAddressDisplay(value, 'en', [], 'building')).toBe(
    'Use the side entrance at C Wisdom Centre',
  )
})

it('defaults to shared visibility and keeps exclusive identities organisation-private', () => {
  const value = address()
  const names = { en: 'New Bakery' }
  expect(localIdentityFromAddress('establishment', names, value).state).toBe(
    'unresolved',
  )
  const exclusive = localIdentityFromAddress('establishment', names, value, 'exclusive')
  expect(exclusive.state).toBe('manual')
  // Visibility does not silently opt into upstream sharing consent.
  expect(exclusive.sharingPreference).toBe('private')
})

it('includes explicitly entered rooms in building address previews in every language', async () => {
  const { setStructuredAddressExpression } = await import(
    '#lib/addresses/addressExpressions.js'
  )
  const value = setStructuredAddressExpression(
    address(),
    'en',
    'unitExpression',
    '6',
    'R',
  )
  expect(getAddressDisplay(value, 'en', [], 'building')).toContain('6')
  expect(getAddressDisplay(value, 'zhHant', [], 'building')).toContain('6')
  expect(getAddressDisplay(value, 'zhHans', [], 'building')).toContain('6')
  expect(getAddressDisplay(value, 'en', [], 'building')).toContain('Rm 6')
})

it('uses building-name evidence when the catalogue has no name', () => {
  const input = localIdentityFromAddress('building', {}, address())
  expect(input.facts.names.en).toBe('C Wisdom Centre')
})

it('accepts an unnamed building without inventing a name from its address', () => {
  const value = address()
  value.overrides = {
    en: { formattedAddress: '35 Hollywood Road', buildingName: null },
    'zh-hant': { formattedAddress: '', buildingName: null },
  }
  const input = localIdentityFromAddress('building', {}, value)
  expect(input.facts.names).toEqual({})
  expect(input.facts.location.geometry.coordinates).toEqual(value.coordinates)
})

it('preserves explicit building names over address evidence', () => {
  const input = localIdentityFromAddress(
    'building',
    { en: 'Reviewed Building' },
    address(),
  )
  expect(input.facts.names.en).toBe('Reviewed Building')
})
