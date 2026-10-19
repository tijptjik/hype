// TEST
import { describe, expect, test } from 'bun:test'
// POLICY
import policy from './donor-mtr-decisions.json'
import { reviewedDonorMtr } from './lib/donor-mtr-decisions'

describe('reviewed donor MTR import', () => {
  test('records every reviewed choice, including explicit D1 and unmapped references', () => {
    expect(policy.decisions).toHaveLength(64)
    for (const row of policy.decisions) {
      const result = reviewedDonorMtr(row.sourceId, row.sourceHash, row.coordinates)!
      expect(result.mtrResolution.review.exitLabel).toBe(row.exitLabel)
      expect(result.mtrExit === null).toBe(result.mtrDistance === null)
    }
    const correction = policy.decisions.find(row => row.sourceId === '6')!
    expect(correction.exitLabel).toBe('D1')
    expect(correction.entranceId).toBe('osm:n5921970336')
    expect(correction.distance).toBe(357)
    expect(
      policy.decisions.filter(row => row.entranceId === null).map(row => row.sourceId),
    ).toEqual(['558', '727'])
  })
  test('retains reviewed provenance but clears access beyond the walking limit', () => {
    const row = policy.decisions.find(row => row.distance !== null)!
    const distance = row.distance
    try {
      row.distance = 1001
      const result = reviewedDonorMtr(row.sourceId, row.sourceHash, row.coordinates)!
      expect([result.mtrStation, result.mtrExit, result.mtrDistance]).toEqual([
        null,
        null,
        null,
      ])
      expect(result.mtrResolution.status).toBe('unreachable')
      expect(result.mtrResolution.review.exitLabel).toBe(row.exitLabel)
      expect(result.mtrResolution.review.unresolved).toBe(
        'walking_distance_exceeds_limit',
      )
    } finally {
      row.distance = distance
    }
  })
  test('refuses stale source and changed coordinates', () => {
    const row = policy.decisions[0]
    expect(() => reviewedDonorMtr(row.sourceId, 'changed', row.coordinates)).toThrow(
      'source changed',
    )
    expect(() => reviewedDonorMtr(row.sourceId, row.sourceHash, [114, 22])).toThrow(
      'source changed',
    )
  })
  test('leaves unreviewed donors to automatic routing', () => {
    expect(reviewedDonorMtr('89', 'irrelevant', [114, 22])).toBeNull()
  })
})
