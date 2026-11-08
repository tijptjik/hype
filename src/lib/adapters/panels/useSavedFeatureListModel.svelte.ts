// SVELTE
import { untrack } from 'svelte'
// API
import { getSavedFeatureSuccessors } from '#lib/api/featureIdentity.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// DATE
import { formatDistanceToNow } from 'date-fns'
// I18N
import { getI18n, toDateFnsLocale, m } from '#lib/i18n.js'
// NAVIGATION
import { navigateToStarred, navigateToVisited } from '#lib/navigation/index.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { UserFeatureWithHierarchy } from '#lib/db/zod/schema/user.types.js'

export type SavedFeatureRow = {
  id: string
  title: string
  organisation?: string
  project?: string
  layer?: string
  dateLabel?: string
}

/**
 * Owns one saved-feature collection query and maps shared cache records into display rows.
 * @param app - Application resource/cache context owned by the route.
 * @param omni - Route-owned map/search navigation context.
 * @param kind - Saved-feature collection to query.
 * @param active - Whether the owning panel currently needs its queries.
 * @returns Search, paging, row and navigation state for a render-only section.
 */
export function useSavedFeatureListModel(
  app: ResourceViewCtx,
  omni: OmniCtx,
  kind: 'wishlist' | 'visited',
  active: () => boolean = () => true,
) {
  const query = app.resources.featureQueries[kind]
  let searchTerm = $state('')
  let guidance = $state<Awaited<ReturnType<typeof getSavedFeatureSuccessors>>['rows']>(
    [],
  )
  let guidanceOffset = $state<number | null>(0),
    guidanceLoading = $state(false),
    guidanceError = $state('')
  let guidanceGeneration = 0,
    guidanceKey = ''

  /** Loads session-owned successor guidance without importing retired Feature content.
   * @param reset Whether to replace the first page.
   * @returns Completion of this account's bounded guidance request.
   */
  async function loadGuidance(reset = false): Promise<void> {
    if (
      kind !== 'wishlist' ||
      !app.user ||
      (!reset && (guidanceLoading || guidanceOffset === null))
    )
      return
    const generation = guidanceGeneration,
      accountRevision = app.account.revision
    guidanceLoading = true
    guidanceError = ''
    try {
      const result = await refreshRemoteQuery(
        getSavedFeatureSuccessors({ offset: reset ? 0 : guidanceOffset! }),
      )
      if (generation !== guidanceGeneration || accountRevision !== app.account.revision)
        return
      guidance = reset ? result.rows : [...guidance, ...result.rows]
      guidanceOffset = result.nextOffset
    } catch {
      if (generation === guidanceGeneration && accountRevision === app.account.revision)
        guidanceError = 'Unable to load updates to saved places.'
    } finally {
      if (generation === guidanceGeneration && accountRevision === app.account.revision)
        guidanceLoading = false
    }
  }
  $effect(() => {
    const enabled = active()
    const user = app.user?.id,
      revision = app.account.revision
    // Membership changes refresh guidance; responses cannot cross an account switch.
    const membership = app.account.collections.state.wishlisted
    const key = JSON.stringify([
      user,
      revision,
      membership.map(row => [row.featureId, row.modifiedAt, row.isWishlisted]),
    ])
    untrack(() => {
      if (!enabled && user) return
      if (key === guidanceKey) return
      guidanceKey = key
      guidanceGeneration++
      guidance = []
      guidanceOffset = 0
      guidanceLoading = false
      guidanceError = ''
      if (user && kind === 'wishlist') void loadGuidance(true)
    })
  })

  /** Builds deterministic query input from the current search and saved list. */
  function queryInput() {
    return app.filters.featureQueryInput({
      q: searchTerm,
      filters: { list: { listId: kind } },
      ...(kind === 'visited'
        ? { sorting: { sortBy: 'visitedAt' as const, sortOrder: 'desc' as const } }
        : {}),
    })
  }

  // Keep the shared feature query current without coupling the section to ResourceViewCtx.
  $effect(() => {
    const enabled = active()
    const userId = app.user?.id
    const input = queryInput()
    untrack(() => {
      if (!userId) query.clear()
      else if (enabled) void app.queries.loadFeatureQuery(kind, input).catch(() => {})
    })
  })

  const records = $derived.by((): UserFeatureWithHierarchy[] => {
    const memberships = new Map(
      query.pages
        .flatMap(page => page.current?.userFeatures ?? [])
        .map(row => [row.featureId, row]),
    )
    for (const row of app.account.collections.state[
      kind === 'wishlist' ? 'wishlisted' : 'visited'
    ])
      memberships.set(row.featureId, row)
    return query.rows.map(feature => ({
      userId: app.user?.id ?? '',
      featureId: feature.id,
      isWishlisted: kind === 'wishlist',
      isVisited: kind === 'visited',
      visitedAt: null,
      createdAt: '',
      modifiedAt: '',
      ...memberships.get(feature.id),
      feature,
      hierarchy: app.getHierarchySync(feature),
    }))
  })

  const rows = $derived.by(() => {
    const preferences = app.getUserPreferences()
    const mapped = records.map(record => ({
      id: record.featureId,
      title: getI18n(record.feature, 'title', preferences),
      organisation: record.hierarchy.organisation
        ? getI18n(record.hierarchy.organisation, 'nameShort', preferences)
        : undefined,
      project: record.hierarchy.project
        ? app.getContextualProjectName(
            record.hierarchy.project,
            false,
            true,
            Boolean(record.hierarchy.organisation),
          )
        : undefined,
      layer: record.hierarchy.layer
        ? app.getContextualLayerName(record.hierarchy.layer)
        : undefined,
      ...(kind === 'visited'
        ? {
            dateLabel: record.visitedAt
              ? formatDistanceToNow(new Date(record.visitedAt), {
                  addSuffix: true,
                  locale: toDateFnsLocale(),
                })
                  .replace('minute', 'min')
                  .replace('hour', 'hr')
              : '-',
          }
        : {}),
      sortTimestamp: record.visitedAt ? new Date(record.visitedAt).getTime() : 0,
    }))
    return kind === 'visited'
      ? mapped.sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      : mapped
  })

  return {
    get splitGuidance() {
      return guidance.filter(
        row =>
          !searchTerm ||
          Object.values(row.titles).some(title =>
            title.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase()),
          ),
      )
    },
    get guidanceLoading() {
      return guidanceLoading
    },
    get guidanceError() {
      return guidanceError
    },
    get hasMoreGuidance() {
      // Offset zero is the initial request, not evidence of another results page.
      return guidanceOffset !== null && guidanceOffset > 0
    },
    loadMoreGuidance: () => loadGuidance(),
    retryGuidance: () => loadGuidance(true),
    get title() {
      const name =
        kind === 'visited' ? m.stars__have_visited() : m.stars__want_to_visit()
      return query.totalCount === null ? name : `${name} (${query.totalCount})`
    },
    get rows() {
      return rows
    },
    get rowCount() {
      return rows.length
    },
    get totalCount() {
      return query.totalCount
    },
    get loading() {
      return query.loading
    },
    get error() {
      return query.error
    },
    get hasMore() {
      return query.hasMore
    },
    get search() {
      return searchTerm
    },
    setSearch: (value: string) => {
      searchTerm = value
    },
    loadMore: () => app.queries.loadMoreFeatureQuery(kind),
    retry: () => {
      query.invalidate()
      void app.queries.loadFeatureQuery(kind, queryInput()).catch(() => {})
    },
    onOpen: (featureId: string) => {
      if (kind === 'visited') navigateToVisited(app, omni, featureId, records)
      else navigateToStarred(app, omni, featureId, records)
    },
  }
}
