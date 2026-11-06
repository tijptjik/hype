export type ImageRimBounds = {
  x: number
  y: number
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
}

type Pixel = readonly [number, number, number, number]

/**
 * Measures the largest channel difference, including opacity.
 * @param a - First sampled pixel.
 * @param b - Second sampled pixel.
 * @returns Maximum channel distance.
 */
function distance(a: Pixel, b: Pixel): number {
  return Math.max(...a.map((value, channel) => Math.abs(value - b[channel])))
}

/**
 * Detects narrow blended fringes that settle into a uniform opaque background.
 * @param rgba - Full-resolution, row-major RGBA pixels.
 * @param width - Intrinsic image width.
 * @param height - Intrinsic image height.
 * @returns Non-destructive visible bounds; uncertain edges retain their original pixels.
 * @remarks Crisp borders, transparency, gradients and textured edges are intentionally
 * preserved. Pixel appearance cannot establish whether every possible border is accidental.
 */
export function detectImageRims(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ImageRimBounds {
  const result = { x: 0, y: 0, width, height, sourceWidth: width, sourceHeight: height }
  if (width < 32 || height < 32 || rgba.length !== width * height * 4) return result
  const limit = Math.min(32, Math.floor(Math.min(width, height) * 0.02))
  const samples = 48

  /**
   * Samples one edge parallel to its long axis, excluding corner intersections.
   * @param side - Clockwise edge index: left, top, right, bottom.
   * @param depth - Distance inward from that edge, in source pixels.
   * @returns Evenly spaced edge samples.
   */
  function line(side: number, depth: number): Pixel[] {
    return Array.from({ length: samples }, (_, position) => {
      const along = 0.1 + (0.8 * position) / (samples - 1)
      const x =
        side === 0
          ? depth
          : side === 2
            ? width - 1 - depth
            : Math.round(along * (width - 1))
      const y =
        side === 1
          ? depth
          : side === 3
            ? height - 1 - depth
            : Math.round(along * (height - 1))
      const offset = (y * width + x) * 4
      return [rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]]
    })
  }

  /**
   * Finds a short changing fringe followed by four stable, opaque source lines.
   * @param side - Edge to inspect.
   * @returns Confidently detected fringe depth, or zero.
   */
  function inset(side: number): number {
    const lines = Array.from({ length: limit + 4 }, (_, depth) => line(side, depth))
    // Opacity differences can be intentional padding; never trim transparent margins.
    if (lines.some(row => row.some(pixel => pixel[3] < 250))) return 0
    for (let depth = 2; depth <= limit; depth += 1) {
      const background = lines[depth + 3][Math.floor(samples / 2)]
      const stable = lines
        .slice(depth, depth + 4)
        .every(
          row =>
            row.filter(pixel => distance(pixel, background) <= 3).length >=
            samples * 0.95,
        )
      if (!stable) continue
      const outer = lines[0]
      const strongFringe =
        outer.filter((pixel, i) => {
          const outerDifference = distance(pixel, background)
          return (
            outerDifference >= 24 &&
            lines.slice(1, depth).some(row => {
              const difference = distance(row[i], background)
              return (
                distance(pixel, row[i]) >= 10 &&
                difference >= 6 &&
                difference < outerDifference * 0.8
              )
            })
          )
        }).length >=
        samples * 0.95
      if (strongFringe) return depth
    }
    return 0
  }

  const left = inset(0),
    top = inset(1),
    right = inset(2),
    bottom = inset(3)
  return {
    ...result,
    x: left,
    y: top,
    width: width - left - right,
    height: height - top - bottom,
  }
}
