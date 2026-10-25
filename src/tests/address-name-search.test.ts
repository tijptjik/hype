import { expect, it } from 'vitest'
import { searchAddressNames, addressNameLabel } from '../lib/addresses/nameSearch'

const rows: import('../lib/addresses/nameCatalogue').AddressName[] = [
  {
    id: '1',
    names: { en: 'TAI HING STREET', 'zh-Hant': '大興街' },
    divisionCodes: ['TM'],
  },
  {
    id: '2',
    names: { en: 'HING FAT STREET', 'zh-Hant': '興發街', 'zh-Hans': '兴发街' },
    divisionCodes: ['E'],
  },
]
it('matches substrings and case in the selected locale', () => {
  expect(searchAddressNames(rows, 'tai hing', 'en').map(row => row.id)).toEqual(['1'])
  expect(searchAddressNames(rows, 'hing', 'en').map(row => row.id)).toEqual(['1', '2'])
  expect(searchAddressNames(rows, '興', 'zhHant').map(row => row.id)).toEqual([
    '1',
    '2',
  ])
  expect(searchAddressNames(rows, '兴', 'zhHans').map(row => row.id)).toEqual(['2'])
})
it('does not substitute English or Traditional Chinese for missing Simplified names', () => {
  expect(addressNameLabel(rows[0], 'zhHans')).toBe('')
  expect(searchAddressNames(rows, 'hing', 'zhHant')).toEqual([])
  expect(searchAddressNames(rows, '', 'zhHans')).toHaveLength(1)
})
it('normalizes input and bounds suggestions without limiting the searched catalogue', () => {
  expect(searchAddressNames(rows, ' ＨＩＮＧ ', 'en', 1)).toHaveLength(1)
  expect(searchAddressNames(rows, 'fat', 'en', 1)[0].id).toBe('2')
})

it('ignores punctuation on both sides while preserving published labels', () => {
  const punctuated = [{ id: 'mart', names: { en: 'M.Art' }, divisionCodes: [] }]
  expect(searchAddressNames(punctuated, 'mart', 'en')).toEqual(punctuated)
  expect(searchAddressNames(punctuated, 'ｍ，art', 'en')).toEqual(punctuated)
  expect(addressNameLabel(punctuated[0], 'en')).toBe('M.Art')
  expect(searchAddressNames(punctuated, '...', 'en')).toEqual([])
})
