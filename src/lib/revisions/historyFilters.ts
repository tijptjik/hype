// TYPES
import type { ChangelogEntry, ChangelogFilterOptions } from './changelog'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
import type { FeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import type { RevisionDifference } from './diff'

/** Adapt authorized record history to the shared filter contract.
 * @param entry Recorded revision with already authorized differences.
 * @param resourceType Resource owning this history.
 * @param category Current history category.
 * @returns Filter evidence without fetching or exposing additional data.
 */
export function resourceHistoryFilterEntry(
  entry: OrganisationHistoryPage['entries'][number],
  resourceType: ChangelogEntry['resourceType'],
  category: 'profile' | 'fields',
): ChangelogEntry {
  return {
    ...entry,
    key: entry.id,
    resourceType,
    resourceId: entry.id,
    name: '',
    category,
    actorName: entry.actor?.name ?? null,
    actorUsername: entry.actor?.username ?? null,
    actorDisplayUsername: entry.actor?.displayUsername ?? null,
    baseline: entry.initial,
    unpublished: false,
    redacted: false,
  }
}

/** Adapt publication metadata and its authorized comparison to the same filter rules.
 * @param entry Publication or private capture metadata.
 * @param review Authorized comparison, when loaded.
 * @param privateHistory Whether this is an unpublished capture.
 * @returns Visible evidence for shared filtering.
 */
export function featureHistoryFilterEntry(
  entry: FeatureRevisionWorkspace['history'][number],
  review?: { changes: RevisionDifference[]; baseline?: boolean; unpublished?: boolean },
  privateHistory = false,
): ChangelogEntry {
  return {
    ...entry,
    key: String(entry.generation),
    resourceType: 'feature',
    resourceId: entry.revisionId ?? '',
    name: '',
    category: privateHistory ? 'profile' : 'publication',
    actorName: entry.actorName ?? null,
    actorUsername: entry.actorUsername ?? null,
    actorDisplayUsername: entry.actorDisplayUsername ?? null,
    initial: entry.generation === 0,
    baseline:
      review?.baseline ?? (entry.generation === 0 && entry.origin === 'migration'),
    unpublished: review?.unpublished ?? false,
    redacted: false,
    changes: review?.changes ?? [],
  }
}

/** Build actor and period choices from the unfiltered loaded evidence.
 * @param entries Authorized history entries before applying UI filters.
 * @returns Deduplicated actor identities and the loaded date range.
 */
export function historyFilterOptions(
  entries: ChangelogEntry[],
): ChangelogFilterOptions {
  const actors = new Map<string, ChangelogFilterOptions['actors'][number]>()
  for (const entry of entries) {
    const actor = entry.baselineActor
    const id = actor?.actorId ?? entry.actorId
    const origin = actor ? 'user' : entry.origin
    const name = actor?.actorName ?? entry.actorName
    const username = actor?.actorUsername ?? entry.actorUsername
    const displayUsername = actor?.actorDisplayUsername ?? entry.actorDisplayUsername
    actors.set(`${origin}:${id}`, {
      id,
      origin,
      label: name || displayUsername || username || id,
      name,
      username,
      displayUsername,
    })
  }
  const dates = entries.map(entry => entry.createdAt).sort()
  return {
    actors: [...actors.values()],
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  }
}
