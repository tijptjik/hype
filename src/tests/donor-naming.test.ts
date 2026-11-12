// @vitest-environment node
import { expect, it } from 'vitest'
import {
  donorNamingInputs,
  donorNamingTemplate,
  PAID_PROPERTY,
} from '../../scripts/breadline/donor-naming'
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
} from '../lib/templates/displayTemplate'
import { DisplayTemplateDefinitionSchema } from '../lib/templates/registry'

it('joins present parts without dangling separators, preserving false and zero', () => {
  const template = '{{ join(left, right, " - ") }}'
  for (const [left, right, expected] of [
    ['Brand', 'Cakes', 'Brand - Cakes'],
    ['Brand', '', 'Brand'],
    [null, 'Cakes', 'Cakes'],
    [undefined, ' ', ''],
    [false, 0, 'false - 0'],
  ] as const)
    expect(renderDisplayTemplate(template, { left, right })).toBe(expected)
})

it('composes brand, format, branch, access and paid status with standalone fallback', () => {
  const definition = donorNamingTemplate()
  const values = {
    'brand.name': 'Maxim’s',
    'format.name': 'Cakes',
    branch: 'Central MTR',
    accessHint: 'B',
    [`properties.${PAID_PROPERTY}`]: true,
    'location.name': 'Standalone',
  }
  expect(renderDisplayTemplate(definition.locales.en, values)).toBe(
    'Maxim’s Cakes - Central MTR (B - Paid)',
  )
  expect(
    renderDisplayTemplate(definition.locales.en, {
      ...values,
      branch: '',
      accessHint: '',
      [`properties.${PAID_PROPERTY}`]: null,
    }),
  ).toBe('Standalone')
  expect(
    renderDisplayTemplate(definition.locales['zh-Hans'], {
      'brand.name': '美心西饼',
      branch: '中环站',
      [`properties.${PAID_PROPERTY}`]: true,
    }),
  ).toBe('美心西饼 - 中环站 (闸内)')
  expect(parseDisplayTemplate(definition.locales.en).dependencies).toContain(
    `properties.${PAID_PROPERTY}`,
  )
})

it('limits feature access hints to feature templates', () => {
  expect(
    DisplayTemplateDefinitionSchema.safeParse({
      name: 'Hint',
      code: 'hint',
      target: 'location',
      locales: { en: '{{ accessHint }}' },
    }).success,
  ).toBe(false)
  expect(
    DisplayTemplateDefinitionSchema.safeParse({
      name: 'Hint',
      code: 'hint',
      target: 'feature',
      locales: { en: '{{ accessHint }}' },
    }).success,
  ).toBe(true)
})

it('uses store letters as access hints and restores translated paid-area distinctions', () => {
  const result = donorNamingInputs(
    'test',
    { en: '7-Eleven - MTR Kowloon Tong D PAID ', 'zh-Hant': '7-Eleven - 九龍塘D站' },
    '',
  )
  expect(result.branch.en).toBe('Kowloon Tong MTR')
  expect(result.branch['zh-Hant']).toBe('九龍塘站')
  expect(result.accessHints.en).toBe('D')
  expect(result.paid).toBe(true)
  expect(result.notes.join(' ')).not.toContain('Exit')
})

it('keeps estate blocks, corrects spelling, and normalizes Peninsula standalone names', () => {
  expect(
    donorNamingInputs(
      'blD87a4a78ec',
      { en: '7-Eleven - Whampoa F', 'zh-Hant': '7-Eleven - 黃埔F' },
      '',
    ).branch.en,
  ).toBe('Whampoa F')
  expect(
    donorNamingInputs(
      'test',
      { en: 'Brand - Yau Mai Tei MTR', 'zh-Hant': '品牌 - 油麻地站' },
      '',
    ).branch.en,
  ).toBe('Yau Ma Tei MTR')
  expect(
    donorNamingInputs(
      'blDc22e1a4ac',
      { en: 'The Peninsula Hong Kong', 'zh-Hant': '香港半島酒店' },
      '',
    ).standalone,
  ).toEqual({ en: 'The Peninsula', 'zh-Hant': '半島酒店', 'zh-Hans': '半岛酒店' })
})

it('combines optional access and paid labels without empty punctuation', () => {
  const source = donorNamingTemplate().locales.en
  for (const [hint, paid, suffix] of [
    ['D', true, ' (D - Paid)'],
    ['Tickets', true, ' (Tickets - Paid)'],
    ['North Corridor', true, ' (North Corridor - Paid)'],
    ['', true, ' (Paid)'],
    ['', null, ''],
    ['D', false, ' (D)'],
    ['H; Outside station', null, ' (H; Outside station)'],
  ] as const) {
    expect(
      renderDisplayTemplate(source, {
        'location.name': 'Store',
        accessHint: hint,
        [`properties.${PAID_PROPERTY}`]: paid,
      }),
    ).toBe(`Store${suffix}`)
  }
})
it('applies reviewed mall corrections and Check-in capitalization', () => {
  expect(
    donorNamingInputs(
      'blD236b565af',
      { en: 'Saint Honore - Yau Tong MTR', 'zh-Hant': '聖安娜 - 大本型' },
      '',
    ).branch.en,
  ).toBe('Domain Mall')
  const harbour = donorNamingInputs(
    'blD089ee14b9',
    { en: '7-Eleven - Harbour City', 'zh-Hant': '7-Eleven - 海港城港' },
    '',
  )
  expect(harbour.branch['zh-Hant']).toBe('海港城')
  expect(harbour.branch['zh-Hans']).toBe('海港城')
  expect(harbour.review).toEqual([])
  expect(
    donorNamingInputs(
      'blDe9ad42e2c',
      { en: '7-Eleven - Hong Kong In-town Check-in', 'zh-Hant': '7-Eleven - 香港站' },
      '',
    ).accessHints.en,
  ).toBe('In-town Check-in')
})
