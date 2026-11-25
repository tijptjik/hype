// DOMAIN
import { bounds, type IndoorFeature } from '../indoor/model'
import type { MapPoint } from './recorder'

/** Express an interior placement as percentages of its immutable polygon bounds.
 * @param feature Unit, or the floor when there is no unit.
 * @param point Position in the published drawing's coordinates.
 * @param pixels Whether Y grows downwards in the source drawing.
 * @returns Percent across and up from the lower-left corner.
 */
export function polygonPercent(
  feature: IndoorFeature,
  point: MapPoint,
  pixels: boolean,
): MapPoint {
  const [left, low, right, high] = bounds(feature)
  return [
    (100 * (point[0] - left)) / (right - left),
    (100 * (pixels ? high - point[1] : point[1] - low)) / (high - low),
  ]
}
