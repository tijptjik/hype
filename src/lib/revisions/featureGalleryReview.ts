// DOMAIN
import { equalRevisionValue } from './merge'
// TYPES
import type { FeatureRevisionContent } from './featureContent'

/**
 * Limits gallery proposals to existing Feature-owned images and exact same-image pins.
 * @param previous Accepted comparison content.
 * @param result Proposed or merged complete content.
 * @param attachments Server-resolved exact upload pins authorized for this proposal.
 * @returns Safe errors; image ownership, moderation and revision references are checked at projection.
 * @remarks New uploads need an attachment grant from their upload/task workflow.
 */
export function validateFeatureGalleryResult(previous: FeatureRevisionContent, result: FeatureRevisionContent, attachments: ReadonlyMap<string, string> = new Map()): string[] {
  if (!equalRevisionValue(previous, { ...result, gallery: previous.gallery }))
    return ['Gallery proposals cannot change other Feature content']
  if (Object.entries(result.gallery.entries).some(([id, entry]) => !Object.hasOwn(previous.gallery.entries, id) && attachments.get(id) !== entry.imageRevisionId))
    return ['New photos require a reviewed upload attachment']
  return []
}
