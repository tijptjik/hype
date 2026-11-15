// TYPES
import type { Place } from './model'
export type ShopArtwork = {
  src: string
  aspect: number
  padding: number
  background: string
}
/** Resolve current database-backed brand artwork for a physical unit. @param place Hydrated place. @returns Approved artwork or null. */
export function shopArtwork(place?: Place): ShopArtwork | null {
  return place?.artwork ?? null
}

/** Fit an image inside a projected logo rectangle, optionally retaining floor foreshortening.
 * @param transform Placement matrix for a unit square.
 * @param aspect Catalogue width/height hint; intrinsic image proportions remain authoritative.
 * @param retainProjection Whether to preserve the floor transform after fitting intrinsic artwork.
 * @returns Image viewport and placement transform, or null when there is no usable placement.
 * @remarks Use SVG xMidYMid meet with this viewport, including when dimensions are unknown.
 */
export function shopImagePlacement(
  transform: string,
  aspect = 1,
  retainProjection = false,
): { width: number; height: number; transform: string } | null {
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform)?.[1].split(/[ ,]+/).map(Number)
  if (!matrix || matrix.length !== 6 || !matrix.every(Number.isFinite)) return null
  const [a, b, c, d, e, f] = matrix
  const width = Math.hypot(a, b)
  if (!width) return null
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  // Perpendicular height excludes the shear introduced by a tilted floor projection.
  const height = Math.abs(a * d - b * c) / width
  // Floor-flat marks retain perspective compression instead of being fitted into an upright viewport.
  if (retainProjection && height > 0)
    return {
      width: ratio,
      height: 1,
      transform: `matrix(${a / ratio} ${b / ratio} ${c} ${d} ${e} ${f})`,
    }
  const scale = Math.min(width / ratio, height)
  if (!(scale > 0)) return null
  const x = (a / width) * scale,
    y = (b / width) * scale
  const cx = e + (a + c) / 2,
    cy = f + (b + d) / 2
  return {
    width: ratio,
    height: 1,
    transform: `matrix(${x} ${y} ${-y} ${x} ${cx - (x * ratio - y) / 2} ${cy - (y * ratio + x) / 2})`,
  }
}
