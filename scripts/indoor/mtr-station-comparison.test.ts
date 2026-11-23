import { describe, expect, it } from 'vitest'
import { compareStationShops } from './mtr-station-comparison'

const station = { id: 'KOT', name: 'Kowloon Tong', nameZh: '九龍塘' }
const shop = {
  sourceRecordId: 'shop-1',
  businessName: 'Bakery',
  properties: { station: 'Kowloon Tong', shopNumber: 'KOT 118 & 119' },
}
const candidate = {
  id: 'ss-shop',
  resourceReleaseId: 'release',
  names: ['Bakery'],
  addresses: ['Shop KOT118-119, MTR Kowloon Tong Station'],
}

describe('station shop comparisons', () => {
  it('recognizes complete code groups and matching tenant names', () => {
    expect(
      compareStationShops(station, [shop], [candidate])[0].matches[0].evidence,
    ).toBe('code-and-name')
  })
  it('keeps another tenant at the same code unconfirmed', () => {
    const rows = compareStationShops(
      station,
      [shop],
      [{ ...candidate, names: ['Old tenant'] }],
    )
    expect(rows[0].matches[0].evidence).toBe('code-tenant-unconfirmed')
  })
  it('requires station evidence for a name-only fallback', () => {
    expect(
      compareStationShops(
        station,
        [shop],
        [{ ...candidate, addresses: ['Nearby street'] }],
      )[0].matches,
    ).toEqual([])
    expect(
      compareStationShops(
        station,
        [shop],
        [{ ...candidate, addresses: ['Kowloon Tong Station'] }],
      )[0].matches[0].evidence,
    ).toBe('station-and-name')
  })
  it('flags the same brand at a different unit instead of accepting it', () => {
    expect(
      compareStationShops(
        station,
        [shop],
        [{ ...candidate, addresses: ['KOT 113, Kowloon Tong Station'] }],
      )[0].matches[0].conflictingCode,
    ).toBe(true)
  })
  it('does not match a prefix or another station code', () => {
    expect(
      compareStationShops(
        station,
        [shop],
        [{ ...candidate, names: ['Other'], addresses: ['KOT 1180, station'] }],
      )[0].matches,
    ).toEqual([])
    expect(
      compareStationShops(
        station,
        [shop],
        [{ ...candidate, addresses: ['KET 118-119'] }],
      )[0].matches,
    ).toEqual([])
  })
})
