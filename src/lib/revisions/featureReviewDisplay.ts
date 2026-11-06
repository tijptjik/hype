// TYPES
import type { RevisionValue } from './value'
import type { RevisionDifference } from './diff'

const labels: Record<string, string> = {
  gallery: 'Photo gallery',
  entries: 'Photo',
  order: 'Photo order',
  imageRevisionId: 'Photo version',
  metadata: 'Details',
  presentationMode: 'Image fit',
  rotation: 'Rotation',
  capturedAt: 'Date taken',
  originalWidth: 'Width',
  originalHeight: 'Height',
  credit: 'Credit',
  capture: 'Capture details',
  intent: 'Photo use',
  isPublished: 'Published',
  caption: 'Caption',
  alt: 'Alternative text',
  translations: 'Translations',
  title: 'Name',
  description: 'Description',
  generated: 'Generated',
  profile: 'Profile',
  isIntangible: 'Intangible',
  visitability: 'Visitability',
  isVisitable: 'Visitable',
  asOf: 'As of',
  placement: 'Placement',
  geometry: 'Map position',
  addressMeta: 'Address',
  properties: 'Property',
  selection: 'Selected value',
  propertyValueId: 'Option',
  detachedBrands: 'Brands',
  value: 'Text',
}

/**
 * Labels a changed content path without presenting storage identities as field names.
 * @param path Authorized difference path.
 * @returns Human-readable group/field label.
 */
export function featureReviewLabel(path: readonly string[]): string {
  return path
    .filter(
      (_, index) =>
        !(path[0] === 'gallery' && path[1] === 'entries' && index === 2) &&
        !(path[0] === 'properties' && index === 1),
    )
    .map(part => labels[part] ?? part)
    .join(' · ')
}

/**
 * Formats a reviewed value while retaining explicit empty/absent values and photo order.
 * @param change Authorized pair of differences; both sides share photo numbering.
 * @param side Which inspected value is being shown.
 * @returns Display text, with immutable version identifiers represented by their preview role.
 */
export function featureReviewValue(
  change: RevisionDifference,
  side: 'before' | 'after',
): string {
  const slot = change[side]
  if (!slot.present) return side === 'before' ? 'Not set' : 'Removed'
  if (change.path[0] === 'gallery' && change.path.at(-1) === 'imageRevisionId')
    return side === 'before' ? 'Previous photo version' : 'Proposed photo version'
  if (change.path[0] === 'gallery' && change.path[1] === 'order') {
    const ids = [
      ...new Set(
        [change.before, change.after].flatMap(value =>
          value.present && Array.isArray(value.value) ? value.value.map(String) : [],
        ),
      ),
    ]
    return Array.isArray(slot.value)
      ? slot.value.map(id => `Photo ${ids.indexOf(String(id)) + 1}`).join(' → ') ||
          'No photos'
      : 'No photos'
  }
  return display(slot.value)
}

/** Describe retained fields without exposing image/version storage tokens. @param value Safe authorized value. @returns Readable text. */
function display(value: RevisionValue): string {
  if (value === null) return 'Not set'
  if (value === '') return 'Empty'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(display).join(', ') || 'None'
  if ('value' in value && 'generated' in value) return display(value.value)
  return (
    Object.entries(value)
      .filter(
        ([key]) => !['imageRevisionId', 'assetVersionId', 'definition'].includes(key),
      )
      .map(([key, child]) => `${labels[key] ?? key}: ${display(child)}`)
      .join('\n') || 'None'
  )
}
