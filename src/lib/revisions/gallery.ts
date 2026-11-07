// TYPES
import type { RevisionValue } from './merge'

/** A feature-local gallery entry pins metadata and bytes through an image revision. */
export type RevisionGalleryEntry = {
  imageRevisionId: string
  intent: string
  caption: Record<string, string>
  alt: Record<string, string>
}

/** Keyed entries enable identity-based comparisons; ordering is reviewed independently. */
export type RevisionGallery = {
  entries: Record<string, RevisionGalleryEntry>
  order: string[]
  sortMode?: 'automatic' | 'manual'
}

/**
 * Checks gallery consistency after three-way merging and before publication.
 * @param gallery Candidate gallery content.
 * @returns Validation errors; an empty list means structural consistency only.
 * @remarks Asset ownership, moderation, delivery access, permitted intent values and
 * image-revision identity references require authoritative database validation.
 */
export function validateRevisionGallery(gallery: RevisionGallery): string[] {
  const errors: string[] = []
  const ids = Object.keys(gallery.entries)
  const ordered = new Set(gallery.order)
  if (ordered.size !== gallery.order.length)
    errors.push('Gallery order contains duplicate images')
  if (
    ids.length !== ordered.size ||
    ids.some(id => !ordered.has(id)) ||
    gallery.order.some(id => !Object.hasOwn(gallery.entries, id))
  ) {
    errors.push('Gallery order must contain every entry exactly once')
  }
  if (ids.some(id => !id.trim() || !gallery.entries[id].imageRevisionId.trim())) {
    errors.push('Gallery entries require image and image revision identifiers')
  }
  if (
    Object.values(gallery.entries).filter(entry => entry.intent === 'canonical')
      .length > 1
  ) {
    errors.push('A gallery may have at most one canonical image')
  }
  return errors
}

/**
 * Creates an isolated JSON representation for the shared revision merge engine.
 * @param gallery Validated gallery snapshot.
 * @returns Serializable gallery content with stable entry IDs and explicit order.
 */
export function galleryRevisionValue(gallery: RevisionGallery): RevisionValue {
  const errors = validateRevisionGallery(gallery)
  if (errors.length) throw new Error(errors.join('; '))
  return structuredClone(gallery)
}
