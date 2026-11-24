// @vitest-environment node
import { expect, it } from 'vitest'
import { proposeLocalAddressParse } from '#lib/addresses/localAddressParse.js'
import {
  applyLocalAddressParse,
  localAddressParseInput,
  localAddressContent,
  localAddressDraft,
} from '#lib/addresses/locationDraft.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import {
  completeStreetNames,
  structurePlaceAddress,
  setAddressName,
} from '#lib/addresses/nameCatalogue.js'
import {
  emptyFeatureAddress,
  getAddressLocale,
  getAddressDisplay,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import {
  setAddressBlock,
  setStructuredAddressExpression,
} from '#lib/addresses/addressExpressions.js'
const street = {
  id: 'street-1',
  names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
  divisionCodes: ['CW'],
}
it('structures a number and exact catalogue street while retaining source evidence', () => {
  const original = emptyFeatureAddress({ en: '25 Lyndhurst Terrace' })
  const next = structurePlaceAddress(original, [street])
  expect(getAddressLocale(next, 'en')).toMatchObject({
    buildingNumberFrom: '25',
    streetName: 'LYNDHURST TERRACE',
  })
  expect(getAddressDisplay(next, 'en')).toBe('25 Lyndhurst Terrace')
  expect(next.source.fallbackDisplay).toEqual(original.source.fallbackDisplay)
  expect(next.source.address2dId).toBeNull()
  expect(
    structurePlaceAddress(emptyFeatureAddress({ en: '25 Made Up Lane' }), [street])
      .source.authored,
  ).toBeUndefined()
})
it('leaves associated addresses intact and copies catalogue translations with a Simplified Chinese script fallback', () => {
  const address = emptyFeatureAddress()
  address.source.address2dId = 'canonical'
  expect(structurePlaceAddress(address, [street])).toBe(address)
  const next = setAddressName(address, 'streetName', street)
  expect(getAddressLocale(next, 'zhHant').streetName).toBe('擺花街')
  expect(getAddressLocale(next, 'zhHans').streetName).toBe('摆花街')
  expect(next.source.address2dId).toBe('canonical')
})
it('keeps custom complete display text unchanged until re-locked', () => {
  let address = structurePlaceAddress(
    emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
    [street],
  )
  address = setAddressOverride(address, 'en', 'formattedAddress', 'My complete address')
  address = setStructuredAddressExpression(address, 'en', 'floorExpression', '', 'UG')
  expect(getAddressDisplay(address, 'en')).toBe('My complete address')
  address = setAddressOverride(address, 'en', 'formattedAddress', undefined)
  expect(getAddressDisplay(address, 'en')).toBe('UG, 25 Lyndhurst Terrace')
})
it('does not copy a descriptive portion across languages and respects block order', () => {
  let address = setStructuredAddressExpression(
    emptyFeatureAddress(),
    'en',
    'unitPortion',
    'Rear portion',
  )
  expect(getAddressLocale(address, 'zhHant').unitPortion).toBeUndefined()
  address = setStructuredAddressExpression(address, 'zhHant', 'unitPortion', '後方部分')
  expect(getAddressDisplay(address, 'en')).toBe('Rear portion')
  expect(getAddressDisplay(address, 'zhHant')).toBe('後方部分')
  address = setAddressBlock(address, 'en', 'tower', '2', false)
  expect(getAddressLocale(address, 'en')).toMatchObject({
    blockType: 'tower',
    blockRef: '2',
    blockTypeBeforeNumber: false,
    blockExpression: '2 Tower',
  })
})

it('parses compound establishment addresses with unit and floor evidence', () => {
  const address = structurePlaceAddress(
    emptyFeatureAddress({ en: 'Shop 26, G/F, Charming Garden, 8 Hoi Ting Road' }),
    [{ id: 'hoi-ting', names: { en: 'Hoi Ting Road' }, divisionCodes: [] }],
  )
  const fields = getAddressLocale(address, 'en')
  expect(String(fields.streetName).toLowerCase()).toBe('hoi ting road')
  expect(fields.unitExpression).toBeTruthy()
  expect(fields.floorExpression).toBeTruthy()
})

it('retains bare unit, explicit floor and mall premises without inventing identity', () => {
  const original = emptyFeatureAddress({ en: 'A301, 3/F, YOHO Mall II' })
  const next = structurePlaceAddress(original, [])
  expect(getAddressLocale(next, 'en')).toMatchObject({
    premisesName: 'YOHO Mall II',
    floorExpression: '3/F',
    unitExpression: 'Unit A301',
  })
  expect(next.source.fallbackDisplay.en).toBe('A301, 3/F, YOHO Mall II')
  expect(next.source.address2dId).toBeNull()
})

it('normalizes a parsed ground floor before it reaches the editor', () => {
  const next = structurePlaceAddress(emptyFeatureAddress({ en: 'Shop C, G/F' }), [])
  expect(next.source.authored?.unit).toMatchObject({
    floorType: 'G',
    floorRef: '',
    unitRef: 'C',
  })
  expect(getAddressLocale(next, 'en').floorExpression).toBe('G/F')
  expect(getAddressDisplay(next, 'en')).not.toContain('GG/F')
})

it('fills the matched Martin street and its published Chinese name with the shared number', () => {
  const original = emptyFeatureAddress({ en: '57 WANG WO TSAI STREET' })
  const next = structurePlaceAddress(original, [
    {
      id: 'wang-wo-tsai',
      names: { en: 'WANG WO TSAI STREET', 'zh-Hant': '橫窩仔街' },
      divisionCodes: ['TW'],
    },
  ])
  expect(getAddressLocale(next, 'en')).toMatchObject({
    streetName: 'WANG WO TSAI STREET',
    buildingNumberFrom: '57',
  })
  expect(getAddressDisplay(next, 'zhHant')).toBe('橫窩仔街57號')
  expect(getAddressDisplay(next, 'zhHans')).toBe('横窝仔街57号')
  expect(next.source.fallbackDisplay).toEqual(original.source.fallbackDisplay)
})

it('preserves translated source text that cannot safely be structured', () => {
  const next = structurePlaceAddress(
    emptyFeatureAddress({ en: '25 Lyndhurst Terrace', 'zh-hant': '請使用後門' }),
    [street],
  )
  expect(getAddressDisplay(next, 'zhHant')).toBe('請使用後門')
})

it('parses Himark-style abbreviated streets and published building translations without duplicating the unit', () => {
  const original = emptyFeatureAddress({
    en: 'Rm 708, Beverley Commercial Centre, 87-105 Chatham Rd S',
  })
  const next = structurePlaceAddress(
    original,
    [
      {
        id: 'chatham',
        names: { en: 'CHATHAM ROAD SOUTH', 'zh-Hant': '漆咸道南' },
        divisionCodes: ['YTM'],
      },
    ],
    [
      {
        id: 'beverley',
        names: {
          en: 'Beverley Commercial Centre',
          'zh-Hant': '百利商業中心',
          'zh-Hans': '百利商业中心',
        },
        divisionCodes: [],
      },
    ],
  )
  const divisions = [
    {
      id: 'tst',
      class: 'macrohood',
      category: 'hood',
      level: 4,
      names: { en: { name: 'Tsim Sha Tsui' }, 'zh-hant': { name: '尖沙咀' } },
    },
  ]
  expect(getAddressLocale(next, 'en')).toMatchObject({
    streetName: 'CHATHAM ROAD SOUTH',
    buildingName: 'Beverley Commercial Centre',
    buildingNumberExpression: '87-105',
  })
  expect(getAddressDisplay(next, 'en', divisions)).toBe(
    'Rm 708, Beverley Commercial Centre, 87-105 Chatham Road South, Tsim Sha Tsui',
  )
  expect(getAddressDisplay(next, 'zhHant', divisions)).toBe(
    '尖沙咀漆咸道南87-105號百利商業中心708房',
  )
  expect(getAddressDisplay(next, 'zhHans', divisions)).toBe(
    '尖沙咀漆咸道南87-105号百利商业中心708房',
  )
  expect(next.source.fallbackDisplay).toEqual(original.source.fallbackDisplay)
})

it('uses the parsed 2D remainder when the street catalogue is unavailable', () => {
  const next = structurePlaceAddress(
    emptyFeatureAddress({ en: 'Rm 708, Unknown Building, 87-105 Chatham Rd S' }),
    [],
  )
  expect(getAddressDisplay(next, 'en')).toBe(
    'Rm 708, Unknown Building, 87-105 Chatham Rd S',
  )
})

it('clears missing building translations instead of retaining the previous names', () => {
  let address = setAddressName(emptyFeatureAddress(), 'buildingName', {
    id: 'old',
    names: { en: 'Old Hostel', 'zh-hant': '馬田宿舍', 'zh-hans': '马丁宿舍' },
    divisionCodes: [],
  })
  address = setAddressName(address, 'buildingName', {
    id: 'new',
    names: { en: 'Martin Hostel' },
    divisionCodes: [],
  })
  expect(getAddressLocale(address, 'en').buildingName).toBe('Martin Hostel')
  expect(getAddressLocale(address, 'zhHant').buildingName).toBeNull()
  expect(getAddressLocale(address, 'zhHans').buildingName).toBeNull()
  expect(address.detachedNames?.buildingName ?? {}).toEqual({})
  address = setAddressName(address, 'buildingName', {
    id: 'translated',
    names: { en: 'New Hostel', 'zh-hant': '新宿舍' },
    divisionCodes: [],
  })
  expect(getAddressLocale(address, 'zhHant').buildingName).toBe('新宿舍')
  expect(address.detachedNames?.buildingName ?? {}).toEqual({})
})

it('clears stale street translations when the selected catalogue record has no name for them', () => {
  let address = setAddressOverride(
    emptyFeatureAddress(),
    'zhHant',
    'streetName',
    '舊街',
  )
  address = setAddressName(address, 'streetName', {
    id: 'new',
    names: { en: 'New Street' },
    divisionCodes: [],
  })
  expect(getAddressLocale(address, 'zhHant').streetName).toBeNull()
  expect(address.detachedNames?.streetName?.['zh-hant']).toBeUndefined()
  const reset = setAddressOverride(address, 'zhHant', 'streetName', undefined)
  expect(reset.detachedNames?.streetName?.['zh-hant']).toBeUndefined()
  const cleared = setAddressName(address, 'streetName', null)
  expect(getAddressLocale(cleared, 'zhHant').streetName).toBeNull()
  expect(cleared.detachedNames?.streetName ?? {}).toEqual({})
})

it('completes provider street names and derives Simplified Chinese from the catalogue', () => {
  const original = emptyFeatureAddress()
  const address = setAddressOverride(original, 'en', 'streetName', 'Lyndhurst Terrace')
  const completed = completeStreetNames(address, [street])
  expect(getAddressLocale(completed, 'zhHant').streetName).toBe('擺花街')
  expect(getAddressLocale(completed, 'zhHans').streetName).toBe('摆花街')
  expect(completed.source).toBe(address.source)
  expect(completeStreetNames(completed, [street])).toBe(completed)
})

it('preserves explicit removals and refuses ambiguous street-name matches', () => {
  let address = setAddressOverride(
    emptyFeatureAddress(),
    'en',
    'streetName',
    'Lyndhurst Terrace',
  )
  address = setAddressOverride(address, 'zhHans', 'streetName', null)
  expect(
    getAddressLocale(completeStreetNames(address, [street]), 'zhHans').streetName,
  ).toBeNull()
  expect(completeStreetNames(address, [street, { ...street, id: 'other' }])).toBe(
    address,
  )
})

it('clears names in additional languages omitted by the selected building', () => {
  const address = setAddressOverride(
    emptyFeatureAddress(),
    'ja',
    'buildingName',
    '以前の建物',
  )
  const next = setAddressName(address, 'buildingName', {
    id: 'replacement',
    names: { en: 'Replacement Building' },
    divisionCodes: [],
  })
  expect(next.overrides.ja.buildingName).toBeNull()
  expect(getAddressLocale(next, 'en').buildingName).toBe('Replacement Building')
})

it('parses the current complete labels and keeps authored building names and custom displays on acceptance', () => {
  const content = createLocalLocationAddress({
    en: 'Retained earlier source',
    'zh-hant': '達德樓32打鼓嶺道九龍城區九龍',
    'zh-hans': '达德楼32打鼓岭道九龙城区九龙',
  })
  content.scope = 'building'
  content.i18n.en.buildingName = 'Tat Tak Building'
  content.i18n['zh-hant'].buildingName = '達德樓'
  content.i18n['zh-hans'].buildingName = '达德楼'
  const label = 'TAT TAK BUILDING, 32 TAK KU LING ROAD, KOWLOON CITY DISTRICT, KLN'
  const draft = setAddressOverride(
    localAddressDraft(content),
    'en',
    'formattedAddress',
    label,
  )
  const streets = [
    {
      id: 'tak-ku-ling',
      names: { en: 'Tak Ku Ling Road', 'zh-Hant': '打鼓嶺道' },
      divisionCodes: [],
    },
  ]
  const review = proposeLocalAddressParse(
    localAddressParseInput(draft, 'building'),
    streets,
  )
  expect(review.source.en).toBe(label)
  expect(review.unresolved.en).toBe('KOWLOON CITY DISTRICT KLN')
  expect(review.content.scope).toBe('building')
  for (const [tag, streetName] of Object.entries({
    en: 'Tak Ku Ling Road',
    'zh-hant': '打鼓嶺道',
    'zh-hans': '打鼓岭道',
  })) {
    expect(review.content.i18n[tag]).toMatchObject({
      streetName,
      buildingNumberExpression: '32',
      buildingNumberFrom: '32',
      buildingName: content.i18n[tag].buildingName,
    })
  }
  expect(content.i18n.en.streetName).toBeUndefined()
  const accepted = applyLocalAddressParse(draft, review.content)
  expect(getAddressDisplay(accepted, 'en')).toBe(label)
  expect(localAddressContent(accepted).i18n.en).toMatchObject({
    buildingName: 'Tat Tak Building',
    streetName: 'Tak Ku Ling Road',
    buildingNumberFrom: '32',
  })
  expect(accepted.source.address2dId).toBeNull()
})

it('keeps an unknown street unresolved and honors an explicitly cleared source', () => {
  const content = createLocalLocationAddress({
    en: '9 Imaginary Street',
    'zh-hant': '擺花街8號',
  })
  const draft = setAddressOverride(
    localAddressDraft(content),
    'zhHant',
    'formattedAddress',
    '',
  )
  const review = proposeLocalAddressParse(localAddressParseInput(draft), [street])
  expect(review.unresolved.en).toBe('9 IMAGINARY STREET')
  expect(review.content.i18n.en.streetName).toBeUndefined()
  expect(review.content.i18n.en.buildingNumberFrom).toBeUndefined()
  expect(review.source['zh-hant']).toBe('')
  expect(review.content.i18n['zh-hant'].streetName).toBeUndefined()
})

it('retains both endpoints of a range following a matched Chinese street', () => {
  const content = createLocalLocationAddress()
  const review = proposeLocalAddressParse(
    { content, source: { 'zh-hant': '擺花街32–34A號', 'zh-hans': '摆花街32-34A号' } },
    [street],
  )
  for (const row of Object.values(review.content.i18n))
    expect(row).toMatchObject({
      buildingNumberExpression: '32-34A',
      buildingNumberFrom: '32',
      buildingNumberTo: '34A',
      buildingNumberConnector: '-',
    })
  expect(review.unresolved).toEqual({})
})

const lungKongRoad = {
  id: 'lung-kong',
  names: { en: 'Lung Kong Road', 'zh-Hant': '龍崗道', 'zh-Hans': '龙岗道' },
  divisionCodes: [],
}

it('extracts Lung Kong Road and repairs the Chinese number range on review and acceptance', () => {
  const source = {
    'zh-hant': '佳景樓5759龍崗道九龍城區九龍',
    'zh-hans': '佳景楼5759龙岗道九龙城区九龙',
    en: 'KAI KING MANSION, 57-59 LUNG KONG ROAD, KOWLOON CITY DISTRICT, KLN',
  }
  const content = createLocalLocationAddress(source)
  content.i18n.en.buildingName = 'Kai King Mansion'
  content.i18n['zh-hant'].buildingName = '佳景樓'
  content.i18n['zh-hans'].buildingName = '佳景楼'
  const draft = localAddressDraft(content)
  const review = proposeLocalAddressParse(localAddressParseInput(draft, 'building'), [
    lungKongRoad,
  ])
  expect(review.source).toEqual(source)
  const accepted = applyLocalAddressParse(draft, review.content)
  const saved = localAddressContent(accepted)
  for (const [tag, streetName] of Object.entries(lungKongRoad.names)) {
    const fields = {
      streetName,
      buildingNumberExpression: '57-59',
      buildingNumberFrom: '57',
      buildingNumberTo: '59',
      buildingNumberConnector: '-',
    }
    expect(review.content.i18n[tag.toLowerCase()]).toMatchObject(fields)
    expect(saved.i18n[tag.toLowerCase()]).toMatchObject(fields)
  }
  expect(getAddressDisplay(accepted, 'zhHant')).toBe('龍崗道57-59號佳景樓')
  expect(getAddressDisplay(accepted, 'zhHans')).toBe('龙岗道57-59号佳景楼')
  expect(review.unresolved['zh-hant']).toBe('九龍城區九龍')
  expect(review.unresolved['zh-hans']).toBe('九龙城区九龙')
})

it.each([
  ['5759 Lung Kong Road', '龙岗道5759号', [lungKongRoad]],
  ['57-59 Lyndhurst Terrace', '龙岗道5759号', [street, lungKongRoad]],
  ['57-59 Lung Kong Road', '龙岗道57-60号', [lungKongRoad]],
  [
    '57-59 Lung Kong Road',
    '龙岗道5759号',
    [lungKongRoad, { ...lungKongRoad, id: 'other' }],
  ],
] as const)(
  'keeps 5759 without unambiguous matching range evidence (%s, %s)',
  (en, simplified, streets) => {
    const content = createLocalLocationAddress()
    const review = proposeLocalAddressParse(
      { content, source: { en, 'zh-hant': '龍崗道5759號', 'zh-hans': simplified } },
      [...streets],
    )
    expect(review.content.i18n['zh-hant']).toMatchObject({
      buildingNumberFrom: '5759',
      buildingNumberTo: null,
      buildingNumberConnector: null,
    })
  },
)
