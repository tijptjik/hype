import type { Cache } from '#lib/context/cache.types.js'
import type { ResourceOptimisticInput } from '#lib/context/featureQuery.types.js'
import { lazyRegistry } from './lazyRegistry.js'
import {
  ResourceCollection,
  type ResourceCollectionInput,
} from './resourceCollection.js'
import type { FeatureQuery } from '#lib/context/feature-query.svelte.js'
import type { FeatureQueryChannel } from '#lib/context/featureQuery.types.js'
// TYPES
import type { RemoteQuery } from '$app/server'
import type { CacheCtx } from '#lib/context/cache.svelte.js'
import type { ResourceList } from '#lib/context/resource-list.svelte.js'
import type { PanelResourceType } from '#lib/api/services/resourcePage.types.js'
import type { EntityResponse } from '#lib/types.js'

/**
 * A consumer-owned reactive detail backed by a retained native query.
 * @remarks Scope changes and release supersede pending reads without cancelling shared transport.
 */
export class ResourceDetail<T> {
  loading = $state(false)
  error: unknown = $state(null)
  private query: RemoteQuery<EntityResponse<T>> | undefined = $state.raw()
  private generation = 0
  private released = false
  private loadedIdentity = ''
  private loadedEpoch = -1
  private detach: (() => void) | undefined

  constructor(
    private readonly cache: CacheCtx,
    private readonly identity: () => string,
    private readonly factory: () => RemoteQuery<EntityResponse<T>>,
    private readonly onRelease: () => void = () => {},
  ) {}

  /** Current native payload, including optimistic overrides. */
  get data(): T | null | undefined {
    if (
      this.loadedEpoch !== this.cache.generation ||
      this.loadedIdentity !== this.identity()
    )
      return undefined
    if (
      [401, 403, 404].includes((this.error as { status?: number } | null)?.status ?? 0)
    )
      return undefined
    return this.query?.current?.data
  }

  /**
   * Resolves a compatible native handle and applies the cache freshness policy.
   * @param force Whether to explicitly revalidate the remote query.
   * @returns The current resource after loading.
   */
  async load(force = false): Promise<T | null | undefined> {
    if (this.released) throw new Error('Resource detail has been released')
    const generation = ++this.generation
    const key = this.identity()
    const epoch = this.cache.generation
    this.loading = true
    this.error = null
    this.detach?.()
    this.detach = this.cache.retainDetail(key)
    try {
      const query = this.cache.detailQuery(key, this.factory)
      this.loadedIdentity = key
      this.loadedEpoch = this.cache.generation
      this.query = query
      if (force) await query.refresh()
      await this.cache.ensureResource(
        key,
        () => query,
        () => {},
      )
      if (
        generation !== this.generation ||
        key !== this.identity() ||
        epoch !== this.cache.generation
      )
        return undefined
      return query.current?.data
    } catch (error) {
      if (generation === this.generation) this.error = error
      throw error
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /** Revalidates this detail. @returns The current resource. */
  refresh(): Promise<T | null | undefined> {
    return this.load(true)
  }

  /** Detaches this consumer while allowing cache reuse. @returns Nothing. */
  release(): void {
    if (this.released) return
    this.generation++
    this.released = true
    this.query = undefined
    this.loading = false
    this.error = null
    this.detach?.()
    this.detach = undefined
    this.onRelease()
  }
}

/** Standard resource capabilities injected into surface and view controllers. */
export class ResourceClient {
  private readonly activeLists = new Set<ResourceList>()
  private readonly activeDetails = new Set<{ release(): void }>()
  readonly lists = lazyRegistry<PanelResourceType, ResourceList>(type =>
    this.createList(type),
  )
  readonly featureQueries = lazyRegistry<FeatureQueryChannel, FeatureQuery>(channel =>
    this.cache.createFeatureQuery(channel === 'map'),
  )

  /** Releases only this surface's named controllers. @returns Nothing. */
  release(): void {
    for (const list of this.activeLists) list.release()
    for (const detail of this.activeDetails) detail.release()
    for (const query of Object.values(this.featureQueries))
      this.cache.releaseFeatureQuery(query)
  }

  constructor(
    readonly cache: CacheCtx,
    private readonly scope: () => string,
    private readonly entities: Cache = cache.entities,
    private readonly isAdminRequest: () => boolean = () => false,
  ) {}

  /**
   * Projects a mutation into this access scope only.
   * @param type Mutated resource family.
   * @param input Validated patch or form data.
   * @param stores Additional view-owned stores.
   * @returns Native overrides and rollback/settlement capability.
   */
  beginMutation(
    type: string,
    input: ResourceOptimisticInput,
    stores: Array<[string, Map<string, unknown>]> = [],
  ) {
    const owned = Object.entries(this.entities).filter(
      ([key]) => key !== 'stats',
    ) as Array<[string, Map<string, unknown>]>
    return this.cache.beginMutation(type, input, [...owned, ...stores], this.scopeKey)
  }

  /** Reconciles committed changes. @param type Resource family. @returns Active refresh completion. */
  reconcile(type: string): Promise<void> {
    return this.cache.reconcile(type)
  }

  /** Current identity used by both retained and native query keys. */
  get scopeKey(): string {
    // Root identity generations also distinguish same-ID promotion and role revocation
    // in SvelteKit's native transport keys, before a refresh can expose old payloads.
    return this.cache.managedByRoot
      ? `${this.scope()}:epoch=${this.cache.generation}`
      : this.scope()
  }

  /** Access intent is bound by the surface, independently of view query filters. */
  get queryMeta(): { scope: string; isAdminRequest: boolean } {
    return { scope: this.scopeKey, isAdminRequest: this.isAdminRequest() }
  }

  /**
   * Creates an inert, typed detail consumer; providers preserve remote profile inference.
   * @param type Resource family used for mutation reconciliation.
   * @param input Complete operation arguments, including profile and reference.
   * @param factory Native query factory supplied by the resource provider.
   * @returns A reactive detail controller.
   */
  detail<T>(
    type: string,
    input: unknown,
    factory: () => RemoteQuery<EntityResponse<T>>,
  ): ResourceDetail<T> {
    const detail: ResourceDetail<T> = new ResourceDetail(
      this.cache,
      () => JSON.stringify([type, input, this.scopeKey]),
      factory,
      (): void => {
        this.activeDetails.delete(detail)
      },
    )
    this.activeDetails.add(detail)
    return detail
  }

  /**
   * Creates independent hierarchy traversal without issuing a request.
   * @param type Hierarchy resource family.
   * @returns A registered controller; call release when the view is destroyed.
   */
  createList(type: PanelResourceType): ResourceList {
    const list = this.cache.createList(type, () => this.activeLists.delete(list))
    this.activeLists.add(list)
    return list
  }

  /**
   * Creates traversal with access metadata supplied by this surface client.
   * @param type Resource family.
   * @param defaults Initial response profile and query defaults.
   * @returns An inert collection exposing only view query intent.
   */
  createCollection(
    type: PanelResourceType,
    defaults: ResourceCollectionInput = {},
  ): ResourceCollection {
    return new ResourceCollection(
      this.createList(type),
      type,
      () => ({ scope: this.scopeKey, isAdminRequest: this.isAdminRequest() }),
      defaults,
    )
  }
}
