// SVELTE
import { untrack } from 'svelte'
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
 * @returns Search, paging, row and navigation state for a render-only section.
 */
export function useSavedFeatureListModel(
  app: ResourceViewCtx,
  omni: OmniCtx,
  kind: 'wishlist' | 'visited',
) {
  const query = app.resources.featureQueries[kind]
  let searchTerm = $state('')

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
    const userId = app.user?.id
    const input = queryInput()
    untrack(() => {
      if (!userId) query.clear()
      else void app.loadFeatureQuery(kind, input).catch(() => {})
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
        ? app.getContextualProjectName(record.hierarchy.project)
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
    loadMore: () => app.loadMoreFeatureQuery(kind),
    retry: () => {
      query.invalidate()
      void app.loadFeatureQuery(kind, queryInput()).catch(() => {})
    },
    onOpen: (featureId: string) => {
      if (kind === 'visited') navigateToVisited(app, omni, featureId, records)
      else navigateToStarred(app, omni, featureId, records)
    },
  }
}
