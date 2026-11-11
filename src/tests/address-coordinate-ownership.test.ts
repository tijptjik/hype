// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  projectFeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { addressSourceCoordinates } from '#lib/addresses/sourceCoordinates.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import { materializeLocationAdoption } from '#lib/locations/adoptionMaterialize.js'
import { materializeLocationReset } from '#lib/locations/reset.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'

const sourcePoint = [114, 22] as [number, number]
const marker = [114.01, 22.01] as [number, number]
const source = {
  ...emptyFeatureAddress().source,
  rawSource: {
    data: { attributes: { geometry: { type: 'Point', coordinates: sourcePoint } } },
  },
}
const facts = LocationFactsSchema.parse({
  names: { en: 'Place' },
  phoneNumber: [],
  brands: [],
  location: { geometry: { type: 'Point', coordinates: marker }, address: source },
})
const input = {
  facts,
  locationFacts: facts,
  overrides: {},
  data: {},
  i18n: { en: { title: 'Place' } },
}

describe('address coordinate ownership', () => {
  it('reads the retained source point and does not invent one for local content', () => {
    expect(addressSourceCoordinates(source)).toEqual(sourcePoint)
    expect(addressSourceCoordinates(emptyFeatureAddress().source)).toBeNull()
    expect(
      addressSourceCoordinates({
        ...source,
        rawSource: {
          data: { attributes: { geometry: { type: 'Point', coordinates: [181, 22] } } },
        },
      }),
    ).toBeNull()
  })

  it.each(['effective', 'adoption', 'reset'] as const)(
    '%s keeps the source address point distinct from the marker',
    kind => {
      const result =
        kind === 'effective'
          ? materializeEffectiveLocation(input)
          : kind === 'adoption'
            ? materializeLocationAdoption({ ...input, fieldGroup: 'location' })
            : materializeLocationReset({
                ...input,
                reset: {
                  expectedRevision: 'r',
                  names: [],
                  phoneNumber: false,
                  location: true,
                },
              })
      expect(result.data.geometry).toEqual(facts.location.geometry)
      expect(result.data.addressMeta?.address?.coordinates).toEqual(sourcePoint)
      expect(result.data.addressMeta?.address).not.toHaveProperty('markerCoordinates')
      expect(result.data.addressMeta?.address?.source).toEqual(source)
    },
  )

  it('changing only effective geometry preserves source evidence', () => {
    const moved = materializeEffectiveLocation({
      ...input,
      overrides: {
        location: {
          mode: 'override',
          value: {
            ...facts.location,
            geometry: { type: 'Point', coordinates: [115, 23] },
          },
        },
      },
    })
    expect(moved.data.geometry).toEqual({ type: 'Point', coordinates: [115, 23] })
    expect(moved.data.addressMeta?.address?.coordinates).toEqual(sourcePoint)
  })

  it('accepts legacy marker copies but never emits them or uses them to format a new marker', () => {
    const address = {
      ...emptyFeatureAddress(),
      source,
      coordinates: sourcePoint,
      markerCoordinates: [0, 0] as [number, number],
      locationDisplayMode: 'plus_code' as const,
    }
    expect(FeatureAddressSchema.parse(address)).not.toHaveProperty('markerCoordinates')
    const result = projectFeatureAddress({
      addressMeta: { address },
      geometry: facts.location.geometry,
      i18n: { en: { displayAddressGen: true, displayAddress: '' } },
    })
    expect(result.addressMeta.address.coordinates).toEqual(sourcePoint)
    expect(result.addressMeta.address).not.toHaveProperty('markerCoordinates')
    expect(result.i18n.en.displayAddress).not.toBe('6FG22222+22')
    expect(address.markerCoordinates).toEqual([0, 0])
  })
})
