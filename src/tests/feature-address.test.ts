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
    snapshotId: 'snapshot',
    rawSource: {
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
  it('round-trips explicit baseline labels while preserving structured evidence and later edits', () => {
    const address = fixture()
    const evidence = structuredClone(address.source.rawSource)
    address.source.displayOverrides = { en: '', 'zh-hant': 'Custom entrance' }
    const restored = FeatureAddressSchema.parse(JSON.parse(JSON.stringify(address)))
    expect(getAddressDisplay(restored, 'en')).toBe('')
    expect(getAddressDisplay(restored, 'zhHant')).toBe('Custom entrance')
    expect(
      getAddressDisplay(
        setAddressOverride(restored, 'en', 'streetName', 'New Street'),
        'en',
      ),
    ).toBe('18 New Street')
    expect(
      getAddressDisplay(
        setAddressOverride(restored, 'en', 'formattedAddress', 'New label'),
        'en',
      ),
    ).toBe('New label')
    expect(restored.source.rawSource).toEqual(evidence)
  })

  it('saves manual floor and unit details without inventing source unit identities', () => {
    const original = fixture()
    let address = setAddressOverride(original, 'en', 'floorExpression', '3/F')
    address = setAddressOverride(address, 'en', 'unitExpression', 'Flat B')
    expect(getAddressDisplay(address, 'en')).toBe('Flat B, 3/F, 18 Old Street')
    expect(getAddressDisplay(address, 'zhHant')).toBe('舊街18號')
    expect(address.source).toEqual(original.source)
    expect(address.source.address3dUnitId).toBeNull()
    expect(
      AddressMetaSchema.parse({ address: JSON.stringify(address) }).address,
    ).toEqual(address)
    const cleared = setAddressOverride(address, 'en', 'unitExpression', null)
    expect(getAddressDisplay(cleared, 'en')).toBe('3/F, 18 Old Street')
    const reset = setAddressOverride(
      setAddressOverride(address, 'en', 'unitExpression', undefined),
      'en',
      'floorExpression',
      undefined,
    )
    expect(getAddressDisplay(reset, 'en')).toBe('18 Old Street')
  })
  it('appends localized floor and unit details in Chinese address order', () => {
    let address = setAddressOverride(fixture(), 'zhHant', 'floorExpression', '3樓')
    address = setAddressOverride(address, 'zhHant', 'unitExpression', 'B室')
    expect(getAddressDisplay(address, 'zhHant')).toBe('舊街18號3樓B室')
  })
  it.each(['G/f', 'g/f', '3/f', 'Lg'])(
    'capitalizes stored floor abbreviation %s without changing its source',
    floorExpression => {
      const address = emptyFeatureAddress({ en: 'The courtyard' })
      address.overrides.en = { floorExpression }
      expect(getAddressLocale(address, 'en').floorExpression).toBe(
        floorExpression.toUpperCase(),
      )
      expect(getAddressDisplay(address, 'en')).toBe(
        `${floorExpression.toUpperCase()}, The courtyard`,
      )
      expect(address.overrides.en.floorExpression).toBe(floorExpression)
    },
  )
  it('retains a free-text building address when only 3D details change', () => {
    const address = setAddressOverride(
      emptyFeatureAddress({ en: 'The courtyard' }),
      'en',
      'floorExpression',
      'Ground floor',
    )
    expect(getAddressDisplay(address, 'en')).toBe('Ground floor, The courtyard')
  })
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
  it('keeps locale corrections independent while deriving Simplified display from Traditional', () => {
    const address = setAddressOverride(fixture(), 'en', 'formattedAddress', 'Custom')
    expect(getAddressDisplay(address, 'zhHant')).toBe('舊街18號')
    expect(getAddressLocale(address, 'zhHans')).toEqual({})
    expect(getAddressDisplay(address, 'zhHans')).toBe('旧街18号')
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
    unpinned.source.snapshotId = null
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
      included: [address.source.rawSource.data],
      meta: address.source.rawSource.meta,
    }
    const result = parseGeocodeResult(body, { lng: 114, lat: 22 })!
    expect(result.addressMeta.address?.source.rawSource.data).toEqual(
      address.source.rawSource.data,
    )
    expect(result.addressMeta.address?.source.rawSource.meta).toEqual(body.meta)
    expect(result.addressMeta.address?.source.status).toBe('unresolved')
    expect(result.addressMeta.address?.matchStatus).toBe('ambiguous')
    expect(result.i18n.en.addressProperties).toEqual({})
  })
  it('normalizes provider building and premises names before fields and composed output consume them', () => {
    const address = emptyFeatureAddress()
    address.source.rawSource = {
      data: {
        attributes: {
          i18n: {
            en: {
              buildingName: 'WORLD-WIDE HOUSE',
              premisesName: 'WORLD-WIDE GARDENS',
            },
            'zh-hant': { buildingName: '環球大廈', premisesName: '世界花園' },
          },
        },
      },
    }
    const evidence = structuredClone(address.source.rawSource)
    expect(getAddressLocale(address, 'en')).toMatchObject({
      buildingName: 'World-Wide House',
      premisesName: 'World-Wide Gardens',
    })
    expect(getAddressLocale(address, 'zhHant')).toMatchObject({
      buildingName: '環球大廈',
      premisesName: '世界花園',
    })
    expect(getAddressDisplay(address, 'en')).toContain('World-Wide Gardens')
    expect(address.source.rawSource).toEqual(evidence)
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
    const data = address.source.rawSource.data as {
      attributes: Record<string, unknown>
    }
    data.attributes.address3dCoverage = {
      kind: 'direct',
      ownerAddress2dId: 'building',
      address3dId: 'inventory',
      membership: 'established',
    }
    address.source.rawSource.included = [
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
      {
        value: 'unit-a',
        inventoryId: 'inventory',
        label: 'Unit A, 3/F',
        floorExpression: '3/F',
        unitExpression: 'Unit A',
      },
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
    expect(getAddressLocale(address, 'en')).toMatchObject({
      floorExpression: '3/F',
      unitExpression: 'Unit A',
    })
    const correctedFloor = setAddressOverride(address, 'en', 'floorExpression', '4/F')
    expect(getAddressDisplay(correctedFloor, 'en')).toBe('Unit A, 4/F, 18 Old Street')
    expect(
      getAddressDisplay(
        setAddressOverride(correctedFloor, 'en', 'floorExpression', undefined),
        'en',
      ),
    ).toBe('Unit A, 3/F, 18 Old Street')
    expect(address.source.address3dUnitId).toBe('unit-a')
    address.source.address3dUnitId = 'wrong-unit'
    expect(FeatureAddressSchema.safeParse(address).success).toBe(false)
    address.source.snapshotId = 'different-publication'
    expect(getAddressUnits(address, 'en')).toEqual([])
  })
  it('pins the unit request and rejects a mixed publication before applying it', async () => {
    const { loadGeocodedAddressUnits } = await import('#lib/api/external/geocoding.js')
    const address = fixture()
    let requested: URL | undefined
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requested = new URL(String(input))
      return Response.json({
        data: address.source.rawSource.data,
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

describe('generated locality context', () => {
  const town = {
    id: 'tsuen-wan',
    class: 'town',
    category: 'hood',
    level: 3,
    names: { en: { name: 'Tsuen Wan' }, 'zh-hant': { name: '荃灣' } },
  }
  it('composes current localities after English and before Chinese components', () => {
    let address = emptyFeatureAddress()
    address = setAddressOverride(address, 'en', 'streetName', 'WANG WO TSAI STREET')
    address = setAddressOverride(address, 'en', 'buildingNumberExpression', '57')
    address = setAddressOverride(address, 'zhHant', 'streetName', '橫窩仔街')
    address = setAddressOverride(address, 'zhHant', 'buildingNumberExpression', '57')
    expect(getAddressDisplay(address, 'en', [town])).toBe(
      '57 Wang Wo Tsai Street, Tsuen Wan',
    )
    expect(getAddressDisplay(address, 'zhHant', [town])).toBe('荃灣橫窩仔街57號')
    expect(getAddressDisplay(address, 'en', [])).toBe('57 Wang Wo Tsai Street')
    expect(
      getAddressDisplay(
        setAddressOverride(address, 'en', 'formattedAddress', 'Custom entrance'),
        'en',
        [town],
      ),
    ).toBe('Custom entrance')
  })
  it('deduplicates retained locality text and includes locality in urban addresses', () => {
    expect(
      getAddressDisplay(
        emptyFeatureAddress({ en: '57 Wang Wo Tsai Street, Tsuen Wan' }),
        'en',
        [town],
      ),
    ).toBe('57 Wang Wo Tsai Street, Tsuen Wan')
    expect(
      getAddressDisplay(
        setAddressOverride(emptyFeatureAddress(), 'en', 'streetName', 'Tsuen Wan Road'),
        'en',
        [town],
      ),
    ).toBe('Tsuen Wan Road, Tsuen Wan')
    const address = setAddressOverride(
      emptyFeatureAddress(),
      'en',
      'streetName',
      'Nathan Road',
    )
    const area = {
      id: 'kowloon',
      class: 'area',
      category: 'administrative',
      level: 1,
      names: { en: { name: 'Kowloon' } },
    }
    expect(getAddressDisplay(address, 'en', [area, town])).toBe(
      'Nathan Road, Tsuen Wan',
    )
  })
})

it('uses the smallest available locality in either urban or non-urban areas', () => {
  const division = (
    id: string,
    kind: string,
    level: number | null,
    en: string,
    zh: string,
  ) => ({
    id,
    class: kind,
    category: 'hood',
    level,
    names: { en: { name: en }, 'zh-hant': { name: zh } },
  })
  const town = division('town', 'town', 3, 'Town', '市鎮')
  const macrohood = division('macrohood', 'macrohood', 4, 'North Point', '北角')
  const neighbourhood = division('hood', 'neighbourhood', 5, 'Tsat Tsz Mui', '七姊妹')
  const microhood = division('microhood', 'microhood', 6, 'Smallest locality', '小社區')
  const island = division('island', 'major_island', 1, 'Hong Kong Island', '香港島')
  let address = setAddressOverride(
    emptyFeatureAddress(),
    'en',
    'streetName',
    'TSAT TSZ MUI ROAD',
  )
  address = setAddressOverride(address, 'en', 'buildingNumberExpression', '198–200')
  address = setAddressOverride(address, 'zhHant', 'streetName', '七姊妹道')
  address = setAddressOverride(address, 'zhHant', 'buildingNumberExpression', '198–200')
  expect(
    getAddressDisplay(address, 'en', [town, macrohood, neighbourhood, island]),
  ).toBe('198-200 Tsat Tsz Mui Road, Tsat Tsz Mui')
  expect(
    getAddressDisplay(address, 'zhHant', [town, macrohood, neighbourhood, island]),
  ).toBe('七姊妹七姊妹道198-200號')
  expect(getAddressDisplay(address, 'en', [town, macrohood, island])).toBe(
    '198-200 Tsat Tsz Mui Road, North Point',
  )
  expect(
    getAddressDisplay(address, 'en', [town, macrohood, neighbourhood, microhood]),
  ).toBe('198-200 Tsat Tsz Mui Road, Smallest locality')
  expect(
    getAddressDisplay(address, 'en', [
      { ...macrohood, level: null },
      { ...neighbourhood, level: null },
    ]),
  ).toBe('198-200 Tsat Tsz Mui Road, Tsat Tsz Mui')
})

it('derives missing Simplified Chinese components without rewriting source or overriding explicit clears', () => {
  let address = emptyFeatureAddress()
  address = setAddressOverride(address, 'zhHant', 'buildingName', '百利商業中心')
  address = setAddressOverride(address, 'zhHant', 'streetName', '漆咸道南')
  address = setAddressOverride(address, 'zhHant', 'buildingNumberExpression', '87-105')
  const locality = {
    id: 'bay',
    class: 'macrohood',
    category: 'hood',
    level: 4,
    names: { en: { name: 'Tsuen Wan' }, 'zh-hant': { name: '荃灣' } },
  }
  expect(getAddressDisplay(address, 'zhHans', [locality])).toBe(
    '荃湾漆咸道南87-105号百利商业中心',
  )
  expect(getAddressLocale(address, 'zhHans').buildingName).toBeUndefined()
  address = setAddressOverride(address, 'zhHans', 'buildingName', null)
  expect(getAddressDisplay(address, 'zhHans', [locality])).toBe('荃湾漆咸道南87-105号')
})

it('simplifies a retained Traditional display when no structured Simplified address exists', () => {
  const address = emptyFeatureAddress({ 'zh-hant': '荃灣廣場，請使用後門' })
  expect(getAddressDisplay(address, 'zhHans')).toBe('荃湾广场，请使用后门')
  expect(
    getAddressDisplay(
      setAddressOverride(address, 'zhHans', 'formattedAddress', null),
      'zhHans',
    ),
  ).toBe('')
})

it('shows a known localized locality even when that locale has no address components', () => {
  const stanley = {
    id: 'stanley',
    class: 'town',
    category: 'hood',
    level: 3,
    names: { en: { name: 'Stanley' }, 'zh-hant': { name: '赤柱' } },
  }
  const address = setAddressOverride(
    emptyFeatureAddress(),
    'en',
    'buildingName',
    'Martin Hostel',
  )
  expect(getAddressDisplay(address, 'en', [stanley])).toBe('Martin Hostel, Stanley')
  expect(getAddressDisplay(address, 'zhHant', [stanley])).toBe('赤柱')
  expect(getAddressDisplay(address, 'zhHans', [stanley])).toBe('赤柱')
  expect(getAddressDisplay(address, 'zhHant', [])).toBe('')
  expect(
    getAddressDisplay(
      setAddressOverride(address, 'zhHant', 'formattedAddress', ''),
      'zhHant',
      [stanley],
    ),
  ).toBe('')
})

it('localizes recognized source units instead of retaining English source fragments in Chinese', () => {
  const address = emptyFeatureAddress()
  address.source.rawSource = {
    data: {
      attributes: {
        i18n: {
          en: {
            streetName: 'HING FONG ROAD',
            buildingNumberExpression: '223',
            floorExpression: '33/F',
            unitExpression: 'Room 3308',
          },
          'zh-hant': {
            streetName: 'HING FONG ROAD',
            buildingNumberExpression: '223',
            floorExpression: '33/F',
            unitExpression: 'Room 3308',
          },
          'zh-hans': {
            streetName: '兴芳路',
            buildingNumberExpression: '223',
            floorExpression: '33楼',
            unitExpression: '3308房',
          },
        },
      },
    },
  }
  expect(getAddressDisplay(address, 'zhHant')).toBe('興芳路223號33樓3308房')
  expect(getAddressDisplay(address, 'zhHans')).toBe('兴芳路223号33楼3308房')
  expect(getAddressLocale(address, 'zhHant').streetName).toBe('HING FONG ROAD')
  expect(
    getAddressDisplay(
      setAddressOverride(address, 'zhHant', 'streetName', 'Custom Road'),
      'zhHant',
    ),
  ).toContain('Custom Road')
})

it('composes source unit semantics rather than copying a malformed localized formatted part', () => {
  const address = emptyFeatureAddress()
  address.source.authored = {
    scope: 'unit',
    i18n: {
      'zh-hant': {
        formattedAddress: '興芳路223號',
        streetName: '興芳路',
        buildingNumberExpression: '223',
      },
    },
    unit: {
      floorType: 'F',
      floorRef: '33',
      unitType: 'R',
      unitRef: '3308',
      unitPortion: null,
    },
    unitI18n: {
      'zh-hant': {
        floorExpression: '33/F',
        unitExpression: 'Room 3308',
        formattedAddressPart: '33/FRoom 3308',
      },
    },
  }
  expect(getAddressDisplay(address, 'zhHant')).toBe('興芳路223號33樓3308房')
  expect(address.source.authored?.unitI18n['zh-hant'].formattedAddressPart).toBe(
    '33/FRoom 3308',
  )
})

it('uses the published Chinese street when a catalogue override duplicates the English name', () => {
  let address = emptyFeatureAddress()
  address.overrides = {
    en: { streetName: 'Hing Fong Road' },
    'zh-hant': { streetName: 'HING FONG ROAD' },
    'zh-hans': { streetName: '兴芳路' },
  }
  expect(getAddressDisplay(address, 'zhHant')).toBe('興芳路')
  expect(address.overrides['zh-hant'].streetName).toBe('HING FONG ROAD')
  address = setAddressOverride(address, 'zhHant', 'streetName', '')
  expect(getAddressDisplay(address, 'zhHant')).toBe('')
})

it('never attaches marker localities to retained free-form display addresses', () => {
  const display = {
    en: '833, Shek O Village, Southern District, HK',
    'zh-hant': '石澳村833號南區香港',
    'zh-hans': '石澳村833号南区香港',
  }
  const address = emptyFeatureAddress(display)
  const before = JSON.stringify(address)
  for (const name of ['Tin Wan', 'Aberdeen']) {
    const locality = {
      id: name,
      class: 'neighbourhood',
      category: 'hood',
      level: 5,
      names: { en: { name }, 'zh-hant': { name: '田灣' }, 'zh-hans': { name: '田湾' } },
    }
    expect(getAddressDisplay(address, 'en', [locality])).toBe(display.en)
    expect(getAddressDisplay(address, 'zhHant', [locality])).toBe(display['zh-hant'])
    expect(getAddressDisplay(address, 'zhHans', [locality])).toBe(display['zh-hans'])
  }
  expect(JSON.stringify(address)).toBe(before)
})
