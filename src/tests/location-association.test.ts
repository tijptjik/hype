// @vitest-environment node
import { expect, it } from 'vitest'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressLocale,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import {
  combineAssociationAddress,
  defaultAddressChoices,
  associationNames,
  normalizeAssociationComponents,
  editAssociationAddress,
} from '#lib/locations/associationAddress.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'

function address(street: string, number: string) {
  const value = emptyFeatureAddress()
  value.coordinates = [114.15, 22.3]
  value.source.authored = createLocalLocationAddress()
  value.source.authored.streetId = `${street}-id`
  value.source.authored.i18n.en = {
    formattedAddress: '',
    streetName: street,
    buildingNumberExpression: number,
    buildingNumberFrom: number,
  }
  return value
}

it('keeps premises evidence distinct from buildings and unit entries distinct from establishments', () => {
  const original = address('Queen Road', '120')
  original.overrides.en = {
    premisesName: 'Hollywood Terrace',
    unitExpression: 'Flat A',
  }
  expect(associationNames(original, 'premises')).toEqual({ en: 'Hollywood Terrace' })
  expect(associationNames(original, 'building')).toEqual({})
  expect(associationNames(original, 'establishment')).toEqual({})
  expect(
    localIdentityFromAddress('premises', { en: 'Hollywood Terrace' }, original).kind,
  ).toBe('premises')
})

it('defaults populated values to the Location, preserves gaps, and copies complete structured groups', () => {
  const original = address('Queen Road', '120')
  original.overrides.en = { premisesName: 'Hollywood Terrace' }
  const matched = address('Hollywood Road', '118')
  const before = structuredClone([original, matched])
  const choices = defaultAddressChoices(original, matched)
  expect(choices.street).toBe('location')
  expect(choices.premises).toBe('original')
  choices.street = 'original'
  const combined = combineAssociationAddress(original, matched, choices)
  expect(FeatureAddressSchema.parse(combined).association?.content?.streetId).toBe(
    'Queen Road-id',
  )
  expect(getAddressLocale(combined, 'en')).toMatchObject({
    streetName: 'Queen Road',
    buildingNumberFrom: '118',
    premisesName: 'Hollywood Terrace',
  })
  expect(combined.association?.originalSource).toEqual(original.source)
  expect(combined.association?.matchedSource).toEqual(matched.source)
  expect([original, matched]).toEqual(before)
  expect(
    localIdentityFromAddress('establishment', { en: 'Shop' }, combined).facts.location
      .address.authored?.i18n.en.streetName,
  ).toBe('Queen Road')
})

it('retains Feature-owned reviewed address and marker when linked facts are rematerialized', () => {
  const original = address('Queen Road', '120')
  const matched = address('Hollywood Road', '118')
  matched.coordinates = [114.1501, 22.3001]
  const choices = defaultAddressChoices(original, matched)
  choices.street = 'original'
  const combined = combineAssociationAddress(original, matched, choices)
  const facts = localIdentityFromAddress('establishment', { en: 'Cafe' }, matched).facts
  const result = materializeEffectiveLocation({
    facts,
    locationFacts: facts,
    overrides: {},
    data: {
      geometry: { type: 'Point', coordinates: original.coordinates! },
      addressMeta: { address: combined },
    },
    i18n: { en: { title: 'My feature' } },
  })
  expect(result.data.geometry).toEqual({
    type: 'Point',
    coordinates: original.coordinates,
  })
  expect(result.data.addressMeta?.address).toEqual(combined)
  expect(result.i18n.en.displayAddress).toBe(getAddressDisplay(combined, 'en'))
})

it('splits known premises and block without changing source evidence or unrelated building names', () => {
  const original = address('Hollywood Road', '123')
  original.overrides.en = {
    premisesName: 'Hollywood Terrace',
    buildingName: 'Hollywood Terrace Tower B',
  }
  const before = structuredClone(original)
  const normalized = normalizeAssociationComponents(original)
  expect(getAddressLocale(normalized, 'en')).toMatchObject({
    premisesName: 'Hollywood Terrace',
    buildingName: null,
    blockType: 'tower',
    blockRef: 'B',
  })
  expect(original).toEqual(before)
  expect(normalized.source).toEqual(before.source)
  const named = {
    ...original,
    overrides: { en: { buildingName: 'Bank of China Tower' } },
  }
  expect(normalizeAssociationComponents(named)).toEqual(named)
  const conflicting = {
    ...original,
    overrides: { en: { ...original.overrides.en, blockRef: 'A' } },
  }
  expect(normalizeAssociationComponents(conflicting)).toEqual(conflicting)
  const combined = combineAssociationAddress(
    original,
    normalized,
    defaultAddressChoices(original, normalized),
  )
  expect(getAddressLocale(combined, 'en')).toMatchObject({
    buildingName: null,
    blockRef: 'B',
  })
})

it('stores custom corrections and explicit clears while preserving both source publications', () => {
  const original = address('Hollywood Road', '123'),
    matched = address('Queen Road', '118')
  const combined = combineAssociationAddress(
    original,
    matched,
    defaultAddressChoices(original, matched),
  )
  const edited = editAssociationAddress(combined, {
    street: { en: 'Correct Road' },
    number: { en: '20-22' },
    building: { en: '' },
    floor: { en: '4/F' },
    unit: { en: 'Flat B' },
  })
  expect(FeatureAddressSchema.parse(edited).association?.choices).toMatchObject({
    street: 'custom',
    number: 'custom',
    building: 'custom',
  })
  expect(getAddressLocale(edited, 'en')).toMatchObject({
    streetName: 'Correct Road',
    buildingName: null,
    buildingNumberFrom: '20',
    buildingNumberTo: '22',
  })
  expect(edited.unitDetails).toMatchObject({ floorRef: '4', unitRef: 'B' })
  expect(edited.association?.content?.streetId).toBeUndefined()
  expect(edited.association?.originalSource).toEqual(original.source)
  expect(edited.association?.matchedSource).toEqual(matched.source)
  expect(getAddressLocale(combined, 'en').streetName).toBe('Queen Road')
})

it('fills missing components from the original without mistaking formatting defaults for values', () => {
  const original = address('Queen Road', '120')
  original.overrides.en = { blockRef: 'B', blockType: 'block' }
  const matched = {
    ...emptyFeatureAddress(),
    overrides: { en: { blockTypeBeforeNumber: true, buildingNumberConnector: '-' } },
  }
  const choices = defaultAddressChoices(original, matched)
  expect(choices.block).toBe('original')
  expect(choices.number).toBe('original')
  expect(choices.access).toBe('location')
})
