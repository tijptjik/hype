// TYPES
import type { ChangelogEntry } from './changelog'

// Use the same elapsed day/month/year durations as the row's relative-time formatter.
const thresholds = [
  { unit: 'day', milliseconds: 86_400_000, label: 'a day ago' },
  { unit: 'week', milliseconds: 604_800_000, label: 'a week ago' },
  { unit: 'month', milliseconds: 2_592_000_000, label: 'a month ago' },
  { unit: 'year', milliseconds: 31_536_000_000, label: 'a year ago' },
] as const

export type ChangelogTimeBoundary = (typeof thresholds)[number]['unit']

export type ChangelogCheckBoundary =
  | { position: 'before' | 'after'; key: string }
  | { position: 'empty' }

/** Position one previous-visit marker between new entries and older history.
 * @param entries All currently loaded entries in newest-first order.
 * @param lastCheckedAt Previous successful visit's server cutoff, frozen for this visit.
 * @param hasMore Whether older pages still remain to be fetched.
 * @returns A marker location, or null until a prior checkpoint and its position are known.
 * @remarks Equal timestamps stay above the marker conservatively. If every record is
 * new, the marker appears after the last record only once the feed is exhausted.
 */
export function changelogCheckBoundary(
  entries: readonly Pick<ChangelogEntry, 'key' | 'createdAt'>[],
  lastCheckedAt: string | null,
  hasMore: boolean,
): ChangelogCheckBoundary | null {
  const cutoff = lastCheckedAt ? Date.parse(lastCheckedAt) : NaN
  if (!Number.isFinite(cutoff)) return null
  const firstOlder = entries.find(entry => Date.parse(entry.createdAt) < cutoff)
  if (firstOlder) return { position: 'before', key: firstOlder.key }
  if (hasMore) return null
  const last = entries.at(-1)
  return last ? { position: 'after', key: last.key } : { position: 'empty' }
}

/** Locate each populated older time group's first record across the whole loaded feed.
 * @param entries Authorized entries in newest-first order, including loaded continuations.
 * @param now Current clock time, shared with the relative dates on individual rows.
 * @returns Boundary units keyed by their following entry's immutable key.
 * @remarks The last 24 hours have no heading. Empty periods are skipped, and pages
 * continuing the same period never introduce another boundary. Records are not mutated.
 */
export function changelogTimeBoundaries(
  entries: readonly Pick<ChangelogEntry, 'key' | 'createdAt'>[],
  now: Date,
): Map<string, ChangelogTimeBoundary> {
  const result = new Map<string, ChangelogTimeBoundary>()
  let previous: ChangelogTimeBoundary | null = null
  for (const entry of entries) {
    const age = now.getTime() - new Date(entry.createdAt).getTime()
    if (!Number.isFinite(age)) continue
    let unit: ChangelogTimeBoundary | null = null
    for (const threshold of thresholds) {
      if (age < threshold.milliseconds) break
      unit = threshold.unit
    }
    if (unit !== null && unit !== previous) result.set(entry.key, unit)
    previous = unit
  }
  return result
}

/** Label a time boundary using the requested English wording or the user's locale.
 * @param unit Elapsed-time threshold crossed by the following record.
 * @param locale Current content locale key.
 * @returns A compact localized boundary label.
 */
export function changelogTimeBoundaryLabel(
  unit: ChangelogTimeBoundary,
  locale: string,
): string {
  if (locale === 'en')
    return thresholds.find(threshold => threshold.unit === unit)!.label
  return new Intl.RelativeTimeFormat(
    locale === 'zhHant' ? 'zh-Hant' : locale === 'zhHans' ? 'zh-Hans' : locale,
    { numeric: 'always' },
  ).format(-1, unit)
}
