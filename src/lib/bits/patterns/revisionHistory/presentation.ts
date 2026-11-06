// TYPES
import type { RevisionDifference } from '#lib/revisions/diff.js'

const labels: Record<string, string> = {
  record: 'Settings',
  i18n: 'Translations',
  userPolicy: 'User policy',
  properties: 'Properties',
  en: 'English',
  'zh-Hant': 'Traditional Chinese',
  'zh-Hans': 'Simplified Chinese',
  zhHant: 'Traditional Chinese',
  zhHans: 'Simplified Chinese',
  name: 'Name',
  description: 'Description',
  isPublished: 'Published',
  isArchived: 'Archived',
  hubId: 'Hub',
}

/** Presents stored paths without hiding their locale or scope.
 * @param path Immutable field path.
 * @returns Readable breadcrumb, retaining unknown identifiers.
 */
export function fieldLabel(path: readonly string[]): string {
  return (
    path
      .map(
        part =>
          labels[part] ??
          part
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/^./, value => value.toUpperCase()),
      )
      .join(' / ') || 'Organisation'
  )
}

/** Formats a compact code path relative to its history group.
 * @param path Immutable path segments below the group heading.
 * @returns Colon-separated labels with option identities omitted from the visible path.
 * @remarks Only the identity immediately after `values` is hidden; the full stored
 * path remains available on the rendered code block for inspection.
 */
export function historyPathLabel(path: readonly string[]): string {
  return (
    path
      .filter((_, index) => index === 0 || path[index - 1] !== 'values')
      .map((part, index, parts) =>
        part === 'i18n'
          ? 'i18n'
          : parts[index - 1] === 'i18n'
            ? part.replace(/^./, value => value.toUpperCase())
            : fieldLabel([part]),
      )
      .join(' : ') || 'Value'
  )
}

/** Distinguishes additions and removals from edits without conflating null and absence.
 * @param change Before and after evidence.
 * @returns Short change category.
 */
export function changeKind(
  change: RevisionDifference,
): 'Added' | 'Removed' | 'Updated' {
  return !change.before.present
    ? 'Added'
    : !change.after.present
      ? 'Removed'
      : 'Updated'
}

const operationLabels = {
  value: { Added: 'New value', Updated: 'Updated value', Removed: 'Removed value' },
  translation: {
    Added: 'New translation',
    Updated: 'Updated translation',
    Removed: 'Removed translation',
  },
  field: { Added: 'New field', Updated: 'Updated field', Removed: 'Removed field' },
  order: {
    Added: 'Set value order',
    Updated: 'Reordered value',
    Removed: 'Removed value order',
  },
} as const

// Match catalogue structure explicitly; opaque identifier spelling is not evidence of an operation.
const operationPaths = [
  { path: [], entity: 'field' },
  { path: ['values', '*'], entity: 'value' },
  { path: ['values', '*', 'record', 'rank'], entity: 'order' },
  { path: ['values', '*', 'i18n', '*'], entity: 'translation' },
  { path: ['i18n', '*'], entity: 'translation' },
] as const

/** Identifies resource and catalogue operations from structural paths and before/after presence.
 * @param change Immutable difference, retaining explicit absence separately from null.
 * @param catalogue Whether the path starts with a catalogue field identity.
 * @returns An operation label and whether the operation names the entire changed entity.
 * @remarks Nested option edits never imply that the option itself was added or removed.
 */
export function historyOperation(
  change: RevisionDifference,
  catalogue: boolean,
): { label: string; wholeEntity: boolean } {
  const kind = changeKind(change)
  if (!catalogue) {
    const path = change.path
    // Locale field positions are structural; a property ID named "title" is opaque.
    const localizedField =
      path[0] === 'i18n' || path[0] === 'translations' ? path[2] : undefined
    const field =
      localizedField &&
      ['name', 'nameShort', 'title', 'description'].includes(localizedField)
        ? localizedField
        : undefined
    const noun = field
      ? ({ title: 'name', nameShort: 'short name', alt: 'alternative text' }[field] ??
        field)
      : path[0] === 'gallery'
        ? 'photo'
        : path[0] === 'properties'
          ? 'value'
          : path[0] === 'translations' || path[0] === 'i18n'
            ? 'translation'
            : null
    if (noun)
      return {
        label: `${kind === 'Added' ? 'New' : kind === 'Updated' ? 'Updated' : 'Removed'} ${noun}`,
        wholeEntity: false,
      }
    const state = path.at(-1)
    if (change.after.present && typeof change.after.value === 'boolean') {
      if (state === 'isPublished')
        return {
          label: change.after.value ? 'Published' : 'Unpublished',
          wholeEntity: false,
        }
      if (state === 'isArchived')
        return {
          label: change.after.value ? 'Archived' : 'Restored',
          wholeEntity: false,
        }
    }
    return { label: kind, wholeEntity: false }
  }
  const path = change.path.slice(1)
  const rule = operationPaths.find(
    rule =>
      rule.path.length === path.length &&
      rule.path.every((part, index) => part === '*' || part === path[index]),
  )
  if (rule)
    return {
      label: operationLabels[rule.entity][kind],
      wholeEntity: rule.entity === 'field' || rule.entity === 'value',
    }
  return {
    label: path[0] === 'values' && path.length > 2 ? 'Updated value' : 'Updated field',
    wholeEntity: false,
  }
}

export type HistoryGroup = {
  key: string
  label: string
  fields: { label: string | null; operation: string; change: RevisionDifference }[]
}

/** Groups shared path prefixes so each scope and language is named only once.
 * @param changes Immutable comparison evidence in server order.
 * @param fieldLabels Optional property identity labels retained with catalogue evidence.
 * @returns Ordered groups with field labels relative to their heading.
 */
export function groupChanges(
  changes: readonly RevisionDifference[],
  fieldLabels?: Record<string, string>,
): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>()
  for (const change of changes) {
    const depth = change.path[0] === 'i18n' && change.path.length > 2 ? 2 : 1
    const prefix = change.path.slice(0, depth)
    const key = JSON.stringify(prefix)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label:
          fieldLabels?.[prefix[0]] ??
          (prefix[0] === 'i18n' && prefix[1]
            ? fieldLabel([prefix[1]])
            : fieldLabel(prefix)),
        fields: [],
      }
      groups.set(key, group)
    }
    const operation = historyOperation(change, fieldLabels !== undefined)
    group.fields.push({
      label: operation.wholeEntity ? null : historyPathLabel(change.path.slice(depth)),
      operation: operation.label,
      change,
    })
  }
  return [...groups.values()]
}
