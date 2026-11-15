import { expect, test } from 'bun:test'
import { buildingPartDisplay } from '../../src/lib/locations/buildingPartDisplay'
import type { LocationResource } from '../../src/lib/locations/resource'

const part = {
  kind: 'building_part',
  facts: { names: { en: 'KOT 17' }, location: { address: { fallbackDisplay: {} } } },
  parentLocation: {
    id: 'station',
    names: { en: 'Kowloon Tong MTR', 'zh-hant': '九龍塘' },
    displayAddress: {},
  },
} as unknown as LocationResource

test('building-part display uses explicit parent, localizes and preserves retained facts', () => {
  const original = JSON.stringify(part)
  expect(buildingPartDisplay(part)).toEqual({
    en: 'KOT 17, Kowloon Tong MTR',
    'zh-hant': 'KOT 17, 九龍塘',
  })
  expect(JSON.stringify(part)).toBe(original)
  expect(buildingPartDisplay({ ...part, parentLocation: null })).toEqual({})
  expect(buildingPartDisplay({ ...part, kind: 'establishment' })).toEqual({})
})

test('parent display address is preferred and existing part display text wins', () => {
  const p = structuredClone(part)
  p.parentLocation!.displayAddress.en = 'Kowloon Tong Station, Suffolk Road'
  expect(buildingPartDisplay(p).en).toBe('KOT 17, Kowloon Tong Station, Suffolk Road')
  p.facts!.location.address.fallbackDisplay = { en: 'Authored location' }
  expect(buildingPartDisplay(p).en).toBe('Authored location')
})
