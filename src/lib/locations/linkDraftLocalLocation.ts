// API
import {
  createLocalLocation,
  getFeatureLocation,
  linkFeatureLocation,
  relinkFeatureLocation,
} from '#lib/api/location.remote.js'
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
// TYPES
import type { LocationReview } from '#lib/context/locationCreation.svelte.js'
import type { AccessibilityDraft } from './accessibility'
import type { LocalLocationInput } from './local.js'

export type DraftLocalLocationIntent = {
  featureId: string
  projectId: string
  replacementRevision?: string
  replacementLocationId?: string
  accessibility?: AccessibilityDraft
  nameMode?: 'independent' | 'inherit'
  review?: LocationReview
  input?: LocalLocationInput
  buildingSource?: import('./buildingSource').BuildingSource
  identity?: { locationId: string; revisionId: string }
}

/** Resolve or create the explicitly chosen entity after its Feature is saved.
 * @param intent Retained creation intent, including an identity from an earlier successful creation.
 * @param modifiedAt Current Feature concurrency token. @param retain Persist the created identity before linking.
 * @returns Completion; a failed link can retry without creating another Location.
 * @remarks Never replaces an existing different association or claims a SaanSeoi identity.
 */
export async function linkDraftLocalLocation(
  intent: DraftLocalLocationIntent,
  modifiedAt: string,
  retain: (intent: DraftLocalLocationIntent) => void,
): Promise<void> {
  const query = getFeatureLocation({ featureId: intent.featureId })
  await query.refresh()
  const existing = await query
  if (existing) {
    if (existing.locationId === intent.identity?.locationId) return
    if (
      !intent.replacementRevision &&
      existing.locationId === intent.replacementLocationId
    ) {
      intent = { ...intent, replacementRevision: existing.version }
      retain(intent)
    }
    if (!intent.replacementRevision || existing.version !== intent.replacementRevision)
      throw new Error('Feature already has a different Location')
  }
  if (intent.review) {
    const { saveLocationReview } = await import('./saveLocationReview.js')
    try {
      intent.identity = await saveLocationReview(intent.review, intent.featureId)
    } finally {
      // Even a failed correction must retain an already-created identity for retry.
      retain(intent)
    }
  }
  if (!intent.identity) {
    if (!intent.input) throw new Error('Local Location creation input is required')
    intent = {
      ...intent,
      identity: intent.buildingSource
        ? await importBuildingLocation({
            projectId: intent.projectId,
            source: intent.buildingSource,
            visibility: intent.input.state === 'manual' ? 'exclusive' : 'shared',
            names: intent.input.facts.names,
          })
        : await createLocalLocation({ projectId: intent.projectId, ...intent.input }),
    }
    retain(intent)
  }
  if (!intent.identity) throw new Error('Location identity is required')
  const link = {
    featureId: intent.featureId,
    locationId: intent.identity.locationId,
    revisionId: intent.identity.revisionId,
    expectedFeatureModifiedAt: modifiedAt,
    nameMode: intent.nameMode ?? 'inherit',
  }
  if (existing && intent.replacementRevision) {
    await relinkFeatureLocation({
      ...link,
      expectedRevision: intent.replacementRevision,
    })
  } else await linkFeatureLocation(link)
  await query.refresh()
}
