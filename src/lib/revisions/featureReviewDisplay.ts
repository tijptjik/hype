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
  featureType: 'Feature type',
  kind: 'Feature kind',
  targetContext: 'Intended location',
  associationRelation: 'Location relationship',
  nameTemplate: 'Feature naming rule',
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
  valueJson: 'Details',
}

/**
 * Labels a changed content path without presenting storage identities as field names.
 * @param path Authorized difference path.
 * @param change Optional complete change, retaining labels for removed properties.
 * @returns Human-readable group/field label.
 */
export function featureReviewLabel(
  path: readonly string[],
  change?: RevisionDifference,
): string {
  if (path[0] === 'properties' && path.length === 2 && change) {
    for (const slot of [change.after, change.before]) {
      const entry = slot.present ? object(slot.value) : null
      const definition = object(object(entry?.selection)?.definition)
      const name = translated(definition?.labels)
      if (name) return name
    }
  }
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
  if (change.path[0] === 'properties' && change.path.length === 2) {
    const entry = object(slot.value),
      selection = object(entry?.selection)
    if (selection) {
      const definition = object(selection.definition),
        option = object(definition?.selectedOption)
      const selected =
        translated(option?.translations) ||
        (typeof option?.value === 'string' ? option.value : '')
      const lines: string[] = []
      const multiple = Array.isArray(definition?.selectedOptions)
        ? definition.selectedOptions.map(value => {
            const option = object(value)
            return (
              translated(option?.translations) ||
              (typeof option?.value === 'string' ? option.value : '') ||
              'Selected option (label unavailable)'
            )
          })
        : []
      if (multiple.length) lines.push(multiple.join('; '))
      if (selected) lines.push(selected)
      else if (selection.propertyValueId)
        lines.push('Selected option (label unavailable)')
      if (
        selection.value !== null &&
        selection.value !== undefined &&
        selection.value !== ''
      )
        lines.push(display(selection.value))
      if (
        !multiple.length &&
        selection.valueJson !== null &&
        selection.valueJson !== undefined &&
        selection.valueJson !== ''
      )
        lines.push(`Details: ${display(selection.valueJson)}`)
      for (const [locale, value] of Object.entries(object(entry?.translations) ?? {})) {
        const text = object(value)?.value
        if (text !== null && text !== undefined && text !== '')
          lines.push(`${locale}: ${display(text)}`)
      }
      return lines.join('\n') || 'Not set'
    }
  }
  if (change.path[0] === 'properties' && change.path.at(-1) === 'propertyValueId')
    return slot.value ? 'Selected option changed' : 'Not set'
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

/** Narrow a retained JSON object. @param value Candidate value. @returns Object or null. */
function object(
  value: RevisionValue | undefined,
): Record<string, RevisionValue> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** Read a saved label without consulting mutable or inaccessible catalogues.
 * @param value Retained translation map.
 * @returns Preferred English label, then another nonempty label, or an empty string.
 */
function translated(value: RevisionValue | undefined): string {
  const rows = object(value)
  if (!rows) return ''
  for (const locale of [
    'en',
    ...Object.keys(rows)
      .filter(key => key !== 'en')
      .sort(),
  ]) {
    const label = object(rows[locale])?.value
    if (typeof label === 'string' && label.trim()) return label
  }
  return ''
}
