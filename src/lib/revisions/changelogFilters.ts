// TYPES
import type { ChangelogEntry, ChangelogFilters } from './changelog'

export const changelogActions = [
  { value: 'created', label: 'New records' },
  { value: 'updated', label: 'Updates' },
  { value: 'added', label: 'Additions' },
  { value: 'removed', label: 'Removals' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
  { value: 'archived', label: 'Archived' },
  { value: 'restored', label: 'Restored' },
  { value: 'baseline', label: 'Initial snapshots' },
] as const

/** Classify only visible evidence, with snapshot and publication receipts taking precedence.
 * @param entry Authorized, privacy-projected change.
 * @returns Actions available to the reader; hidden differences never affect membership.
 */
export function changelogEntryActions(
  entry: ChangelogEntry,
): Set<ChangelogFilters['action']> {
  if (entry.baseline) return new Set(['baseline'])
  if (entry.unpublished) return new Set(['unpublished'])
  if (entry.initial)
    return new Set([entry.category === 'publication' ? 'published' : 'created'])
  const actions = new Set<ChangelogFilters['action']>()
  for (const change of entry.changes) {
    actions.add(
      !change.before.present ? 'added' : !change.after.present ? 'removed' : 'updated',
    )
    if (change.after.present && typeof change.after.value === 'boolean') {
      if (change.path.at(-1) === 'isPublished')
        actions.add(change.after.value ? 'published' : 'unpublished')
      if (change.path.at(-1) === 'isArchived')
        actions.add(change.after.value ? 'archived' : 'restored')
    }
  }
  // An empty restricted comparison must not reveal what kind of hidden edit occurred.
  if (!actions.size) actions.add('updated')
  return actions
}

/** Match filters against safe response data, including literal metadata search.
 * @param entry Authorized change after historical field redaction.
 * @param filters Current view selections.
 * @returns Whether the entry belongs to this filtered feed.
 * @remarks Search excludes before/after values and hidden fields.
 */
export function matchesChangelogFilters(
  entry: ChangelogEntry,
  filters: ChangelogFilters,
): boolean {
  if (filters.resourceType && entry.resourceType !== filters.resourceType) return false
  if (filters.category && entry.category !== filters.category) return false
  if (filters.origin && entry.origin !== filters.origin) return false
  if (
    filters.actor &&
    ((entry.baselineActor?.actorId ?? entry.actorId) !== filters.actor.id ||
      (entry.baselineActor ? 'user' : entry.origin) !== filters.actor.origin)
  )
    return false
  if (filters.from && entry.createdAt < `${filters.from}T00:00:00.000Z`) return false
  if (
    filters.to &&
    entry.createdAt >= new Date(Date.parse(filters.to) + 86_400_000).toISOString()
  )
    return false
  if (filters.action && !changelogEntryActions(entry).has(filters.action)) return false
  const search = filters.search?.trim().toLowerCase()
  return (
    !search ||
    [
      entry.name,
      entry.resourceId,
      entry.actorId,
      entry.actorName,
      entry.actorUsername,
      entry.actorDisplayUsername,
      entry.baselineActor?.actorId,
      entry.baselineActor?.actorName,
      entry.baselineActor?.actorUsername,
      entry.baselineActor?.actorDisplayUsername,
      entry.reason,
    ].some(value => value?.toLowerCase().includes(search))
  )
}
