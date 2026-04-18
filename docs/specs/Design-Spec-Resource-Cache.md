# Resource Cache Architecture

## Goal
Provide fast, consistent resource access across admin/app routes for all the first-class resources
- `organisation`
- `project`
- `layer`
- `feature`
- `task`
- `hub`
- `property`
- `user`

while supporting:
- transparent `type + id` lookup with fetch-on-miss
- stale-while-revalidate behavior
- minimal network traffic
- offline persistence across sessions

## Problem Summary
Current behavior mixes multiple cache layers with overlapping responsibilities:
- SvelteKit remote-function query cache (internal, query-key based)
- `appCtx` entity/resource state
- optional SW/IndexedDB response cache

This creates cache coherence issues (query updated, resource index still stale).

## Target Architecture
Introduce a dedicated `CacheCtx` as the canonical domain cache service, and make `AppCtx` depend on it.

- `CacheCtx`: source of truth for normalized entities, query indexes, staleness metadata, and mutation reconciliation.
- `AppCtx`: orchestration layer for UI/navigation/filter state, delegating data lookup/mutation to `CacheCtx`.
- Svelte remote-function cache: transport-level optimization only.

### 1. Canonical Entity Store (source of truth)
Normalized by resource type and id:
- `entities[resourceType][id] = entity`
- `entityMeta[resourceType][id] = { fetchedAt, staleAt, expiresAt, etag?, source, bestProjection }`

### 2. Query Index Store (active sets)
Store query results as ordered id lists, not duplicated entities:
- `queryIndex[queryKey] = { ids: Id[], fetchedAt, staleAt, expiresAt, projection }`

`AppCtx.state.resources.*` should be derived from query id lists + canonical entities from `CacheCtx`.

Purpose of the query index:
- it represents "which records are in this specific list result, and in what order"
- it avoids duplicating full entities per list query
- it keeps list membership/order concerns separate from entity data concerns

Why this matters:
- the same entity can appear in many list queries (`all organisations`, `filtered organisations`, `search results`, paginated views)
- if lists store full objects, updates become hard to keep consistent across all lists
- by storing only ids in query results, a single entity update in `entities` is reflected everywhere that references that id

How rendering works:
1. resolve a list query key (example: `organisation:list:{conditionsHash}:{prismsHash}:{sort}:{page}`)
2. read `queryIndex[queryKey].ids`
3. map each id to `entities.organisation.get(id)`
4. render that ordered materialized array

What the metadata is for:
- `fetchedAt`: when this specific list result was fetched
- `staleAt`: when it should be considered stale (can still be served with background revalidation)
- `expiresAt`: when it should no longer be used as-is
- `projection`: minimum detail level guaranteed for list entries from this query

Practical effect:
- list-level invalidation targets `queryIndex` entries (membership/order freshness)
- entity-level updates target `entities` (field correctness)
- both concerns are independent but composable, which removes cross-list drift and simplifies optimistic updates

### 3. Remote Functions Role
Remote functions are used for:
- request dedupe
- optimistic `.withOverride(...)`
- `.updates(...)` propagation after `command`/`form`
- server validation/mutation flow

They are not the long-term canonical graph store.

### 4. Persistence Layer
Persist canonical entities + query index to IndexedDB.
- hydrate on boot
- mark entries stale based on TTL
- revalidate in background
- persist with controlled write cadence (not on every single mutation tick)

Phase 1 persistence approach:
- persist from `CacheCtx` directly to IndexedDB (no service worker required)
- keep IndexedDB schema aligned with canonical cache structures (`entities`, `entityMeta`, `queryIndex`)

Recommended write cadence:
1. immediate write for high-value state changes:
- successful remote `command`/`form` mutations
- explicit invalidations
2. batched/debounced writes for high-frequency updates:
- query refresh streams
- repeated optimistic patches
3. lifecycle safety write:
- flush pending writes on page hide/visibility change

This reduces write amplification while preserving good offline resilience.

