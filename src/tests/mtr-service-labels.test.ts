import { describe, it, expect } from 'vitest'
import {
  canonicalMtrServiceLabel,
  groupMtrServiceLabels,
} from '../lib/locations/mtrServiceLabels'
describe('MTR service labels', () => {
  it('uses typographic quotes and singular service labels', () => {
    expect(canonicalMtrServiceLabel('"iAM Smart" Self-Registration Kiosk')).toBe(
      '“iAM Smart” Self-Registration Kiosk',
    )
    expect(canonicalMtrServiceLabel('Octopus Service Points')).toBe(
      'Octopus Service Point',
    )
    expect(canonicalMtrServiceLabel('Marks & Spencer')).toBe('Marks & Spencer')
  })
  it('groups aliases without losing sources or mutating evidence', () => {
    const rows = [
      '"iAM Smart" Self-Registration Kiosk',
      '“iAM Smart” Self-Registration Kiosk',
      'Octopus Service Point',
      'Octopus Service Points',
    ].map((name, index) => ({
      name,
      businessKey: String(index),
      entries: 1,
      sourceRecordIds: [String(index)],
      sources: [{ id: String(index), url: 'https://www.mtr.com.hk/' }],
    }))
    const grouped = groupMtrServiceLabels(rows)
    expect(grouped).toHaveLength(2)
    expect(grouped[0].businessKeys).toEqual(['0', '1'])
    expect(grouped[1].sourceRecordIds).toEqual(['2', '3'])
    expect(grouped.map(row => row.entries)).toEqual([2, 2])
    expect(rows[0].name).toBe('"iAM Smart" Self-Registration Kiosk')
  })
})

it('consolidates the three Swire labels without dropping any listings', () => {
  const rows = ['Swire Coca Cola', 'Swire Coca Cola HK', 'Swire Coca-Cola'].map(
    (name, index) => ({
      name,
      businessKey: String(index),
      entries: [1, 20, 2][index],
      sourceRecordIds: [String(index)],
      sources: [{ id: String(index), url: 'https://www.mtr.com.hk/' }],
    }),
  )
  const grouped = groupMtrServiceLabels(rows)
  expect(grouped).toHaveLength(1)
  expect(grouped[0].name).toBe('Swire Coca-Cola')
  expect(grouped[0].entries).toBe(23)
  expect(grouped[0].businessKeys).toHaveLength(3)
})
