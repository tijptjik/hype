// POLICY
import policy from '../donor-mtr-decisions.json'

type ReviewedMtr = {
  mtrStation: string
  mtrExit: string | null
  mtrDistance: number | null
  mtrResolution: {
    status: string
    calculatedAt: string
    catalogVersion: string
    graphVersion: string
    candidatesChecked: number
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
  return {
    mtrStation: decision.station,
    mtrExit: decision.entranceId,
    mtrDistance: decision.distance,
    mtrResolution: {
      status: decision.entranceId ? 'ready' : 'unsupported',
      calculatedAt: decision.reviewedAt,
      catalogVersion: policy.catalogVersion,
      graphVersion: decision.graphVersion,
      candidatesChecked: 0,
      review: {
        policy: 'breadline-donor-v1',
        sourceId,
        choice: decision.choice,
        exitLabel: decision.exitLabel,
        revision: decision.reviewRevision,
        exportSha256: policy.exportSha256,
        coordinates: decision.coordinates,
        ...(decision.entranceId ? {} : { unresolved: 'accepted_exit_not_mapped' }),
      },
    },
  }
}