## Auth Invalidation Policy (Phase 1)
To keep Phase 1 simpler and avoid per-record auth-context checks, `CacheCtx` must be fully flushed when auth context changes:
- user logs out
- user's effective roles/permissions change

Implementation note:
- cache and compare a deterministic "role signature" for the current user/session
- when the signature changes, clear canonical entities, query indexes, and persisted cache snapshots
- role changes must be treated as cascading invalidation for all cached resources

## CacheCtx API Contract
Introduce a small cache API in `CacheCtx`:

1. `ensureResource(type, id, options?)`
- policies: `cache-first`, `stale-while-revalidate`, `network-first`, `cache-only`
- options include minimum projection requirements:
  - `{ minProjection?: ProjectionName, policy?: CachePolicy }`
- returns cached immediately when possible
- revalidates in background when stale

2. `ensureQuery(queryKey, fetcher, options?)`
- resolves id lists
- upserts returned entities into canonical store
- updates query index atomically

3. `mutateResource(type, id, patch, mutationFn)`
- optimistic patch canonical store
- execute remote `command`/`form`
- reconcile with response or rollback
- invalidate/revalidate affected query indexes

4. `satisfiesProjection(type, have, need)`
- explicit projection hierarchy graph (DAG), not numeric levels
- supports branching schema capability checks

### Cache Policy Semantics
`cache-first`
- if a compatible cached value exists, return it immediately (even if stale)
- no required background fetch by default
- use when minimizing network calls is preferred over freshness

`stale-while-revalidate`
- if a compatible cached value exists, return it immediately
- if stale, trigger a background fetch and update cache when response arrives
- preferred default for responsive UI + eventual freshness

`network-first`
- try network fetch first
- if network fails, fall back to compatible cached value (if present)
- use for views requiring freshest possible server state

`cache-only`
- return compatible cached value only
- never trigger network
- use for strict offline mode or deterministic cache reads

## Projection-Aware Caching
Because list/detail/role payloads differ, cache compatibility must be schema-aware.

For each cached record, store:
- `bestProjection: ProjectionName`

Lookups specify the minimum required projection:
- `ensureResource('organisation', id, { minProjection: 'detail_admin' })`

Cache hit is valid only when:
1. projection requirement is satisfied by the record's best projection
2. staleness policy permits serving current record

## Projection-Aware Cache Model
This section defines concrete types and lookup flow for projection-aware caching in `CacheCtx`.

### Core Types
```ts
type ResourceType =
  | 'organisation'
  | 'project'
  | 'layer'
  | 'feature'
  | 'task'
  | 'hub'
  | 'property'
  | 'user'

type CachePolicy =
  | 'cache-first'
  | 'stale-while-revalidate'
  | 'network-first'
  | 'cache-only'

type ProjectionName =
  | 'collection_user'
  | 'detail_user'
  | 'collection_member'
  | 'detail_member'
  | 'collection_admin'
  | 'detail_admin'
  | 'collection_superadmin'
  | 'detail_superadmin'

interface EntityMeta {
  fetchedAt: number
  staleAt: number
  expiresAt: number
  source: 'remote-query' | 'remote-command' | 'hydration' | 'manual'
  bestProjection: ProjectionName
}

interface QueryIndexEntry {
  ids: string[]
  fetchedAt: number
  staleAt: number
  expiresAt: number
  projection: ProjectionName
}

interface EnsureResourceOptions {
  minProjection?: ProjectionName
  policy?: CachePolicy
}

interface EnsureQueryOptions {
  projection: ProjectionName
  policy?: CachePolicy
}
```

`ProjectionName` values are resource-specific capability labels.  
Phase 1 uses organisation labels; other resources define their own projection names as they migrate.

