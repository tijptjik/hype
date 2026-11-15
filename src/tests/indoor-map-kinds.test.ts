// TESTS
import { afterEach, expect, it, vi } from 'vitest'
// DOMAIN
import {
  availablePremisesMap,
  loadPremisesCatalogue,
  premisesPath,
  searchPremises,
} from '../lib/indoor/registry'

afterEach(() => vi.unstubAllGlobals())
it('uses explicit map kinds for building and complex routes without changing source API paths', async () => {
  const entries = ['building', 'complex'].map(kind => ({
    id: `example-${kind}`,
    code: kind.toUpperCase(),
    kind,
    name: `Example ${kind}`,
    nameZh: '',
    publishedHash: 'a'.repeat(64),
    footprint: null,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => entries }),
  )
  await loadPremisesCatalogue()
  expect(premisesPath('BUILDING', 'unit')).toBe(
    '/buildings/example-building/places/unit',
  )
  expect(premisesPath('COMPLEX', 'unit')).toBe('/premises/example-complex/places/unit')
  expect(availablePremisesMap('example-building')).toMatchObject({
    href: '/buildings/example-building',
    basePath: '/api/premises-maps/example-building',
  })
  expect(searchPremises('Example').map(venue => venue.kind)).toEqual([
    'building',
    'complex',
  ])
  expect(premisesPath('KET')).toBe('/premises/kennedy-town-mtr')
})
