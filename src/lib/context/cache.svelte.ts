// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// REMOTE
import type { getResourcePage, getPinnedResource } from '#lib/api/resources.remote.js'
import type { getFeaturePage } from '#lib/api/featureQueries.remote.js'
// CONTEXT
import { ResourceList } from './resource-list.svelte'
import type { FeatureQuery, FeatureQueryRetention } from './feature-query.svelte'
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

/** Creates isolated raw view records. @returns Empty maps for each resource family. */
function createEntityStore(): Cache {
  return {
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
}

/** Session-local domain retention. SvelteKit owns active page payloads and request deduplication. */
export class CacheCtx {
  private readonly optimisticRecords = new OptimisticRecords()
  featureCollection: FeatureCollectionHandle | undefined = $state.raw()
  featureCollectionScope: string | undefined
  readonly entities: Cache = createEntityStore()
  private readonly viewStores = new Set<Cache>()

  /** Registers isolated surface records. @returns A fresh view-owned entity store. */
  createEntityStore(): Cache {
    const store = createEntityStore()
    this.viewStores.add(store)
    return store
  }

  /** Releases a view's records. @param store View-owned entity store. @returns Nothing. */
  releaseEntityStore(store: Cache): void {
    for (const entries of Object.values(store)) entries.clear()
    this.viewStores.delete(store)
  }

  private readonly registeredLists = new Map<ResourceList, PanelResourceType>()
  private readonly registeredFeatures = new Map<FeatureQuery, boolean>()
  private featureMechanics:
    | { retention: FeatureQueryRetention; create: (bounded: boolean) => FeatureQuery }
    | undefined

  /**
   * Creates inert shared retention with route-supplied remote factories.
   * @param providers Query factories imported by the consuming surface.
   */
  constructor(
    private providers: {
      page: typeof getResourcePage
      pin: typeof getPinnedResource
      feature: typeof getFeaturePage
      createFeatureMechanics?: () => {
        retention: FeatureQueryRetention
        create: (bounded: boolean) => FeatureQuery
      }
    } = {
      page: () => {
        throw new Error('Resource page provider is not installed')
      },
      pin: () => {
        throw new Error('Resource pin provider is not installed')
      },
      feature: () => {
        throw new Error('Feature provider is not installed')
      },
    },
    readonly managedByRoot = false,
  ) {}

  /** Installs route-owned factories without fetching data. @param providers Native query factories. @returns Nothing. */
  installProviders(providers: {
    page: typeof getResourcePage
    pin: typeof getPinnedResource
    feature: typeof getFeaturePage
    createFeatureMechanics?: () => {
      retention: FeatureQueryRetention
      create: (bounded: boolean) => FeatureQuery
    }
  }): void {
    this.providers = providers
  }

  /**
   * Creates traversal for a feature consumer that installed spatial mechanics.
   * @param bounded Whether the consumer requires bounded map accumulation.
   * @returns An independently registered feature controller.
   */
  createFeatureQuery(bounded = false): FeatureQuery {
    this.featureMechanics ??= this.providers.createFeatureMechanics?.()
    if (!this.featureMechanics)
      throw new Error('This surface has not installed feature traversal mechanics')
    const query = this.featureMechanics.create(bounded)
    this.registeredFeatures.set(query, bounded)
    return query
  }

  /** Releases a feature consumer. @param query Consumer-owned traversal. @returns Nothing. */
  releaseFeatureQuery(query: FeatureQuery): void {
    query.clear()
    this.registeredFeatures.delete(query)
  }

  /**
   * Allocates independent traversal and registers it for mutation reconciliation.
   * @param type Resource family for membership invalidation.
   * @returns An inert controller; release it when its consumer is destroyed.
   */
  createList(type: PanelResourceType, onRelease: () => void = () => {}): ResourceList {
    const list = new ResourceList(this.providers.page, () => {
      this.registeredLists.delete(list)
      onRelease()
    })
    this.registeredLists.set(list, type)
    return list
  }

  /**
   * Finds active traversal owners affected by a resource mutation.
   * @param types Resource families to match.
   * @returns Registered list controllers without creating inactive surface slots.
   */
  private listsFor(types: PanelResourceType[]): ResourceList[] {
    return [...this.registeredLists]
      .filter(([, type]) => types.includes(type))
      .map(([list]) => list)
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
      entry = { type, query: this.providers.pin({ type, id, meta }) }
      this.pins.set(key, entry)
    }
    return entry.query
  }

  private epoch = $state(0)

  /** Scope generation observed by consumers before exposing retained native data. */
  get generation(): number {
    return this.epoch
  }
  private details = new Map<string, ResourceDetailHandle>()
  private readonly detailConsumers = new Map<string, number>()

  /**
   * Protects a live detail handle from inactive-retention eviction.
   * @param key Complete query identity.
   * @returns Idempotent release callback.
   */
  retainDetail(key: string): () => void {
    this.detailConsumers.set(key, (this.detailConsumers.get(key) ?? 0) + 1)
    let active = true
    return () => {
      if (!active) return
      active = false
      const count = (this.detailConsumers.get(key) ?? 1) - 1
      if (count > 0) this.detailConsumers.set(key, count)
      else this.detailConsumers.delete(key)
      // Active consumers stay pinned; only inactive detail retention is bounded.
      const inactive = [...this.details.keys()].filter(
        identity => !this.detailConsumers.has(identity),
      )
      for (const identity of inactive.slice(0, Math.max(0, inactive.length - 128)))
        this.details.delete(identity)
    }
  }

  /**
   * Retains a typed native query under a complete scope/profile identity.
   * @param key Canonical resource and access identity.
   * @param factory Lazy native query factory.
   * @returns The existing compatible handle or a newly created one.
   */
  detailQuery<T>(
    key: string,
    factory: () => RemoteQuery<import('#lib/types.js').EntityResponse<T>>,
  ): RemoteQuery<import('#lib/types.js').EntityResponse<T>> {
    let entry = this.details.get(key)
    if (!entry) {
      entry = { query: factory(), fetchedAt: 0 }
      this.details.set(key, entry)
    }
    return entry.query as RemoteQuery<import('#lib/types.js').EntityResponse<T>>
  }

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
    scope?: string,
  ): { updates: RemoteQueryOverride[]; settle: (success: boolean) => void } {
    const settle = this.optimisticRecords.begin(
      [
        ...(!scope
          ? [this.entities, ...this.viewStores].flatMap(store =>
              Object.entries(store).filter(([key]) => key !== 'stats'),
            )
          : []),
        ...stores,
      ] as Array<[string, Map<string, unknown>]>,
      (value, ownerType) => projectResourcePatch(value, type, input, ownerType),
    )
    try {
      return { updates: this.optimisticUpdates(type, input, scope), settle }
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
    scope?: string,
  ): RemoteQueryOverride[] {
    const featureCollection =
      !scope || this.featureCollectionScope === scope
        ? this.featureCollection
        : undefined

    const detailUpdates = [...this.details.entries()].flatMap(([key, entry]) => {
      if (scope && (!key.startsWith('[') || JSON.parse(key).at(-1) !== scope)) return []
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
        ...[...this.registeredLists.keys()]
          .filter(list => !scope || list.scope === scope)
          .flatMap(list => list.retainedPages),
        ...[...this.registeredFeatures.keys()]
          .filter(query => !scope || query.scope === scope)
          .flatMap(query => query.retainedPages),
        ...(!scope ? (this.featureMechanics?.retention.retainedPages ?? []) : []),
        ...(featureCollection ? [featureCollection] : []),
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
        ...[...this.pins.entries()]
          .filter(([key]) => !scope || JSON.parse(key)[2].scope === scope)
          .map(([, entry]) => entry)
          .flatMap(({ query }) => {
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
        ...(featureCollection
          ? [
              featureCollection.withOverride(current => {
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
        ...[...this.registeredFeatures]
          .filter(([query]) => !scope || query.scope === scope)
          .flatMap(([query, isMap]) =>
            query.pages.map(page =>
              page.withOverride(current => {
                if (!current) return current
                return {
                  ...current,
                  data: current.data.flatMap(row => {
                    if (row.id !== id) return [row]
                    const updated = { ...row, ...patch, id: row.id }
                    // Map snapshots need the patched record to hide it and support native rollback.
                    return isMap || query.matches(updated) ? [updated] : []
                  }),
                }
              }),
            ),
          ),
      ]
    }
    if (!['organisation', 'project', 'layer'].includes(type)) return detailUpdates
    const resourceType = type as PanelResourceType
    const affected: PanelResourceType[] =
      resourceType === 'organisation'
        ? ['organisation', 'project', 'layer']
        : resourceType === 'project'
          ? ['project', 'layer']
          : ['layer']
    const lists = this.listsFor(affected).filter(list => !scope || list.scope === scope)
    // Sidebar, index and panel traversals can retain distinct proxies for one native query.
    const overriddenPages = new Set<string | object>()
    for (const list of lists) list.invalidate()
    this.details.clear()
    const patch = input.data ?? {}
    const id = input.meta?.id
    const temporaryId = `pending:${crypto.randomUUID()}`
    const pinOverrides = [...this.pins.entries()]
      .filter(([key]) => !scope || JSON.parse(key)[2].scope === scope)
      .map(([, entry]) => entry)
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
          .map((page, index) => ({ page, index }))
          .filter(({ page }) => {
            const identity = list.pageIdentity(page)
            if (overriddenPages.has(identity)) return false
            overriddenPages.add(identity)
            return true
          })
          .map(({ page, index }) =>
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
                            ...(type === 'project' &&
                            typeof patch.useAllInOrgContext === 'boolean'
                              ? { useAllInOrgContext: patch.useAllInOrgContext }
                              : {}),
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
      this.featureMechanics?.retention.clear()
      for (const query of [...this.registeredFeatures.keys()]) query.invalidate()
      this.details.clear()
      return
    }
    // Mutations invalidate shared previews and authoritative query counts together.
    if (['feature', 'organisation', 'project', 'layer'].includes(type)) {
      this.featureMechanics?.retention.clear()
      for (const query of [...this.registeredFeatures.keys()]) query.invalidate()
      featureRefreshes.push(
        ...[...this.registeredFeatures.keys()].map(query => query.revalidate()),
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
      ...this.listsFor(affected).map(list => list.reconcile().catch(() => {})),
    ])
  }

  /**
   * Invalidates inactive page membership after a resource mutation.
   * @param type - Changed hierarchy resource.
   * @returns Nothing.
   */
  invalidate(type: PanelResourceType): void {
    for (const list of this.listsFor([type])) list.invalidate()
  }

  /** Clears every retained scope-sensitive record and page before an identity transition. */
  clear(): void {
    this.epoch++
    this.optimisticRecords.clear()
    this.featureCollection = undefined
    this.featureMechanics?.retention.clear()
    for (const query of [...this.registeredFeatures.keys()]) query.clear()
    this.details.clear()
    this.pins.clear()
    for (const entities of [this.entities, ...this.viewStores])
      for (const store of Object.values(entities)) store.clear()
    for (const list of this.registeredLists.keys()) list.clear()
  }
}
