// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// REMOTE
import { getResourcePage, getPinnedResource } from '#lib/api/server/resources.remote.js'
import { getFeaturePage } from '#lib/api/server/featureQueries.remote.js'
// CONTEXT
import { ResourceList } from './resource-list.svelte'
import { FeatureQuery, FeatureQueryRetention } from './feature-query.svelte'
// TYPES
import type { Cache } from '#lib/context/cache.types.js'
import type {
  PanelResourceType,
  PanelResource,
} from '#lib/api/services/resourcePage.types.js'
import type {
  ResourceDetailHandle,
  ResourceOptimisticInput,
  FeatureCollectionHandle,
} from '#lib/context/featureQuery.types.js'

/** Session-local domain retention. SvelteKit owns active page payloads and request deduplication. */
export class CacheCtx {
  featureCollection: FeatureCollectionHandle | undefined = $state.raw()
  readonly entities: Cache = {
    organisation: new SvelteMap(),
    project: new SvelteMap(),
    layer: new SvelteMap(),
    feature: new SvelteMap(),
    task: new SvelteMap(),
    hub: new SvelteMap(),
    property: new SvelteMap(),
    image: new SvelteMap(),
    user: new SvelteMap(),
    stats: new SvelteMap(),
  }
  readonly lists = {
    organisation: new ResourceList(getResourcePage),
    project: new ResourceList(getResourcePage),
    layer: new ResourceList(getResourcePage),
  }

  readonly indexLists = {
    organisation: new ResourceList(getResourcePage),
    project: new ResourceList(getResourcePage),
    layer: new ResourceList(getResourcePage),
  }

  private readonly featureRetention = new FeatureQueryRetention()
  readonly featureQueries = {
    map: new FeatureQuery(getFeaturePage, this.featureRetention, undefined, true),
    search: new FeatureQuery(getFeaturePage, this.featureRetention),
    searchWishlist: new FeatureQuery(getFeaturePage, this.featureRetention),
    collection: new FeatureQuery(getFeaturePage, this.featureRetention),
    facets: new FeatureQuery(getFeaturePage, this.featureRetention),
    wishlist: new FeatureQuery(getFeaturePage, this.featureRetention),
    visited: new FeatureQuery(getFeaturePage, this.featureRetention),
  }

  private pins = new Map<
    string,
    { type: PanelResourceType; query: ReturnType<typeof getPinnedResource> }
  >()

  /** Retains a native batched identity query for an active selection. */
  pin(
    type: PanelResourceType,
    id: string,
    meta: { isAdminRequest: boolean; scope: string },
  ) {
    const key = JSON.stringify([type, id, meta])
    let entry = this.pins.get(key)
    if (!entry) {
      entry = { type, query: getPinnedResource({ type, id, meta }) }
      this.pins.set(key, entry)
    }
    return entry.query
  }

  private epoch = 0
  private details = new Map<string, ResourceDetailHandle>()

  /**
   * Retains a native detail handle with five-minute stale-while-revalidate freshness.
   * @param key - Resource, ID, payload profile and authorization scope identity.
   * @param fetcher - Factory for an authorized native query.
   * @param commit - Current-scope domain reconciliation callback.
   * @returns Compatible retained data or the initial network result.
   */
  async ensureResource(
    key: string,
    fetcher: () => ResourceDetailHandle['query'],
    commit: (data: unknown) => void,
  ): Promise<unknown> {
    const epoch = this.epoch
    let entry = this.details.get(key)
    if (!entry) {
      entry = { query: fetcher(), fetchedAt: 0 }
      this.details.set(key, entry)
    }
    const currentEntry = entry
    const refresh = async () => {
      try {
        if (currentEntry.query.refresh) await currentEntry.query.refresh()
      } catch (error) {
        const status = (error as { status?: number })?.status
        if (
          epoch === this.epoch &&
          (status === 401 || status === 403 || status === 404)
        ) {
          this.details.delete(key)
          currentEntry.fetchedAt = 0
          currentEntry.snapshot = undefined
          commit(undefined)
        }
        throw error
      }
      const result = currentEntry.query.current ?? (await currentEntry.query)
      if (epoch !== this.epoch) return undefined
      currentEntry.fetchedAt = Date.now()
      currentEntry.snapshot = result.data
      commit(result.data)
      return result.data
    }
    const current = currentEntry.query.current
    if (currentEntry.fetchedAt) {
      if (Date.now() - currentEntry.fetchedAt >= 300_000) void refresh().catch(() => {})
      return current ? current.data : currentEntry.snapshot
    }
    return await refresh()
  }

