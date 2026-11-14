import { expect, it } from 'vitest'
import {
  brandLocationBounds,
  hasMapCoordinates,
} from '../lib/locations/brandLocationMap'
it('rejects missing and invalid positions without rejecting real zero coordinates', () => {
  for (const value of [
    null,
    undefined,
    [],
    [181, 22],
    [114, 91],
    [NaN, 22],
    ['114', 22],
  ])
    expect(hasMapCoordinates(value)).toBe(false)
  expect(hasMapCoordinates([0, 0])).toBe(true)
})
it('fits every mapped result and handles empty and singleton results', () => {
  const first = {
    id: 'a',
    name: 'A',
    coordinates: [114.1, 22.2] as [number, number],
    hype: true,
    upstream: false,
    linked: false,
  }
  const second = { ...first, id: 'b', coordinates: [114.3, 22.5] as [number, number] }
  expect(brandLocationBounds([])).toBeNull()
  expect(brandLocationBounds([first])).toEqual([
    [114.1, 22.2],
    [114.1, 22.2],
  ])
  expect(brandLocationBounds([second, first])).toEqual([
    [114.1, 22.2],
    [114.3, 22.5],
  ])
})
