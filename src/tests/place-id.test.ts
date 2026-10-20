import { expect, it } from 'vitest'
import { derivePlaceId } from '#lib/places/id.server.js'

it('keeps the import ID algorithm stable across upgrades', () => {
  expect(derivePlaceId('breadline-donor', '109')).toBe('lcA8iqm-137v')
  expect(derivePlaceId('saanseoi', 'ss-example')).toBe('nlPoCR5CNpcL')
})

it('separates source identities without exposing their namespaces', () => {
  const ids = [
    'breadline-donor',
    'breadline-dropoff',
    'feature-baseline',
    'saanseoi',
  ].map(origin => derivePlaceId(origin as Parameters<typeof derivePlaceId>[0], '109'))
  expect(new Set(ids).size).toBe(4)
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/)
  expect(() => derivePlaceId('saanseoi', '')).toThrow('nonempty source ID')
})
