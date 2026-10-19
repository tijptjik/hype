// ROUTING
import {
  MTR_MAX_WALKING_METRES,
  MTR_POLICY_VERSION,
} from '../../../src/lib/routing/mtr'
// POLICY
import policy from '../donor-mtr-decisions.json'

type ReviewedMtr = {
  mtrStation: string | null
  mtrExit: string | null
  mtrDistance: number | null
  mtrResolution: {
    status: string
    calculatedAt: string
    catalogVersion: string
    graphVersion: string
    candidatesChecked: number
    policyVersion: string
    maxWalkingMetres: number
    review: {
      policy: string
      sourceId: string
      choice: string
      exitLabel: string
      revision: string
      exportSha256: string
      coordinates: number[]
      unresolved?: string
    }
  }
}

/**
 * Builds accepted MTR fields from a source-bound review decision.
 * @param sourceId - Breadline donor identity.
 * @param sourceHash - Current source row hash.
 * @param coordinates - Current imported point.
 * @returns Accepted fields, or null for donors outside the reviewed set.
 * @remarks Unmapped accepted labels remain explicit in provenance with no invented distance.
 */
export function reviewedDonorMtr(
  sourceId: string,
  sourceHash: string,
  coordinates: number[],
): ReviewedMtr | null {
  const decision = policy.decisions.find(row => row.sourceId === sourceId)
  if (!decision) return null
  if (
    decision.sourceHash !== sourceHash ||
    JSON.stringify(decision.coordinates) !== JSON.stringify(coordinates)
  ) {
    throw new Error(`MTR review source changed for donor:${sourceId}`)
  }
  // Keep the reviewed choice as provenance even when the walking policy excludes it.
  const exceedsLimit =
    decision.distance !== null && decision.distance > MTR_MAX_WALKING_METRES
  return {
    mtrStation: exceedsLimit ? null : decision.station,
    mtrExit: exceedsLimit ? null : decision.entranceId,
    mtrDistance: exceedsLimit ? null : decision.distance,
    mtrResolution: {
      status: exceedsLimit
        ? 'unreachable'
        : decision.entranceId
          ? 'ready'
          : 'unsupported',
      calculatedAt: decision.reviewedAt,
      catalogVersion: policy.catalogVersion,
      graphVersion: decision.graphVersion,
      candidatesChecked: 0,
      policyVersion: MTR_POLICY_VERSION,
      maxWalkingMetres: MTR_MAX_WALKING_METRES,
      review: {
        policy: 'breadline-donor-v1',
        sourceId,
        choice: decision.choice,
        exitLabel: decision.exitLabel,
        revision: decision.reviewRevision,
        exportSha256: policy.exportSha256,
        coordinates: decision.coordinates,
        ...(exceedsLimit
          ? { unresolved: 'walking_distance_exceeds_limit' }
          : decision.entranceId
            ? {}
            : { unresolved: 'accepted_exit_not_mapped' }),
      },
    },
  }
}