### Projection Graph
Projection compatibility is an explicit DAG per resource type:
```ts
type ProjectionGraph = Record<ResourceType, Record<ProjectionName, ProjectionName[]>>

// edges: node -> directly implied projections
const projectionGraph: ProjectionGraph = {
  organisation: {
    detail_superadmin: [
      'collection_superadmin',
      'detail_admin',
      'collection_admin',
      'detail_member',
      'collection_member',
      'detail_user',
      'collection_user',
    ],
    collection_superadmin: [
      'collection_admin',
      'collection_member',
      'collection_user',
    ],
    detail_admin: [
      'collection_admin',
      'detail_member',
      'collection_member',
      'detail_user',
      'collection_user',
    ],
    collection_admin: ['collection_member', 'collection_user'],
    detail_member: ['collection_member', 'detail_user', 'collection_user'],
    collection_member: ['collection_user'],
    detail_user: ['collection_user'],
    collection_user: [],
  },
  // Phase 1 only needs organisation entries.
  // Other resources are added as they migrate into CacheCtx.
  project: {},
  layer: {},
  feature: {},
  task: {},
  hub: {},
  property: {},
  user: {},
}
```

`satisfiesProjection(type, have, need)` returns `true` if:
- `have === need`, or
- `need` is reachable from `have` in the graph.

### Suggested CacheCtx Surface
```ts
interface CacheCtx {
  ensureResource<T>(
    type: ResourceType,
    id: string,
    options?: EnsureResourceOptions,
  ): Promise<T | undefined>

  ensureQuery<T>(
    key: string,
    fetcher: () => Promise<T[]>,
    options: EnsureQueryOptions,
  ): Promise<T[]>

  mutateResource<T>(
    type: ResourceType,
    id: string,
    optimisticPatch: Partial<T>,
    mutationFn: () => Promise<unknown>,
    affectedQueryKeys: string[],
  ): Promise<void>

  satisfiesProjection(
    type: ResourceType,
    have: ProjectionName,
    need: ProjectionName,
  ): boolean
}
```

### Lookup Pseudocode: `ensureResource`
```ts
async function ensureResource(type, id, options) {
  const policy = options?.policy ?? 'stale-while-revalidate'
  const minProjection = options?.minProjection

  const entity = entities[type].get(id)
  const meta = entityMeta[type].get(id)
  const now = Date.now()

  const hasProjection = minProjection
    ? Boolean(meta?.bestProjection) &&
      satisfiesProjection(type, meta.bestProjection, minProjection)
    : Boolean(entity)

  const isFresh = meta ? now < meta.staleAt : false
  const isUsable = Boolean(entity && meta && hasProjection)

  if (policy === 'cache-only') return isUsable ? entity : undefined

  if (policy === 'cache-first' && isUsable) return entity

  if (policy === 'stale-while-revalidate' && isUsable) {
    if (!isFresh) void revalidateResource(type, id, minProjection)
    return entity
  }

  // network-first, or cache miss, or insufficient projection
  return await fetchAndUpsertResource(type, id, { minProjection })
}
```

### Lookup Pseudocode: `ensureQuery`
```ts
async function ensureQuery(queryKey, fetcher, options) {
  const policy = options.policy ?? 'stale-while-revalidate'
  const entry = queryIndex.get(queryKey)
  const now = Date.now()

  const usable = Boolean(entry)
  const fresh = Boolean(entry && now < entry.staleAt)

  if (policy === 'cache-only') {
    return usable ? materialize(entry.ids) : []
  }

  if (usable && (policy === 'cache-first' || (policy === 'stale-while-revalidate' && fresh))) {
    return materialize(entry.ids)
  }

  if (usable && policy === 'stale-while-revalidate' && !fresh) {
    void fetchAndUpsertQuery(queryKey, fetcher, options)
    return materialize(entry.ids)
  }

  return await fetchAndUpsertQuery(queryKey, fetcher, options)
}
```

### Mutation Pseudocode: `mutateResource`
```ts
async function mutateResource(type, id, optimisticPatch, mutationFn, affectedQueryKeys) {
  const previous = entities[type].get(id)
  if (previous) patchEntity(type, id, optimisticPatch)

  try {
    await mutationFn()
    // optional: reconcile with returned payload if command returns full entity
    for (const key of affectedQueryKeys) invalidateQuery(key)
  } catch (error) {
    if (previous) entities[type].set(id, previous)
    throw error
  }
}
```

