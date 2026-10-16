// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// REMOTE
import { getResourcePage, getPinnedResource } from '#lib/api/resources.remote.js'
import { getFeaturePage } from '#lib/api/featureQueries.remote.js'
// CONTEXT
import { ResourceList } from './resource-list.svelte'
import { FeatureQuery, FeatureQueryRetention } from './feature-query.svelte'
// SERVICES
import {
  OptimisticRecords,
  projectResourcePatch,
} from '#lib/client/services/optimisticRecords.js'
// TYPES
import type { RemoteQuery, RemoteQueryOverride } from '$app/server'
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
  private readonly optimisticRecords = new OptimisticRecords()
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
   * Starts a shared mutation across retained identities and native query projections.
   * @param type Mutated resource family.
   * @param input Record identity and changed fields.
   * @param stores Additional context-owned record stores to project with the same transaction.
   * @returns Native updates and an idempotent settlement callback.
   * @remarks Settle with false on failure; session changes discard pending layers.
   */
  beginMutation(
    type: string,
    input: ResourceOptimisticInput,
    stores: Array<[string, Map<string, unknown>]> = [],
  ): { updates: RemoteQueryOverride[]; settle: (success: boolean) => void } {
    const settle = this.optimisticRecords.begin(
      [
        ...Object.entries(this.entities).filter(([key]) => key !== 'stats'),
        ...stores,
      ] as Array<[string, Map<string, unknown>]>,
      (value, ownerType) => projectResourcePatch(value, type, input, ownerType),
    )
    try {
      return { updates: this.optimisticUpdates(type, input), settle }
    } catch (error) {
      settle(false)
      throw error
    }
  }

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
   * Supplies native optimistic overrides for affected collections and retained details.
   * @param type - Mutated resource type.
   * @param input - Validated form shape or an identity plus changed record fields.
   * @returns Overrides released automatically by SvelteKit on settlement.
   */
  optimisticUpdates(
    type: string,
    input: ResourceOptimisticInput,
  ): RemoteQueryOverride[] {
    const detailUpdates = [...this.details.entries()].flatMap(([key, entry]) => {
      const ownerType = key.startsWith('[')
        ? (JSON.parse(key)[0] as string)
        : key.split(':')[0]
      if (!entry.query.withOverride) return []
      const project = (current: { data?: unknown }) => ({
        ...current,
        data: projectResourcePatch(current.data, type, input, ownerType),
      })
      if (project(entry.query.current ?? {}).data === entry.query.current?.data)
        return []
      return [entry.query.withOverride(project)]
    })
    if (type === 'image') {
      // Image metadata is shared by flat compact rows and nested detail/gallery envelopes.
      const pages = new Set<RemoteQuery<{ data: unknown }>>([
        ...Object.values(this.lists).flatMap(list => list.retainedPages),
        ...Object.values(this.indexLists).flatMap(list => list.retainedPages),
        ...Object.values(this.featureQueries).flatMap(query => query.retainedPages),
        ...this.featureRetention.retainedPages,
        ...(this.featureCollection ? [this.featureCollection] : []),
      ] as RemoteQuery<{ data: unknown }>[])
      return [
        ...detailUpdates,
        ...[...pages].flatMap(page => {
          if (
            projectResourcePatch(page.current?.data, type, input, 'resource') ===
            page.current?.data
          )
            return []
          return [
            page.withOverride(current => ({
              ...current,
              data: projectResourcePatch(current.data, type, input, 'resource'),
            })),
          ]
        }),
        ...[...this.pins.values()].flatMap(({ query }) => {
          if (
            projectResourcePatch(query.current, type, input, 'resource') ===
            query.current
          )
            return []
          return [
            query.withOverride(current =>
              projectResourcePatch(current, type, input, 'resource'),
            ),
          ]
        }),
      ]
    }
    if (type === 'feature') {
      const patch = input.data ?? {}
      const id = input.meta?.id
      const temporaryId = `pending:${crypto.randomUUID()}`
      return [
        ...detailUpdates,
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
    if (!(type in this.lists)) return detailUpdates
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
      ...detailUpdates,
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
    if (type === 'image') {
      // Native updates already refreshed affected pages; discard detached previews only.
      this.featureRetention.clear()
      for (const query of Object.values(this.featureQueries)) query.invalidate()
      this.details.clear()
      return
    }
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
    this.optimisticRecords.clear()
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
