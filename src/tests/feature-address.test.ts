// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  AddressMetaSchema,
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
  getAddressLocale,
  invalidateAddressLocation,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import { parseGeocodeResult } from '#lib/api/external/geocoding.js'

function fixture() {
  const address = emptyFeatureAddress({ en: '18 Old Street', 'zh-hant': '舊街18號' })
  address.coordinates = [114, 22]
  address.matchStatus = 'resolved'
  address.source = {
    ...address.source,
    status: 'resolved',
    address2dId: 'building',
    addressSnapshotId: 'snapshot',
    records: {
      data: {
        type: 'addresses',
        id: 'building',
        attributes: {
          snapshotId: 'snapshot',
          i18n: {
            en: {
              formattedAddress: '18 Old Street',
              streetName: 'Old Street',
              buildingNumberExpression: '18',
              blockTypeBeforeNumber: false,
              extraUpstreamField: 'retained',
            },
          },
          sources: [{ dataset: 'source', license: 'CC BY' }],
        },
      },
      meta: { release: { apiReleaseSet: 'publication' } },
    },
  }
  return address
}

describe('canonical feature addresses', () => {
  it('round-trips source records, nulls, booleans, empty arrays and explicit clear through hidden JSON input', () => {
    const address = setAddressOverride(fixture(), 'en', 'buildingName', null)
    address.legacy = { oldNull: null, oldArray: [], oldBoolean: false }
    const parsed = AddressMetaSchema.parse({ address: JSON.stringify(address) })
    expect(parsed.address).toEqual(address)
    expect(() => AddressMetaSchema.parse({ address: '{broken' })).toThrow()
    expect(() => AddressMetaSchema.parse({ address: { version: 1 } })).toThrow()
  })
  it('keeps the source immutable and distinguishes clear, override and reset', () => {
    const original = fixture()
    const corrected = setAddressOverride(original, 'en', 'streetName', 'New Street')
    expect(getAddressDisplay(corrected, 'en')).toBe('18 New Street')
    expect(getAddressLocale(original, 'en').streetName).toBe('Old Street')
    const cleared = setAddressOverride(corrected, 'en', 'formattedAddress', null)
    expect(getAddressDisplay(cleared, 'en')).toBe('')
    expect(
      getAddressDisplay(
        setAddressOverride(cleared, 'en', 'formattedAddress', undefined),
        'en',
      ),
    ).toBe('18 New Street')
    expect(
      getAddressDisplay(
        setAddressOverride(corrected, 'en', 'streetName', undefined),
        'en',
      ),
    ).toBe('18 Old Street')
    expect(corrected.source).toEqual(original.source)
  })
  it('keeps locale corrections independent without fabricating translations', () => {
    const address = setAddressOverride(fixture(), 'en', 'formattedAddress', 'Custom')
    expect(getAddressDisplay(address, 'zhHant')).toBe('舊街18號')
    expect(getAddressLocale(address, 'zhHans')).toEqual({})
    expect(getAddressDisplay(address, 'zhHans')).toBe('')
  })
  it('retains evidence and corrections when a pin becomes stale', () => {
    const address = fixture()
    const meta = { address }
    expect(invalidateAddressLocation(meta, [114, 22])).toBe(meta)
    const moved = invalidateAddressLocation(meta, [114.1, 22])
    expect(moved.address?.matchStatus).toBe('stale')
    expect(moved.address?.source).toEqual(address.source)
    expect(address.matchStatus).toBe('resolved')
  })
  it('rejects invalid coordinates, unsupported field overrides and unpinned resolved identities', () => {
    expect(
      FeatureAddressSchema.safeParse({ ...fixture(), coordinates: [181, 22] }).success,
    ).toBe(false)
    expect(
      FeatureAddressSchema.safeParse({
        ...fixture(),
        overrides: { en: { fakeField: 'fake' } },
      }).success,
    ).toBe(false)
    const unpinned = fixture()
    unpinned.source.addressSnapshotId = null
    expect(FeatureAddressSchema.safeParse(unpinned).success).toBe(false)
  })
  it('retains full geocoder attribution and snapshot while keeping ambiguous matches unverified', () => {
    const address = fixture()
    const body = {
      data: [
        {
          type: 'geocoding-results',
          attributes: { status: 'ambiguous' },
          relationships: { address: { data: [{ type: 'addresses', id: 'building' }] } },
        },
      ],
      included: [address.source.records.data],
      meta: address.source.records.meta,
    }
    const result = parseGeocodeResult(body, { lng: 114, lat: 22 })!
    expect(result.addressMeta.address?.source.records.data).toEqual(
      address.source.records.data,
    )
    expect(result.addressMeta.address?.source.records.meta).toEqual(body.meta)
    expect(result.addressMeta.address?.source.status).toBe('unresolved')
    expect(result.addressMeta.address?.matchStatus).toBe('ambiguous')
    expect(result.i18n.en.addressProperties).toEqual({})
  })
})

