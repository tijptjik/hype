// API
import {
  createLocalLocation,
  importDraftLocationCandidate,
  importFeatureLocationCandidate,
} from '#lib/api/location.remote.js'
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
import {
  getLocation,
  saveLocalLocationAddress,
} from '#lib/api/locationDirectory.remote.js'
// DOMAIN
import { addressBuildingNames, localIdentityFromAddress } from './addressIdentity.js'
import {
  localAddressContent,
  localAddressDisplayOverrides,
} from '#lib/addresses/locationDraft.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocationReview } from '#lib/context/locationCreation.svelte.js'

/** Persist a reviewed identity, retaining every successful step for safe retries.
 * @param draft Mutable Location review owned by the admin creation flow.
 * @param featureId Saved Feature scope when completing its normal creation flow.
 * @returns The exact identity to link when the Feature is saved.
 * @remarks Provider evidence is imported unchanged; edits use the existing Organisation correction API.
 */
export async function saveLocationReview(
  draft: LocationReview,
  featureId?: string,
): Promise<NonNullable<LocationReview['identity']>> {
  const address: FeatureAddress = JSON.parse(JSON.stringify(draft.address))
  const names = draft.kind === 'building' ? addressBuildingNames(address) : draft.names
  if (!draft.identity) {
    const identity = draft.source
      ? featureId
        ? await importFeatureLocationCandidate({
            featureId,
            ssId: draft.source.ssId,
            resourceReleaseId: draft.source.resourceReleaseId,
          })
        : await importDraftLocationCandidate({
            projectId: draft.projectId,
            ssId: draft.source.ssId,
            resourceReleaseId: draft.source.resourceReleaseId,
          })
      : draft.buildingSource
        ? await importBuildingLocation({
            projectId: draft.projectId,
            source: draft.buildingSource,
            visibility: draft.visibility,
            names,
          })
        : await createLocalLocation({
            projectId: draft.projectId,
            ...localIdentityFromAddress(draft.kind, names, address, draft.visibility),
          })
    draft.identity = {
      locationId: identity.locationId,
      revisionId: identity.revisionId,
    }
  }
  // Imported baselines retain publication evidence; reviewed differences are attributed corrections.
  if (!draft.saved && (draft.source || draft.buildingSource)) {
    const addressChanged =
      JSON.stringify(draft.address) !== JSON.stringify(draft.originalAddress)
    const namesChanged =
      JSON.stringify(draft.names) !== JSON.stringify(draft.originalNames)
    if (addressChanged || namesChanged) {
      const query = getLocation({
        id: draft.identity.locationId,
        organisationId: draft.organisationId,
      })
      await query.refresh()
      const place = await query
      if (!place?.revisionId) throw new Error('Location is unavailable')
      if (draft.expectedOrganisationRevision === undefined)
        draft.expectedOrganisationRevision = place.organisationRevision ?? null
      const result = await saveLocalLocationAddress({
        locationId: draft.identity.locationId,
        expectedRevisionId: draft.identity.revisionId,
        organisationId: draft.organisationId,
        expectedOrganisationRevision: draft.expectedOrganisationRevision,
        ...(namesChanged ? { names } : {}),
        ...(addressChanged
          ? {
              address: localAddressContent(address),
              displayOverrides: localAddressDisplayOverrides(address),
              coordinates: address.coordinates ?? undefined,
              divisionOverrides: draft.address.divisionOverrides,
            }
          : {}),
      })
      draft.identity = {
        locationId: draft.identity.locationId,
        revisionId: result.revisionId,
      }
    }
  }
  draft.saved = true
  return draft.identity
}
