// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  addressCandidatePoint,
  nearbyAddressCandidates,
} from '#lib/addresses/nearbyCandidates.js'

const pin = [114.21707, 22.216]

/** Create a reverse candidate whose draft coordinates deliberately retain the pin.
 * @param point Source address geometry, when available.
 * @returns A candidate suitable for distance regression checks.
 */
function candidate(point?: number[]): ReturnType<typeof emptyFeatureAddress> {
  const value = emptyFeatureAddress()
  value.coordinates = [...pin] as [number, number]
  value.source.rawSource = {
    data: {
      attributes: { geometry: point ? { type: 'Point', coordinates: point } : null },
    },
  }
  return value
}

describe('nearby address choices', () => {
  it('measures source geometry, sorts ascending, and preserves the draft pin and input order', () => {
    const near = candidate([114.21657, 22.21564])
    const far = candidate([114.21756, 22.21641])
    const unknown = candidate()
    const input = [far, unknown, near]
    const rows = nearbyAddressCandidates(input, pin)
    expect(rows.map(row => row.candidate)).toEqual([near, far, unknown])
    expect(rows[0].distance).toBeCloseTo(65.2044, 3)
    expect(rows[1].distance).toBeCloseTo(67.9906, 3)
    expect(rows[2].distance).toBeNull()
    expect(input).toEqual([far, unknown, near])
    expect(near.coordinates).toEqual(pin)
  })

  it('recomputes distances for a moved pin and retains zero distance', () => {
    const first = candidate(pin)
    const second = candidate([114.218, 22.216])
    expect(nearbyAddressCandidates([second, first], pin)[0].distance).toBe(0)
    expect(
      nearbyAddressCandidates([first, second], [114.218, 22.216])[0].candidate,
    ).toBe(second)
  })

  it('does not invent distances for absent or invalid coordinates', () => {
    expect(
      nearbyAddressCandidates([candidate([NaN, 22]), candidate()], pin).map(
        row => row.distance,
      ),
    ).toEqual([null, null])
    expect(nearbyAddressCandidates([candidate(pin)], [])[0].distance).toBeNull()
  })
})

it('uses source geometry for markers and refuses to substitute the lookup pin', () => {
  expect(addressCandidatePoint(candidate([114.218, 22.217]))).toEqual([114.218, 22.217])
  expect(addressCandidatePoint(candidate())).toBeNull()
})
