/** Immutable dependency snapshot captured for an identity merge review. */
export type LocationMergeImpact = {
  version: 1
  token: string
  relationshipVersions: number
  transitionVersions: number
  correctionVersions: number
  acceptedPlacements: number
  blockers: string[]
}
