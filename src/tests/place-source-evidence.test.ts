import { describe, expect, it } from 'vitest'
import { equalPlaceSourceRecord } from '#lib/places/sourceEvidence.js'
const record = {
  type: 'places',
  id: 'shop',
  attributes: {
    name: 'Bakery',
    websites: ['https://shop.example'],
    links: { booking: 'https://booking.example' },
  },
  links: { self: 'https://production.example/places/shop' },
  relationships: {
    address: {
      data: { type: 'addresses', id: 'building' },
      links: { related: 'https://production.example/addresses/building' },
      meta: { verified: true },
    },
  },
}
describe('canonical source record evidence', () => {
  it('ignores API-origin and navigation-query changes without mutating evidence', () => {
    const next = structuredClone(record)
    next.links.self = 'https://local-source.invalid/places/shop?profile=full'
    next.relationships.address.links.related =
      'https://local-source.invalid/addresses/building'
    expect(equalPlaceSourceRecord(record, next)).toBe(true)
    expect(record.links.self).toBe('https://production.example/places/shop')
  })
  it.each(['name', 'website', 'embedded-link', 'address', 'relationship-meta'])(
    'retains meaningful %s differences',
    kind => {
      const next = structuredClone(record)
      if (kind === 'name') next.attributes.name = 'Other shop'
      if (kind === 'website') next.attributes.websites = ['https://other.example']
      if (kind === 'embedded-link')
        next.attributes.links.booking = 'https://other.example'
      if (kind === 'address') next.relationships.address.data.id = 'other-building'
      if (kind === 'relationship-meta') next.relationships.address.meta.verified = false
      expect(equalPlaceSourceRecord(record, next)).toBe(false)
    },
  )
  it('retains links when they are the only relationship identity', () => {
    expect(
      equalPlaceSourceRecord(
        { id: 'shop', relationships: { address: { links: { related: '/a' } } } },
        { id: 'shop', relationships: { address: { links: { related: '/b' } } } },
      ),
    ).toBe(false)
  })
  it('does not mistake absent or malformed resources for matching evidence', () => {
    expect(equalPlaceSourceRecord(null, null)).toBe(false)
    expect(equalPlaceSourceRecord([], [])).toBe(false)
    expect(equalPlaceSourceRecord(record, undefined)).toBe(false)
  })
})