describe('canonical address writes and units', () => {
  it('keeps submitted manual labels as overrides and clears the retired structured projection', async () => {
    const { projectFeatureAddress } = await import('#lib/addresses/featureAddress.js')
    const data = {
      geometry: { type: 'Point', coordinates: [114.1, 22] },
      addressMeta: { address: fixture() },
      i18n: {
        en: {
          displayAddress: 'My entrance',
          displayAddressGen: false,
          addressProperties: { buildingName: 'old' },
        },
      },
    }
    const projected = projectFeatureAddress(data)
    expect(projected.addressMeta.address.matchStatus).toBe('stale')
    expect(projected.addressMeta.address.overrides.en.formattedAddress).toBe(
      'My entrance',
    )
    expect(projected.i18n.en.addressProperties).toEqual({})
    expect(data.i18n.en.addressProperties).toEqual({ buildingName: 'old' })
  })
  it('only selects units in the retained snapshot and established owner', async () => {
    const { getAddressUnits } = await import('#lib/addresses/featureAddress.js')
    const address = fixture()
    const data = address.source.records.data as { attributes: Record<string, unknown> }
    data.attributes.address3dCoverage = {
      kind: 'direct',
      ownerAddress2dId: 'building',
      address3dId: 'inventory',
      membership: 'established',
    }
    address.source.records.included = [
      {
        type: 'address3d',
        id: 'inventory',
        attributes: {
          snapshotId: 'snapshot',
          address2dId: 'building',
          units: [{ id: 'unit-a', unitRef: 'A', floorRef: '3' }],
          i18n: {
            en: {
              units: {
                'unit-a': {
                  formattedAddressPart: 'Unit A, 3/F',
                  unitExpression: 'Unit A',
                  floorExpression: '3/F',
                },
              },
            },
          },
        },
      },
    ]
    expect(getAddressUnits(address, 'en')).toEqual([
      { value: 'unit-a', inventoryId: 'inventory', label: 'Unit A, 3/F' },
    ])
    address.source.address3dId = 'inventory'
    address.source.address3dUnitId = 'unit-a'
    expect(FeatureAddressSchema.safeParse(address).success).toBe(true)
    expect(getAddressDisplay(address, 'en')).toBe('Unit A, 3/F, 18 Old Street')
    expect(
      getAddressDisplay(
        setAddressOverride(address, 'en', 'streetName', 'New Street'),
        'en',
      ),
    ).toBe('Unit A, 3/F, 18 New Street')
    address.source.address3dUnitId = 'wrong-unit'
    expect(FeatureAddressSchema.safeParse(address).success).toBe(false)
    address.source.addressSnapshotId = 'different-publication'
    expect(getAddressUnits(address, 'en')).toEqual([])
  })
  it('pins the unit request and rejects a mixed publication before applying it', async () => {
    const { loadGeocodedAddressUnits } = await import('#lib/api/external/geocoding.js')
    const address = fixture()
    let requested: URL | undefined
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requested = new URL(String(input))
      return Response.json({
        data: address.source.records.data,
        meta: { apiReleaseSet: 'wrong-publication' },
      })
    }
    await expect(loadGeocodedAddressUnits(address, { fetcher })).rejects.toThrow(
      'publication mismatch',
    )
    expect(requested?.searchParams.get('releaseSet')).toBe('publication')
    expect(requested?.searchParams.get('include')).toBe('divisions,units')
  })
})
