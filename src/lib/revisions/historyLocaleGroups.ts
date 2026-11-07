// TYPES
import type { RevisionDifference } from './diff'
import type { RevisionSlot, RevisionValue } from './value'

export type HistoryLocaleGroup = {
  path: string[]
  rows: { locale: string | null; change: RevisionDifference }[]
}

/** Finds locale positions only within known translated content structures.
 * @param path Recorded field path, including opaque entity identities.
 * @returns Locale index, or -1 for ordinary fields.
 */
function localeIndex(path: readonly string[]): number {
  // Entity IDs remain part of the key even when their spelling resembles a locale.
  if (['i18n', 'translations'].includes(path[0])) return path.length > 1 ? 1 : -1
  if (path[0] === 'properties' && path[2] === 'translations')
    return path.length > 3 ? 3 : -1
  if (
    path[0] === 'gallery' &&
    path[1] === 'entries' &&
    ['caption', 'alt'].includes(path[3])
  )
    return path.length > 4 ? 4 : -1
  if (path[1] === 'i18n') return path.length > 2 ? 2 : -1
  if (path[1] === 'values' && path[3] === 'i18n') return path.length > 4 ? 4 : -1
  return -1
}

/** Splits added/removed locale maps just as existing translated fields are split.
 * @param change Original authorized difference.
 * @returns Field differences preserving missing, null and empty values.
 */
function expandLocaleMap(change: RevisionDifference): RevisionDifference[] {
  const { path } = change
  const index = localeIndex([...path, '__locale__'])
  const atMap = index === path.length
  const atLocale =
    localeIndex(path) === path.length - 1 &&
    ['i18n', 'translations'].includes(path[path.length - 2])
  if (!atMap && !atLocale) return [change]
  const object = (slot: RevisionSlot): Record<string, RevisionValue> | null =>
    slot.present &&
    slot.value !== null &&
    typeof slot.value === 'object' &&
    !Array.isArray(slot.value)
      ? slot.value
      : null
  const before = object(change.before),
    after = object(change.after)
  if (!before && !after) return [change]
  // A scalar/null replacement remains explicit rather than being interpreted as absence.
  if ((change.before.present && !before) || (change.after.present && !after))
    return [change]
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  if (!keys.length) return [change]
  return keys.flatMap(key =>
    expandLocaleMap({
      path: [...path, key],
      before:
        before && Object.hasOwn(before, key)
          ? { present: true, value: before[key] }
          : { present: false },
      after:
        after && Object.hasOwn(after, key)
          ? { present: true, value: after[key] }
          : { present: false },
    }),
  )
}

/** Combines translated changes of the same field while preserving original evidence.
 * @param changes Authorized differences in display order.
 * @returns Ordered field groups with a separate row per changed locale.
 * @remarks Full paths retain photo, property and option identities. This presentation
 * grouping never changes persisted history or introduces untranslated/private values.
 */
export function groupHistoryLocales(
  changes: readonly RevisionDifference[],
): HistoryLocaleGroup[] {
  const groups: HistoryLocaleGroup[] = []
  const localized = new Map<string, HistoryLocaleGroup>()
  for (const change of changes.flatMap(expandLocaleMap)) {
    const index = localeIndex(change.path)
    if (index < 0) {
      groups.push({ path: change.path, rows: [{ locale: null, change }] })
      continue
    }
    const path = change.path.filter((_, position) => position !== index)
    const key = JSON.stringify([index, path])
    let group = localized.get(key)
    if (!group) {
      group = { path, rows: [] }
      localized.set(key, group)
      groups.push(group)
    }
    group.rows.push({ locale: change.path[index], change })
  }
  return groups
}

/** Describes a field operation across its changed languages.
 * @param group One displayed field with original before/after evidence.
 * @returns Shared action, or Updated when locale operations differ.
 */
export function localeGroupAction(
  group: HistoryLocaleGroup,
): 'Added' | 'Removed' | 'Updated' {
  if (group.rows.every(({ change }) => !change.before.present)) return 'Added'
  if (group.rows.every(({ change }) => !change.after.present)) return 'Removed'
  return 'Updated'
}
