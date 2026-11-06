// TESTS
import { describe, expect, it } from 'vitest'
// IMAGES
import { detectImageRims } from '#lib/images/rims.js'

/**
 * Builds small, deterministic full-resolution edge fixtures.
 * @param pixel - RGBA generator for each source position.
 * @returns Pixel buffer for a 256px square source.
 */
function fixture(pixel: (x: number, y: number) => number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let y = 0; y < 256; y += 1)
    for (let x = 0; x < 256; x += 1) data.set(pixel(x, y), (y * 256 + x) * 4)
  return data
}

describe('conservative export rim detection', () => {
  it('clips a blended fringe only on its affected edges', () => {
    const shades = [160, 100, 55]
    const pixels = fixture((x, y) => {
      const depth = Math.min(x, y)
      return depth < 3 ? [shades[depth], shades[depth], 220, 255] : [50, 50, 220, 255]
    })
    expect(detectImageRims(pixels, 256, 256)).toMatchObject({
      x: 3,
      y: 3,
      width: 253,
      height: 253,
    })
  })

  it.each(['solid', 'crisp-border', 'transparent-margin', 'gradient', 'texture'])(
    'preserves ambiguous or intentional %s edges',
    kind => {
      const pixels = fixture((x, y) => {
        if (kind === 'crisp-border' && Math.min(x, y, 255 - x, 255 - y) < 3)
          return [255, 255, 255, 255]
        if (kind === 'transparent-margin' && Math.min(x, y, 255 - x, 255 - y) < 4)
          return [0, 0, 0, 0]
        if (kind === 'gradient') return [x, x, x, 255]
        if (kind === 'texture') return [(x * 13 + y * 37) % 256, y, x, 255]
        return [50, 50, 220, 255]
      })
      expect(detectImageRims(pixels, 256, 256)).toMatchObject({
        x: 0,
        y: 0,
        width: 256,
        height: 256,
      })
    },
  )

  it('does not treat a broad frame as a thin export fringe', () => {
    const pixels = fixture((x, y) => {
      const depth = Math.min(x, y, 255 - x, 255 - y)
      return depth < 12
        ? [180 - depth * 5, 180 - depth * 5, 240, 255]
        : [50, 50, 220, 255]
    })
    expect(detectImageRims(pixels, 256, 256)).toMatchObject({
      x: 0,
      y: 0,
      width: 256,
      height: 256,
    })
  })
})
