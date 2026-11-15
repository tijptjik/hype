// TESTS
import { expect, it } from 'vitest'
// DOMAIN
import {
  availablePremisesMap,
  premisesCode,
  premisesMapForCode,
  premisesPath,
  stations,
} from '../lib/indoor/registry'

it('resolves only descriptive MTR premises URLs', () => {
  expect(premisesCode('kennedy-town-mtr')).toBe('KET')
  expect(premisesCode('hong-kong-mtr')).toBe('HOK')
  expect(premisesCode('mtr-ket')).toBeUndefined()
  expect(premisesCode('mtr-hok')).toBeUndefined()
  expect(premisesCode('mtr-adm')).toBeUndefined()
  expect(premisesCode('admiralty-mtr')).toBe('ADM')
  expect(premisesPath('ADM')).toBe('/premises/admiralty-mtr')
  expect(premisesCode('kennedy-town')).toBeUndefined()
  expect(premisesPath('KET')).toBe('/premises/kennedy-town-mtr')
  expect(premisesPath('KET', 'unit')).toBe('/premises/kennedy-town-mtr/places/unit')
  expect(premisesMapForCode('ADM')).toBeNull()
})
it('offers only enabled, ready maps without changing the stored reference', () => {
  const premisesMaps = [
    {
      id: 'sample-map',
      code: 'SAMPLE',
      basePath: '/api/premises-maps/sample-map',
      enabled: true,
      ready: true,
    },
  ]
  expect(availablePremisesMap('unknown')).toBeNull()
  for (const change of [{ enabled: false }, { ready: false }]) {
    expect(
      availablePremisesMap(
        'sample-map',
        premisesMaps.map(map => ({ ...map, ...change })),
      ),
    ).toBeNull()
  }
  expect(availablePremisesMap('sample-map', premisesMaps)?.basePath).toBe(
    '/api/premises-maps/sample-map',
  )
})

it('round trips every canonical station URL without collisions or code aliases', () => {
  expect(new Set(stations.map(station => station.slug)).size).toBe(stations.length)
  for (const station of stations) {
    expect(premisesPath(station.id)).toBe(`/premises/${station.slug}`)
    expect(premisesCode(station.slug)).toBe(station.id)
    expect(premisesCode(`mtr-${station.id.toLowerCase()}`)).toBeUndefined()
  }
  expect(() => premisesPath('invalid')).toThrow('Unknown premises code')
})
