// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// ADDRESS
import {
  parseStreetNumber,
  formatStreetNumber,
  streetNumberIssue,
} from '#lib/addresses/streetNumber.js'
import { setAddressExpression } from '#lib/addresses/addressExpressions.js'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { localAddressContent, localAddressDraft } from '#lib/addresses/locationDraft.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'

const examples = [
  ['128-132', '128', '132', '-', '128-132'],
  ['124B-124C', '124B', '124C', '-', '124B-124C'],
  ['124B,124C', '124B', '124C', '/', '124B/C'],
  ['124B & 124C', '124B', '124C', '/', '124B/C'],
  ['124B & 126A', '124B', '126A', '&', '124B & 126A'],
  ['124B-126A', '124B', '126A', '-', '124B-126A'],
  ['124-126A', '124', '126A', '-', '124-126A'],
  ['124B/C', '124B', '124C', '/', '124B/C'],
  ['124B-C', '124B', '124C', '-', '124B-124C'],
  ['124b、124c', '124B', '124C', '/', '124B/C'],
  ['１２４ｂ ＆ １２６ａ', '124B', '126A', '&', '124B & 126A'],
  [' 128 – 132 ', '128', '132', '-', '128-132'],
  ['128 to 132', '128', '132', '-', '128-132'],
  ['128至132', '128', '132', '-', '128-132'],
  ['238-A', '238A', null, null, '238A'],
  ['124 b', '124B', null, null, '124B'],
  ['124', '124', null, null, '124'],
  ['124-124', '124', '124', '-', '124-124'],
] as const

describe('street-number input, structure, persistence and display', () => {
  it.each(examples)(
    '%s → %s / %s / %s → %s',
    (raw, from, to, connector, expression) => {
      expect(parseStreetNumber(raw)).toEqual({
        valid: true,
        number: { from, to, connector, expression },
      })
      let address = setAddressExpression(
        emptyFeatureAddress(),
        'en',
        'streetName',
        'Hollywood Road',
      )
      address = setAddressExpression(address, 'zhHant', 'streetName', '荷李活道')
      address = setAddressExpression(address, 'en', 'buildingNumberExpression', raw)
      for (const locale of ['en', 'zh-hant', 'zh-hans']) {
        expect(address.overrides[locale]).toMatchObject({
          buildingNumberFrom: from,
          buildingNumberTo: to,
          buildingNumberConnector: connector,
        })
      }
      expect(FeatureAddressSchema.safeParse(address).success).toBe(true)
      expect(getAddressDisplay(address, 'en')).toBe(`${expression} Hollywood Road`)
      expect(getAddressDisplay(address, 'zhHant')).toBe(`荷李活道${expression}號`)
      const content = localAddressContent(address)
      expect(content.i18n.en).toMatchObject({
        buildingNumberExpression: expression,
        buildingNumberFrom: from,
        buildingNumberTo: to,
        buildingNumberConnector: connector,
      })
      expect(getAddressDisplay(localAddressDraft(content), 'en')).toBe(
        `${expression} Hollywood Road`,
      )
    },
  )
  it.each(['132-128', '124C-124B', '126A & 124B', '124-6', '124B/A'])(
    'rejects descending endpoints: %s',
    raw => {
      expect(parseStreetNumber(raw)).toEqual({ valid: false, error: 'descending' })
      const address = setAddressExpression(
        emptyFeatureAddress(),
        'en',
        'buildingNumberExpression',
        raw,
      )
      expect(FeatureAddressSchema.safeParse(address).success).toBe(false)
      expect(address.overrides.en).toMatchObject({
        buildingNumberExpression: raw,
        buildingNumberFrom: null,
        buildingNumberTo: null,
        buildingNumberConnector: null,
      })
    },
  )
  it.each([
    '124-',
    '124B &',
    '124,,126',
    '124/126/128',
    '124,126,128',
    '-124',
    '124.5',
    'entrance',
    '124--126',
  ])('rejects incomplete or unsupported syntax: %s', raw => {
    expect(parseStreetNumber(raw)).toEqual({ valid: false, error: 'format' })
  })
  it('allows clearing, rejects descending scalar-only corrections, and preserves unfamiliar source evidence', () => {
    expect(parseStreetNumber(' ')).toEqual({
      valid: true,
      number: { expression: '', from: null, to: null, connector: null },
    })
    expect(
      streetNumberIssue({ buildingNumberFrom: '132', buildingNumberTo: '128' }),
    ).toBe('descending')
    expect(formatStreetNumber('', '124B', '124C', '/')).toBe('124B/C')
    const address = localAddressDraft({
      ...createLocalLocationAddress(),
      i18n: {
        en: {
          formattedAddress: '',
          buildingNumberExpression: 'retained provider label',
        },
      },
    })
    expect(FeatureAddressSchema.safeParse(address).success).toBe(true)
    expect(formatStreetNumber('retained provider label')).toBe(
      'retained provider label',
    )
  })
  it('rejects descending authored numbers at the local Location submission boundary', () => {
    const content = createLocalLocationAddress()
    content.i18n.en = { formattedAddress: '', buildingNumberExpression: '132-128' }
    const input = {
      state: 'manual',
      kind: 'establishment',
      facts: {
        names: { en: 'Example' },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates: [114, 22] },
          address: localAddressDraft(content).source,
        },
      },
    }
    const invalid = LocalLocationInputSchema.safeParse(input)
    expect(invalid.success).toBe(false)
    if (!invalid.success)
      expect(
        invalid.error.issues.some(
          issue => issue.path.at(-1) === 'buildingNumberExpression',
        ),
      ).toBe(true)
    content.i18n.en.buildingNumberExpression = '128-132'
    input.facts.location.address = localAddressDraft(content).source
    expect(LocalLocationInputSchema.safeParse(input).success).toBe(true)
  })
})
