// VALIDATION
import { z } from 'zod'
// DOMAIN
import { locationDistance } from '#lib/locations/searchPresentation.js'
// TYPES
import type { FeatureAddress } from './featureAddress.js'

const sourcePointSchema = z.object({
  attributes: z.object({
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z.tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ]),
    }),
  }),
})

/** Read an address result's own geometry, never the echoed lookup pin.
 * @param candidate Geocoded address. @returns Valid source coordinates or null.
 */
export function addressCandidatePoint(
  candidate: FeatureAddress,
): [number, number] | null {
  const source = sourcePointSchema.safeParse(candidate.source.rawSource.data)
  return source.success ? source.data.attributes.geometry.coordinates : null
}

/** Rank address choices by straight-line distance from the current Feature pin.
 * @param candidates Canonical address choices with retained source geometry.
 * @param pin Current Feature longitude/latitude.
 * @returns Nearest-first choices, with unavailable distances last.
 * @remarks Reverse geocoding preserves the Feature pin in candidate.coordinates;
 * only the retained address geometry can measure the actual separation.
 */
export function nearbyAddressCandidates(
  candidates: readonly FeatureAddress[],
  pin: number[],
): { candidate: FeatureAddress; distance: number | null }[] {
  const validPin =
    pin.length >= 2 &&
    Number.isFinite(pin[0]) &&
    Number.isFinite(pin[1]) &&
    Math.abs(pin[0]) <= 180 &&
    Math.abs(pin[1]) <= 90
  // Measure against source points without moving the draft or mutating provider order.
  return candidates
    .map(candidate => {
      const point = addressCandidatePoint(candidate)
      return {
        candidate,
        distance: validPin && point ? locationDistance(pin, point) : null,
      }
    })
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
}
