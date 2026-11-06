// TYPES
import type { RevisionDifference } from './diff'

/** Original contribution provenance, separate from the migration operation actor. */
export type FeatureBaselineActor = {
  actorId: string
  actorName: string | null
  actorUsername: string | null
  actorDisplayUsername: string | null
  role: 'reviewer' | 'contributor'
}
export type ChangelogResource = 'organisation' | 'project' | 'layer'
export type ChangelogCursor = { createdAt: string; key: string }
export type ChangelogEntry = {
  key: string
  resourceType: ChangelogResource | 'feature' | 'property' | 'hub'
  resourceId: string
  name: string
  /** Property key from this revision, or its predecessor when the property was removed. */
  propertyKey?: string
  category: 'profile' | 'fields' | 'publication' | 'maintenance'
  createdAt: string
  actorId: string
  actorName: string | null
  /** Current profile handles; immutable actorId remains the attribution identity. */
  actorUsername: string | null
  actorDisplayUsername: string | null
  origin: string
  baselineActor?: FeatureBaselineActor | null
  reason: string | null
  initial: boolean
  baseline: boolean
  unpublished: boolean
  redacted: boolean
  changes: RevisionDifference[]
}
export type ChangelogFilters = {
  resourceType?: ChangelogEntry['resourceType']
  category?: ChangelogEntry['category']
  action?:
    | 'created'
    | 'updated'
    | 'added'
    | 'removed'
    | 'published'
    | 'unpublished'
    | 'archived'
    | 'restored'
    | 'baseline'
  actor?: { id: string; origin: string }
  origin?: 'user' | 'system' | 'import' | 'migration' | 'restore'
  search?: string
  /** Inclusive UTC calendar days, matching the directory date slider. */
  from?: string
  to?: string
}
export type ChangelogFilterOptions = {
  actors: {
    id: string
    origin: string
    label: string
    /** Current display fields for the shared user-search result presentation. */
    name?: string | null
    username?: string | null
    displayUsername?: string | null
    image?: string | null
  }[]
  period: { from: string; to: string } | null
}
export type ChangelogPage = {
  /** Unfiltered authorized metadata, supplied on the first page only. */
  filterOptions?: ChangelogFilterOptions
  owner: { id: string; name: string }
  entries: ChangelogEntry[]
  nextCursor: ChangelogCursor | null
  unavailable: string[]
  checkpoint: {
    lastCheckedAt: string | null
    /** Server snapshot time, captured before the page is read. */
    checkedThrough: string
  }
}
