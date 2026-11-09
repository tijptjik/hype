// API
import { getFeatureLocation } from '#lib/api/location.remote.js'
import {
  getLocationAccessibility,
  updateLocationAccessibility,
} from '#lib/api/locationAccessibility.remote.js'
// DOMAIN
import { AccessibilityDraftSchema, UNKNOWN_ACCESSIBILITY } from './accessibility'
// TYPES
import type { AccessibilityDraft } from './accessibility'

/** Contribute explicitly entered draft fields after a Feature has its persisted Location.
 * @param featureId Successfully saved and linked Feature. @param raw Retained user-entered fields.
 * @returns Completion after publishing, or a no-op for an empty/already applied draft.
 * @remarks Never replaces existing different known answers unseen in the new-Feature preview.
 * Failures retain the caller's retry intent; existing APIs enforce authorization and revision fences.
 */
export async function saveDraftAccessibility(
  featureId: string,
  raw?: AccessibilityDraft,
): Promise<void> {
  const draft = AccessibilityDraftSchema.parse(raw ?? {})
  if (!Object.keys(draft).length) return
  const associationQuery = getFeatureLocation({ featureId })
  await associationQuery.refresh()
  const association = await associationQuery
  if (!association) throw new Error('ACCESSIBILITY_LOCATION_REQUIRED')
  const query = getLocationAccessibility({ locationId: association.locationId })
  await query.refresh()
  const view = await query
  if (!view) throw new Error('ACCESSIBILITY_LOCATION_REQUIRED')
  if (view.record?.stale) throw new Error('ACCESSIBILITY_REVIEW_REQUIRED')
  const current = view.record?.values ?? UNKNOWN_ACCESSIBILITY
  const entries = Object.entries(draft) as [keyof AccessibilityDraft, string][]
  if (
    entries.some(
      ([field, value]) => current[field] !== 'unknown' && current[field] !== value,
    )
  )
    throw new Error('ACCESSIBILITY_REVIEW_REQUIRED')
  if (
    !view.record?.stale &&
    entries.every(([field, value]) => current[field] === value)
  )
    return
  await updateLocationAccessibility({
    locationId: association.locationId,
    expectedId:
      'observationId' in view
        ? (view.observationId ?? null)
        : (view.record?.id ?? null),
    expectedLocationRevisionId: view.locationRevisionId,
    values: { ...current, ...draft },
  })
}
