import { afterEach, expect, it, vi } from 'vitest'
import { rotatePixels } from '../../workers/asset-service/src/rotation'
afterEach(() => vi.unstubAllGlobals())
it.each([
  [90, [5, 3, 1, 6, 4, 2]],
  [180, [6, 5, 4, 3, 2, 1]],
  [270, [2, 4, 6, 1, 3, 5]],
] as const)(
  'rotates delivery pixels %s degrees without modifying source',
  (angle, expected) => {
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    )
    const source = new ImageData(
      new Uint8ClampedArray([1, 2, 3, 4, 5, 6].flatMap(value => [value, 0, 0, 255])),
      2,
      3,
    )
    const rotated = rotatePixels(source, angle)
    expect(Array.from(rotated.data).filter((_, index) => index % 4 === 0)).toEqual(
      expected,
    )
    expect(source.width).toBe(2)
    expect(source.data[0]).toBe(1)
  },
)
