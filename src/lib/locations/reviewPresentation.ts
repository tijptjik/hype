// TYPES
import type { LocationPosition } from './model'
import type { HeaderButtonActionConfig } from '#lib/bits/patterns/layout/header/index.js'

export type LocationReviewPresentation = {
  before: LocationPosition | null
  after: LocationPosition | null
}
export type LocationReviewActions = (actions: HeaderButtonActionConfig[]) => void

/** Measure a straight-line displacement on a sphere for the review map, in metres.
 * @param before Accepted longitude/latitude. @param after Proposed longitude/latitude.
 * @returns Great-circle distance; this is not a walking route.
 */
export function locationMoveDistance(before: number[], after: number[]): number {
  const radians = Math.PI / 180
  const lat = (after[1] - before[1]) * radians,
    lng = (after[0] - before[0]) * radians
  const a =
    Math.sin(lat / 2) ** 2 +
    Math.cos(before[1] * radians) *
      Math.cos(after[1] * radians) *
      Math.sin(lng / 2) ** 2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}
