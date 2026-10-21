import { expect, it } from 'vitest'
import { deriveLocationId, deriveLocationBaselineId } from '#lib/locations/id.server.js'

it('keeps the import ID algorithm stable across upgrades', () => {
  expect(deriveLocationId('breadline-donor', '109')).toBe('lcA8iqm-137v')
  expect(deriveLocationId('saanseoi', 'ss-example')).toBe('nlPoCR5CNpcL')
})

it('separates source identities without exposing their namespaces', () => {
  const ids = [
    'breadline-donor',
    'breadline-dropoff',
    'feature-baseline',
    'saanseoi',
  ].map(origin =>
    deriveLocationId(origin as Parameters<typeof deriveLocationId>[0], '109'),
  )
  expect(new Set(ids).size).toBe(4)
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/)
  expect(() => deriveLocationId('saanseoi', '')).toThrow('nonempty source ID')
})

it('gives reproducible opaque revision identities without source prefixes', () => {
  const locationId = deriveLocationId('breadline-donor', '109')
  const revisionId = deriveLocationBaselineId(locationId)
  expect(revisionId).toMatch(/^[A-Za-z0-9_-]{12}$/)
  expect(deriveLocationBaselineId(locationId)).toBe(revisionId)
  expect(revisionId).not.toBe(locationId)
})
