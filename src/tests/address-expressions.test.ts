// @vitest-environment node
import { expect, it } from 'vitest'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import {
  parseAddressExpression,
  setAddressExpression,
  getAddressDivisions,
} from '#lib/addresses/addressExpressions.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'

it('parses number ranges once across languages and resets all components', () => {
  const address = setAddressExpression(
    emptyFeatureAddress(),
    'en',
    'buildingNumberExpression',
    '26–30',
  )
  for (const locale of ['en', 'zh-hant', 'zh-hans'])
    expect(address.overrides[locale]).toMatchObject({
      buildingNumberExpression: '26–30',
      buildingNumberFrom: '26',
      buildingNumberTo: '30',
      buildingNumberConnector: '–',
    })
  expect(
    setAddressExpression(address, 'en', 'buildingNumberExpression', undefined).overrides
      .en,
  ).toEqual({})
})
it('keeps expressions authoritative and parses known block and phase vocabulary', () => {
  expect(parseAddressExpression('blockExpression', 'Tower A')).toMatchObject({
    blockType: 'tower',
    blockRef: 'A',
    blockTypeBeforeNumber: true,
  })
  expect(parseAddressExpression('blockExpression', '3座')).toMatchObject({
    blockType: 'block',
    blockRef: '3',
    blockTypeBeforeNumber: false,
  })
  expect(parseAddressExpression('phaseExpression', '第2期')).toMatchObject({
    phaseName: '期',
    phaseRef: '2',
  })
  const address = setAddressExpression(
    emptyFeatureAddress(),
    'zhHant',
    'phaseExpression',
    '第2期',
  )
  expect(getAddressDisplay(address, 'zhHant')).toBe('第2期')
  expect(
    parseAddressExpression('buildingNumberExpression', 'odd entrance'),
  ).toMatchObject({
    buildingNumberExpression: 'odd entrance',
    buildingNumberFrom: null,
  })
})
it('uses actual division relationships and ignores unrelated included divisions', () => {
  const address = emptyFeatureAddress()
  address.source.records = {
    data: {
      relationships: {
        divisions: { data: [{ id: 'district', meta: { role: 'district' } }] },
      },
    },
    included: [
      {
        type: 'divisions',
        id: 'district',
        attributes: { i18n: { en: { name: 'Central' } } },
      },
      {
        type: 'divisions',
        id: 'unrelated',
        attributes: { i18n: { en: { name: 'Other' } } },
      },
    ],
  }
  expect(getAddressDivisions(address, 'en')).toEqual([
    { id: 'district', role: 'district', name: 'Central' },
  ])
})
it('retains every returned address candidate instead of silently selecting the first', async () => {
  const result = await geocodeAddressCandidates(
    { lng: 114, lat: 22 },
    {
      fetcher: async url => {
        expect(new URL(String(url)).searchParams.get('limit')).toBe('10')
        return Response.json({
          data: [
            {
              type: 'geocoding-results',
              attributes: { status: 'ambiguous' },
              relationships: {
                address: {
                  data: [
                    { type: 'addresses', id: 'a' },
                    { type: 'addresses', id: 'b' },
                  ],
                },
              },
            },
          ],
          included: ['a', 'b'].map(id => ({
            type: 'addresses',
            id,
            attributes: { snapshotId: 's', i18n: { en: { formattedAddress: id } } },
          })),
        })
      },
    },
  )
  expect(result.map(item => item.addressMeta.address?.source.address2dId)).toEqual([
    'a',
    'b',
  ])
})

it('hydrates division details using the actual geocoder release metadata', async () => {
  const { loadGeocodedAddressUnits } = await import('#lib/api/external/geocoding.js')
  const { hasAddressDivisionDetails } = await import(
    '#lib/addresses/addressExpressions.js'
  )
  const address = emptyFeatureAddress()
  address.source.address2dId = 'a'
  address.source.addressSnapshotId = 'snapshot'
  address.source.records = { meta: { release: { apiReleaseSet: 'address-release' } } }
  expect(hasAddressDivisionDetails(address)).toBe(false)
  const hydrated = await loadGeocodedAddressUnits(address, {
    fetcher: async input => {
      const url = new URL(String(input))
      expect(url.searchParams.get('releaseSet')).toBe('address-release')
      expect(url.searchParams.get('include')).toBe('divisions,units')
      return Response.json({
        data: {
          type: 'addresses',
          id: 'a',
          attributes: { snapshotId: 'snapshot' },
          relationships: {
            divisions: {
              data: [{ type: 'divisions', id: 'd', meta: { role: 'district' } }],
            },
          },
        },
        included: [
          {
            type: 'divisions',
            id: 'd',
            attributes: { i18n: { en: { name: 'Central and Western' } } },
          },
        ],
        meta: { apiReleaseSet: 'address-release' },
      })
    },
  })
  expect(hasAddressDivisionDetails(hydrated)).toBe(true)
  expect(getAddressDivisions(hydrated, 'en')).toEqual([
    { id: 'd', role: 'district', name: 'Central and Western' },
  ])
  expect(address.source.records).toEqual({
    meta: { release: { apiReleaseSet: 'address-release' } },
  })
})

it('orders division memberships by descending source level without changing source order', () => {
  const address = emptyFeatureAddress()
  const memberships = [
    { id: 'china', level: 0 },
    { id: 'district', level: 3 },
    { id: 'neighbourhood', level: 5 },
    { id: 'macrohood', level: 4 },
  ]
  address.source.records = {
    data: {
      relationships: { divisions: { data: memberships.map(({ id }) => ({ id })) } },
    },
    included: memberships.map(({ id, level }) => ({
      type: 'divisions',
      id,
      attributes: { level },
    })),
  }
  expect(getAddressDivisions(address, 'en').map(item => item.id)).toEqual([
    'neighbourhood',
    'macrohood',
    'district',
    'china',
  ])
  expect(address.source.records.data).toEqual({
    relationships: { divisions: { data: memberships.map(({ id }) => ({ id })) } },
  })
})

it.each([
  ['Lantau Island', ['hood', 'landform', 'district', 'area', 'china']],
  ['Hong Kong Island', ['hood', 'district', 'landform', 'area', 'china']],
])(
  'positions the %s landform relative to administrative divisions in every locale',
  (island, expected) => {
    const address = emptyFeatureAddress()
    const members = [
      { id: 'china', role: 'country', level: 0 },
      { id: 'area', role: 'area', level: 2 },
      { id: 'landform', role: 'landform', level: 2 },
      { id: 'district', role: 'district', level: 3 },
      { id: 'hood', role: 'neighbourhood', level: 5 },
    ]
    address.source.records = {
      data: {
        relationships: {
          divisions: { data: members.map(({ id, role }) => ({ id, meta: { role } })) },
        },
      },
      included: members.map(({ id, level }) => ({
        type: 'divisions',
        id,
        attributes: {
          level,
          i18n: {
            en: { name: id === 'landform' ? island : id },
            'zh-hant': { name: '本地名稱' },
          },
        },
      })),
    }
    for (const locale of ['en', 'zhHant'] as const) {
      expect(getAddressDivisions(address, locale).map(item => item.id)).toEqual(
        expected,
      )
    }
  },
)
