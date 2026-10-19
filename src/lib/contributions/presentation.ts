// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

/**
 * Filters the profile's contribution groups without changing its cached source data.
 * @param profile Loaded profile, including owner-only status previews.
 * @param showAll Whether to include nonpublished contributions; defaults to published only.
 * @returns A display profile whose counts and sections share the same visibility filter.
 */
export function filterProfileContributions(
  profile: UserProfile | null | undefined,
  showAll = false,
): UserProfile | undefined {
  if (!profile) return undefined
  if (showAll) return profile
  const filterGroups = (
    groups: Record<string, string[]>,
    privateIds: Record<string, unknown> = {},
  ): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(groups)
        .map(([project, ids]) => [project, ids.filter(id => !privateIds[id])] as const)
        .filter(([, ids]) => ids.length > 0),
    )
  return {
    ...profile,
    contributedFeatures: filterGroups(
      profile.contributedFeatures,
      profile.privateContributions?.features,
    ),
    contributedImages: filterGroups(
      profile.contributedImages,
      profile.privateContributions?.images,
    ),
  }
}

/**
 * Orders contribution IDs before pagination so mixed publication states stay chronological.
 * @param groups Project-grouped contribution IDs.
 * @param dates Creation timestamps keyed by contribution ID.
 * @returns New groups ordered newest first, with deterministic ID ordering for ties.
 */
export function sortContributionGroups(
  groups: Record<string, string[]>,
  dates: ReadonlyMap<string, string>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(groups).map(([project, ids]) => [
      project,
      [...ids].sort(
        (a, b) =>
          (Date.parse(dates.get(b) ?? '') || 0) -
            (Date.parse(dates.get(a) ?? '') || 0) || a.localeCompare(b),
      ),
    ]),
  )
}