  /**
   * Supplies native optimistic overrides for every affected active compact collection.
   * @param type - Mutated resource type.
   * @param input - Validated form shape or an identity plus boolean patch.
   * @returns Overrides released automatically by SvelteKit on settlement.
   */
  optimisticUpdates(type: string, input: ResourceOptimisticInput) {
    if (type === 'feature') {
      const patch = input.data ?? {}
      const id = input.meta?.id
      const temporaryId = `pending:${crypto.randomUUID()}`
      return [
        ...(this.featureCollection
          ? [
              this.featureCollection.withOverride(current => {
                if (!current) return current
                const data = current.data.map(row =>
                  row.id === id ? { ...row, ...patch, id: row.id } : row,
                )
                if (!id && input.meta?.mode === 'create')
                  data.unshift({ ...patch, id: temporaryId } as (typeof data)[number])
                return { ...current, data }
              }),
            ]
          : []),
        ...Object.entries(this.featureQueries).flatMap(([channel, query]) =>
          query.pages.map(page =>
            page.withOverride(current => {
              if (!current) return current
              return {
                ...current,
                data: current.data.flatMap(row => {
                  if (row.id !== id) return [row]
                  const updated = { ...row, ...patch, id: row.id }
                  // Map snapshots need the patched record to hide it and support native rollback.
                  return channel === 'map' || query.matches(updated) ? [updated] : []
                }),
              }
            }),
          ),
        ),
      ]
    }
    if (!(type in this.lists)) return []
    const resourceType = type as PanelResourceType
    const affected: PanelResourceType[] =
      resourceType === 'organisation'
        ? ['organisation', 'project', 'layer']
        : resourceType === 'project'
          ? ['project', 'layer']
          : ['layer']
    const lists = affected.flatMap(key => [this.lists[key], this.indexLists[key]])
    for (const list of lists) list.invalidate()
    this.details.clear()
    const patch = input.data ?? {}
    const id = input.meta?.id
    const temporaryId = `pending:${crypto.randomUUID()}`
    const pinOverrides = [...this.pins.values()]
      .filter(entry => entry.type === type && entry.query.current?.id === id)
      .map(entry =>
        entry.query.withOverride(current => {
          if (!current) return current
          const updated = { ...current, ...patch, id: current.id } as PanelResource
          return updated.isArchived ? null : updated
        }),
      )
    return [
      ...pinOverrides,
      ...lists.flatMap(list =>
        list.pages
          .filter(
            (page, index) =>
              index === 0 ||
              page.current?.data.some(
                row => row.id === id || list.visibleIds.has(row.id),
              ),
          )
          .map((page, index) =>
            page.withOverride(current => {
              if (!current) return current
              const data = current.data.flatMap(row => {
                if (row.id !== id) {
                  const ancestor =
                    id &&
                    (type === 'organisation' || type === 'project') &&
                    'ancestors' in row
                      ? row.ancestors?.[type]
                      : undefined
                  if (
                    id &&
                    (type === 'organisation' || type === 'project') &&
                    'ancestors' in row &&
                    ancestor?.id === id
                  ) {
                    return [
                      {
                        ...row,
                        ancestors: {
                          ...row.ancestors,
                          [type]: {
                            ...ancestor,
                            ...(patch.code ? { code: patch.code } : {}),
                            ...(patch.i18n ? { i18n: patch.i18n } : {}),
                          },
                        },
                      } as PanelResource,
                    ]
                  }
                  return [row]
                }
                const updated = { ...row, ...patch, id: row.id } as PanelResource
                return list.matches(updated) ? [updated] : []
              })
              if (
                lists.indexOf(list) < 2 &&
                !id &&
                input.meta?.mode === 'create' &&
                index === 0 &&
                list.acceptsPending(patch)
              ) {
                data.unshift({
                  ...patch,
                  id: temporaryId,
                  isPublished: false,
                  isArchived: false,
                  modifiedAt: '',
                } as PanelResource)
              }
              return { ...current, data }
            }),
          ),
      ),
    ]
  }

  /**
   * Rebuilds active pages after a committed mutation, including descendant breadcrumbs.
   * @param type - Changed hierarchy resource.
   * @returns Completion of current-view refreshes; inactive views remain invalidated.
   */
  async reconcile(type: string): Promise<void> {
    const featureRefreshes: Promise<void>[] = []
    // Mutations invalidate shared previews and authoritative query counts together.
    if (['feature', 'organisation', 'project', 'layer'].includes(type)) {
      this.featureRetention.clear()
      for (const query of Object.values(this.featureQueries)) query.invalidate()
      featureRefreshes.push(
        ...Object.values(this.featureQueries).map(query => query.revalidate()),
      )
    }
    const affected: PanelResourceType[] =
      type === 'organisation'
        ? ['organisation', 'project', 'layer']
        : type === 'project'
          ? ['project', 'layer']
          : type === 'layer'
            ? ['layer']
            : []
    this.details.clear()
    await Promise.all([
      ...featureRefreshes,
      ...affected
        .flatMap(key => [this.lists[key], this.indexLists[key]])
        .map(list => list.reconcile().catch(() => {})),
    ])
  }

  /**
   * Invalidates inactive page membership after a resource mutation.
   * @param type - Changed hierarchy resource.
   * @returns Nothing.
   */
  invalidate(type: PanelResourceType): void {
    this.lists[type].invalidate()
  }

  /** Clears every retained scope-sensitive record and page before an identity transition. */
  clear(): void {
    this.epoch++
    this.featureCollection = undefined
    this.featureRetention.clear()
    for (const query of Object.values(this.featureQueries)) query.clear()
    this.details.clear()
    this.pins.clear()
    for (const store of Object.values(this.entities)) store.clear()
    for (const list of [
      ...Object.values(this.lists),
      ...Object.values(this.indexLists),
    ])
      list.clear()
  }
}
