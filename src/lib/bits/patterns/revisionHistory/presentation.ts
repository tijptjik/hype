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

/** Distinguishes additions and removals from edits without conflating null and absence.
 * @param change Before and after evidence.
 * @returns Short change category.
 */
export function changeKind(change: RevisionDifference): string {
  return !change.before.present
    ? 'Added'
    : !change.after.present
      ? 'Removed'
      : 'Updated'
}

export type HistoryGroup = {
  key: string
  label: string
  fields: { label: string; change: RevisionDifference }[]
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
    group.fields.push({ label: fieldLabel(change.path.slice(depth)), change })
  }
  return [...groups.values()]
}