## Refactor Plan

### Phase 0: Guardrails
1. Add debug instrumentation for cache writes in dev:
- remote query updates
- `CacheCtx` entity upserts
- query-index updates
2. Add integration checks for publish/unpublish path (detail + list coherence).

### Phase 1: CacheCtx Foundation (organisations only)
1. Create `CacheCtx` with organisation-only support:
- `entities.organisation`
- `entityMeta.organisation`
- `queryIndex` keys for organisation list/detail
2. Add helper methods:
- `upsertEntity(type, entity, meta?)`
- `upsertEntities(type, entities, meta?)`
- `getEntity(type, id)`
- `patchEntity(type, id, patch)`
3. Add projection graph for organisation payloads:
- e.g. `collection_admin`, `detail_admin`, `detail_superadmin`
- implement `satisfiesProjection('organisation', have, need)`
4. Add `queryIndex` structure and helpers:
- `setQueryIds(queryKey, ids, meta?)`
- `getQueryIds(queryKey)`
5. Wire `AppCtx` to call `CacheCtx` for organisations only; keep existing flow for other resources.

### Phase 2: Organisations Read Path Migration
1. Implement `ensureResource` + in-flight dedupe per `(organisation,id)`.
2. Implement `ensureQuery` + in-flight dedupe per organisation `queryKey`.
3. Migrate organisations vertically:
- detail lookup uses `ensureResource`
- list uses `ensureQuery`
- derive `state.resources.organisation` from canonical entities + query ids in `CacheCtx`
- `AppCtx` consumes derived results from `CacheCtx`

### Phase 3: Organisations Mutation Unification
1. Standardize organisation mutations to remote `command`/`form`.
2. Route optimistic publish/save updates through `CacheCtx.mutateResource`.
3. Define affected organisation query keys and invalidation rules.
4. Remove ad-hoc dual-patching logic for organisations.

### Phase 4: Organisations Persistence + Offline
1. Persist organisation entities, metadata, and query indexes in IndexedDB.
2. Hydrate on app init before first render where possible.
3. Apply stale policy:
- `fresh`: use directly
- `stale`: use + background revalidate
- `expired`: fetch before use (or explicit offline fallback)
4. Optionally align SW cache refresh events with organisation cache invalidation.

### Phase 5: Expand Resource Coverage
1. Port projects to `CacheCtx`.
2. Port layers to `CacheCtx`.
3. Port features to `CacheCtx`.
4. For each resource, add projection graph + affected query rules.

### Phase 6: Cleanup
1. Remove duplicated cache state and one-off sync patches from `AppCtx`.
2. Keep remote query cache usage only at transport boundaries.
3. Finalize entity/query key conventions and mutation invalidation matrix.

## Query Key Conventions
Use stable serialized keys:
- `organisation:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `organisation:get:{id}`
- `project:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `project:get:{id}`
- `layer:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `layer:get:{id}`
- `feature:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `feature:get:{id}`
- `task:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `task:get:{id}`
- `hub:list:{conditionsHash}:{prismsHash}:{sort}:{page}`
- `hub:get:{id}`

Never key by ad-hoc object identity; always key by deterministic serialization.

## Staleness Policy (recommended defaults)
- Detail (`get by id`): stale after 30s, expire after 24h
- Lists (`get collection`): stale after 15s, expire after 1h
- Phase 1 note: apply these defaults to organisations first, then tune per resource as each migration completes.
- Manual refresh should always bypass stale and write-through to canonical store.

## Success Criteria
1. `ResourceIndex` and detail pages always reflect the same entity state after mutation.
2. `type + id` lookups are instant on cache hit.
3. Stale data can render immediately and self-heal via background refresh.
4. Cross-session hydration works offline for recently seen resources.
5. Network usage drops for repeated navigation patterns.
