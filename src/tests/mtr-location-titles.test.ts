// TESTS
import { expect, it } from 'vitest'
// DOMAIN
import { mtrLocationTitles } from '../../scripts/indoor/mtr-location-titles'

it('qualifies the English station title without changing other locales or the input', () => {
  const names = { en: 'Quarry Bay', 'zh-hant': '鰂魚涌' }
  expect(mtrLocationTitles(names)).toEqual({ ...names, en: 'Quarry Bay MTR' })
  expect(names.en).toBe('Quarry Bay')
})

it('is idempotent and replaces the longer station suffix', () => {
  for (const en of ['Quarry Bay MTR', 'Quarry Bay MTR Station'])
    expect(mtrLocationTitles({ en })).toEqual({ en: 'Quarry Bay MTR' })
  expect(() => mtrLocationTitles({ en: ' ' })).toThrow('English name')
})
