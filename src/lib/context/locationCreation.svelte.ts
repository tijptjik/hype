// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import type { BuildingSource } from '#lib/locations/buildingSource.js'
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'

export type LocationReview = {
  projectId: string
  organisationId: string
  source?: { ssId: string; resourceReleaseId: string }
  originalAddress: FeatureAddress
  originalNames: Record<string, string>
  saved?: boolean
  expectedOrganisationRevision?: string | null
  address: FeatureAddress
  names: Record<string, string>
  kind: Parameters<typeof localIdentityFromAddress>[0]
  visibility: 'shared' | 'exclusive'
  buildingSource?: BuildingSource
  accessibility?: AccessibilityDraft
  identity?: { locationId: string; revisionId: string }
}

export type LocationCreationDraft = LocationReview & {
  accountId: string
  checkpoint: object
}

/** Admin-layout-owned handoff; never shared between server requests or accounts. */
export class LocationCreation {
  current = $state<LocationCreationDraft | null>(null)
  pending = $state(false)

  /** Capture an independent draft before leaving the Feature form.
   * @param draft Feature checkpoint and Location values. @returns Nothing.
   */
  open(draft: LocationCreationDraft): void {
    this.current = JSON.parse(JSON.stringify(draft))
    this.pending = true
  }

  /** Discard a completed or reset creation flow. @returns Nothing. */
  clear(): void {
    this.current = null
    this.pending = false
  }
}
