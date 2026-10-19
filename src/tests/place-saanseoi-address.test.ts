import { describe, expect, it } from 'vitest'
import { projectSaanSeoiPlace } from '#lib/places/saanseoi.js'
import { resolveSaanSeoiPlaceAddress } from '#lib/places/saanseoiAddress.js'

function fixture() {
  const projection = projectSaanSeoiPlace(
    {
      type: 'places',
      id: 'shop',
      attributes: {
        geometry: { type: 'Point', coordinates: [114, 22] },
        snapshotId: 'places-snapshot',
        resourceReleaseId: 'source',
        addressSnapshotId: 'addresses-snapshot',
        address2dId: 'building',
        address3dId: 'inventory',
        address3dUnitId: 'unit',
        phones: ['invalid'],
        identifiers: null,
        i18n: { en: { name: 'Shop', brandName: null } },
      },
    },
    {
      apiReleaseSet: 'places-publication',
      resolvedApiVersion: '0.1',
      schemaVersion: 'v1',
    },
    { apiReleaseSet: 'places-publication', snapshotId: 'places-snapshot' },
  )
  const response = {
    data: {
      type: 'addresses',
      id: 'building',
      attributes: {
        snapshotId: 'addresses-snapshot',
        sources: [{ publisher: 'original' }],
        address3dCoverage: {
          kind: 'direct',
          ownerAddress2dId: 'building',
          address3dId: 'inventory',
          membership: 'established',
        },
        i18n: { en: { formattedAddress: 'Building', buildingName: 'Building' } },
      },
    },
    included: [
      {
        type: 'address3d',
        id: 'inventory',
        attributes: {
          snapshotId: 'addresses-snapshot',
          address2dId: 'building',
          units: [{ id: 'unit', floorRef: 'G', unitRef: '1' }],
          i18n: {},
          sources: [],
        },
      },
    ],
    meta: { apiReleaseSet: 'addresses-publication' },
  }
  return { projection, response, pin: { apiReleaseSet: 'addresses-publication' } }
}

describe('pinned structured Place Addresses', () => {
  it('retains the native structure and attribution without mutating unresolved input', () => {
    const { projection, response, pin } = fixture()
    const result = resolveSaanSeoiPlaceAddress(projection, response, pin)
    expect(result.facts.location.address.status).toBe('resolved')
    expect(result.facts.location.address.records).toEqual(response)
    expect(result.payload.address).toEqual(response)
    expect(result.issues).toEqual([
      { kind: 'invalidPhone', index: 0, value: 'invalid' },
    ])
    expect(projection.facts.location.address.status).toBe('unresolved')
    response.data.attributes.i18n.en.formattedAddress = 'Changed'
    expect(result.facts.location.address.records).not.toEqual(response)
  })

  it.each([
    'publication',
    'snapshot',
    'identity',
    'inventorySnapshot',
    'owner',
    'unit',
    'membership',
    'missingInventory',
    'duplicateInventory',
  ])('rejects %s mismatches without resolving the address', mismatch => {
    const { projection, response, pin } = fixture()
    if (mismatch === 'publication') pin.apiReleaseSet = 'other'
    if (mismatch === 'snapshot') response.data.attributes.snapshotId = 'other'
    if (mismatch === 'identity') response.data.id = 'other'
    if (mismatch === 'inventorySnapshot')
      response.included[0].attributes.snapshotId = 'other'
    if (mismatch === 'owner') response.included[0].attributes.address2dId = 'other'
    if (mismatch === 'unit') response.included[0].attributes.units[0].id = 'other'
    if (mismatch === 'membership')
      response.data.attributes.address3dCoverage.membership = 'unresolved'
    if (mismatch === 'missingInventory') response.included = []
    if (mismatch === 'duplicateInventory') response.included.push(response.included[0])
    expect(() => resolveSaanSeoiPlaceAddress(projection, response, pin)).toThrow()
    expect(projection.facts.location.address.status).toBe('unresolved')
  })

  it('resolves a building-only reference without requiring an inventory', () => {
    const { projection, response, pin } = fixture()
    projection.facts.location.address.address3dId = null
    projection.facts.location.address.address3dUnitId = null
    response.included = []
    expect(
      resolveSaanSeoiPlaceAddress(projection, response, pin).facts.location.address
        .status,
    ).toBe('resolved')
  })
})
