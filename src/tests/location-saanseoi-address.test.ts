import { describe, expect, it, vi } from 'vitest'
import { projectSaanSeoiPlace } from '#lib/locations/saanseoi.js'
import { resolveSaanSeoiPlaceAddress } from '#lib/locations/saanseoiAddress.js'
import { hydrateSaanSeoiPlaceAddress } from '#lib/locations/sourceAddress.js'

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
      resolvedApiVersion: 'api-places-v0.1',
      apiCatalogRevision: 'places-catalog',
      catalogPublishedAt: '2026-10-18T02:10:00Z',
      cohort: '2026-09-23.0',
      domain: 'overture',
      region: 'hk',
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
    meta: {
      apiReleaseSet: 'addresses-publication',
      apiCatalogRevision: 'addresses-catalog',
      catalogPublishedAt: '2026-10-18T02:00:00Z',
      cohort: '2026-09-23.0',
      domain: 'saanseoi',
      resolvedApiVersion: 'api-addresses-v0.1',
      profile: 'full',
    },
    links: {
      permalink:
        'https://source.example/addresses/v0.1/building?releaseSet=addresses-publication&catalogRevision=addresses-catalog&knownAt=2026-10-18T02%3A00%3A00Z&cohort=2026-09-23.0&domain=saanseoi',
    },
  }
  return { projection, response, pin: { apiReleaseSet: 'addresses-publication' } }
}

describe('pinned structured Location Addresses', () => {
  it('retains the native structure and attribution without mutating unresolved input', () => {
    const { projection, response, pin } = fixture()
    const result = resolveSaanSeoiPlaceAddress(projection, response, pin)
    expect(result.facts.location.address.status).toBe('resolved')
    expect(result.facts.location.address.rawSource).toEqual(response)
    expect(result.rawSource.address).toEqual(response)
    expect(result.issues).toEqual([
      { kind: 'invalidPhone', index: 0, value: 'invalid' },
    ])
    expect(projection.facts.location.address.status).toBe('unresolved')
    response.data.attributes.i18n.en.formattedAddress = 'Changed'
    expect(result.facts.location.address.rawSource).not.toEqual(response)
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

describe('structured Address network hydration', () => {
  function client(responses: unknown[]) {
    const request = vi.fn(async (_url: URL, _options: RequestInit) => {
      const value = responses.shift()
      return value instanceof Response ? value : Response.json(value)
    })
    return {
      baseUrl: 'https://source.example',
      apiKey: 'test',
      fetch: request as unknown as typeof fetch,
      request,
    }
  }
  it('discovers as of the Location publication and rereads the independent Address pin', async () => {
    const { projection, response } = fixture()
    const c = client([response, response])
    const result = await hydrateSaanSeoiPlaceAddress(c, projection)
    expect(result.facts.location.address.status).toBe('resolved')
    expect(result.rawSource.address).toEqual(response)
    expect(result.issues).toEqual([
      { kind: 'invalidPhone', index: 0, value: 'invalid' },
    ])
    expect(c.request).toHaveBeenCalledTimes(2)
    const [discovery] = c.request.mock.calls[0]
    const [pinned, options] = c.request.mock.calls[1]
    expect(discovery.searchParams.get('knownAt')).toBe('2026-10-18T02:10:00Z')
    expect(pinned.searchParams.get('releaseSet')).toBe('addresses-publication')
    expect(pinned.searchParams.get('catalogRevision')).toBe('addresses-catalog')
    expect(pinned.searchParams.get('knownAt')).toBe('2026-10-18T02:00:00Z')
    expect(pinned.searchParams.get('include')).toBe('units')
    expect(pinned.searchParams.get('profile')).toBe('full')
    expect(options.redirect).toBe('error')
    expect(projection.facts.location.address.status).toBe('unresolved')
  })
  it('does not fetch for an unreferenced Address or invent a missing parent', async () => {
    const { projection } = fixture()
    const c = client([])
    projection.facts.location.address.address2dId = null
    expect(
      (await hydrateSaanSeoiPlaceAddress(c, projection)).rawSource.addressHydration,
    ).toMatchObject({ reason: 'incomplete-address-reference' })
    projection.facts.location.address.address3dId = null
    projection.facts.location.address.address3dUnitId = null
    expect(await hydrateSaanSeoiPlaceAddress(c, projection)).toBe(projection)
    expect(c.request).not.toHaveBeenCalled()
  })
  it.each(['snapshot', 'unit', 'future', 'permalink', 'catalog'])(
    'retains explicit pending evidence for %s mismatches',
    async kind => {
      const { projection, response } = fixture()
      const discovered = structuredClone(response)
      if (kind === 'snapshot') response.data.attributes.snapshotId = 'wrong'
      if (kind === 'unit') response.included[0].attributes.units = []
      if (kind === 'catalog') response.meta.apiCatalogRevision = 'changed'
      if (kind === 'future') discovered.meta.catalogPublishedAt = '2027-01-01T00:00:00Z'
      if (kind === 'permalink') discovered.links.permalink += '&releaseSet=other'
      const result = await hydrateSaanSeoiPlaceAddress(
        client([discovered, response]),
        projection,
      )
      expect(result.facts.location.address.status).toBe('unresolved')
      expect(result.rawSource.addressHydration).toMatchObject({ status: 'review' })
      expect(result.issues).toContainEqual({ kind: 'addressRecordsPending' })
      expect(result.facts).toEqual(projection.facts)
    },
  )
  it('keeps missing records pending but throws transient upstream failures for retry', async () => {
    const { projection } = fixture()
    expect(
      (
        await hydrateSaanSeoiPlaceAddress(
          client([new Response(null, { status: 404 })]),
          projection,
        )
      ).rawSource.addressHydration,
    ).toMatchObject({ reason: 'address-not-published' })
    await expect(
      hydrateSaanSeoiPlaceAddress(
        client([new Response(null, { status: 503 })]),
        projection,
      ),
    ).rejects.toThrow('503')
  })
  it('invalidates old resolved evidence on a dependency mismatch and clears review state after repair', async () => {
    const { projection, response, pin } = fixture()
    const resolved = resolveSaanSeoiPlaceAddress(projection, response, pin)
    const wrong = structuredClone(response)
    wrong.data.attributes.snapshotId = 'wrong'
    const pending = await hydrateSaanSeoiPlaceAddress(
      client([response, wrong]),
      resolved,
    )
    expect(pending.facts.location.address.status).toBe('unresolved')
    expect(pending.facts.location.address.rawSource).toEqual({})
    expect(pending.issues).toContainEqual({ kind: 'addressRecordsPending' })
    const repaired = await hydrateSaanSeoiPlaceAddress(
      client([response, response]),
      pending,
    )
    expect(repaired.facts.location.address.status).toBe('resolved')
    expect(repaired.rawSource.addressHydration).toMatchObject({
      status: 'resolved',
      releaseSet: 'addresses-publication',
    })
    expect(repaired.issues).not.toContainEqual({ kind: 'addressRecordsPending' })
  })

  it('never follows a response-controlled host or sends credentials to it', async () => {
    const { projection, response } = fixture()
    response.links.permalink = response.links.permalink.replace(
      'source.example',
      'elsewhere.example',
    )
    const c = client([response, response])
    expect(
      (await hydrateSaanSeoiPlaceAddress(c, projection)).facts.location.address.status,
    ).toBe('resolved')
    expect(
      c.request.mock.calls.every(([url]) => url.origin === 'https://source.example'),
    ).toBe(true)
  })
})
