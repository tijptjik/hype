import { expect, test } from 'bun:test'
import { shopImagePlacement } from '../lib/indoor/artwork'

test('logos keep uniform orthogonal axes under rotated and tilted placements', () => {
  for (const source of [
    'matrix(120 0 0 40 10 20)',
    'matrix(80 60 -30 40 10 20)',
    'matrix(80 60 15 30 10 20)',
  ]) {
    for (const aspect of [0.4, 1, 3, NaN]) {
      const placed = shopImagePlacement(source, aspect)!
      const [a, b, c, d, e, f] = placed.transform.slice(7, -1).split(' ').map(Number)
      expect(Math.hypot(a, b)).toBeCloseTo(Math.hypot(c, d), 10)
      expect(a * c + b * d).toBeCloseTo(0, 10)
      const [sa, sb, sc, sd, se, sf] = source.slice(7, -1).split(' ').map(Number)
      expect(e + (a * placed.width + c) / 2).toBeCloseTo(se + (sa + sc) / 2, 10)
      expect(f + (b * placed.width + d) / 2).toBeCloseTo(sf + (sb + sd) / 2, 10)
    }
  }
})

test('empty and collapsed placements do not render an image at the origin', () => {
  expect(shopImagePlacement('')).toBeNull()
  expect(shopImagePlacement('matrix(10 0 0 0 0 0)')).toBeNull()
})

test('floor-flat logos preserve pitch compression and screen-down orientation', () => {
  const placed = shopImagePlacement('matrix(120 0 0 20 10 30)', 3, true)!
  expect(placed.width).toBe(3)
  expect(placed.height).toBe(1)
  expect(placed.transform).toBe('matrix(40 0 0 20 10 30)')
  expect(shopImagePlacement('matrix(120 0 0 0 10 30)', 3, true)).toBeNull()
})
