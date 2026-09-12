# Resource loading and cache architecture

Status: implementation and verification record, 2026-09-12. See the validation
record below for tested behavior and remaining coverage limits.

## Goals and scope

Remove `@tanstack/svelte-query` and its devtools throughout the application. Use
SvelteKit remote queries, forms and commands for transport, deduplication, reactive
query state and mutation refreshes. Keep domain caching and navigation separate.
Migrate organisation, project, layer and feature payload profiles first. Other
resources retain their existing payload contracts while losing the TanStack layer.
Persistence, IndexedDB and cross-session offline support are deferred.

## Findings before migration

- `AppCtx.initialFetch` waits for user state, then organisations/projects, then
  layers/properties, then features. Individual refresh methods also cascade.
- `refresh*` methods call `QueryClient.fetchQuery`, which can reuse a fresh cached
  result instead of executing a remote refresh.
- Panel sections search only their loaded arrays and reset search on array changes.
- Prism reconciliation assumes a loaded collection is complete. A missing row is
  treated as an invalid selection. This is incompatible with pagination.
- Default-layer resolution scans loaded layers and projects. Limiting those lists
  without a separate selection lookup silently loses defaults.
- `syncMap` removes absent entities and preserves existing values, so it neither
  retains previously visited pages nor reliably reconciles updated records.
- Forms already have remote optimistic override helpers, but copying query results
  into AppCtx arrays prevents those overrides from automatically reaching panels.
- Existing resource profiles are `list/card/detail/admin`, not the role-labelled
  projections proposed in the previous version of this document.

## Ownership and single responsibility

### SvelteKit owns active remote queries

A remote query instance owns its result envelope, order, page boundary, pending and
error state. Read `query.current` reactively. Repeated calls with equivalent arguments
are deduplicated by SvelteKit. Keep live handles for visible pages; do not add a
second request-deduplication or optimistic-override engine around them.

Manual refresh calls `query.refresh()`. Await its completion, then read the updated
`current` value; `refresh()` itself returns no payload. Do not assume re-awaiting an
old resolved Promise produces its refreshed value.

The installed SvelteKit implementation retains cached queries while proxies are
reachable. This is transport retention, not a normalized domain graph, an offline
store, a TTL policy or automatic reconciliation between different query arguments.
Do not depend on private framework cache APIs.

### CacheCtx owns retained domain records

Create one context per application instance, never a module-global user data store.
Retain entities by resource type and ID for synchronous presentation and hierarchy
lookups. Detail handles are keyed separately by resource, identity, requested profile
and scope, with fetched timestamps and a scope epoch. A compact entity in the
presentation map is never sufficient evidence for a detail cache hit: required-data
lookups go through the profile-specific handle. Merging a compact presentation row
must not refresh the timestamp of an older detail handle.

CacheCtx owns scope invalidation, pins, profile-specific detail handles and shared
list controllers. AppCtx owns navigation, selection and filters.

### Query indexes: retain native handles

Do not implement the old parallel `queryIndex` of live IDs. SvelteKit owns active
payloads, membership, order, overrides and request deduplication. `ResourceList`
retains native page handles, cursor traversal and view history. Returning to a view
within one minute reuses those handles, including pages previously fetched. Retained
entity maps support cross-page breadcrumb/identity reuse; their contents never
represent a complete server collection.

A committed mutation invalidates retained view history and rebuilds first-page
cursor boundaries. Following pages must be traversed again because an insertion,
removal or reordered row can invalidate their old boundaries. Previously seen
entities remain available in the session. Focus revalidation follows the same
boundary reset, avoiding inconsistent combinations of newly refreshed first pages
and older later pages. Transient errors retain a same-view presentation fallback;
authorization/not-found failures discard that fallback.

## Profiles

Profiles describe payloads, not roles:

| Profile | Contract |
| --- | --- |
| `compact` | Identity, localized names/short names, ancestor IDs and breadcrumb labels, plus explicitly required list-action flags. No images, property graphs or full descriptions. |
| `default` | Ordinary display and application logic; point geometry for features and required map/filter fields. |
| `map` | Default plus non-point geometry. Initially equivalent where resources have no additional geometry. |
| `full` | All public details, including map geometry where applicable. |
| `admin` | Full plus administration fields, individually authorized on the server. |

Define schemas and compatibility per resource. Use the chain only when actual
schemas are supersets; do not claim admin implies another shape when fields are
omitted or represented differently. Authorization remains mandatory for every
query and mutation. Requesting an admin profile is not an authorization grant.
Migrate `list/card/detail` callers explicitly and document compatibility aliases if
retained during rollout. Never return richer role-specific fields under compact.

## Panel paging, search and rendering

- Start organisation, project and layer collections independently and in parallel.
  Each request returns at most 25 results. Each section renders as soon as ready.
- Use deterministic server ordering with ID as the final unique tie-breaker.
  Cursor identity includes scope, filters, normalized search, locale, profile and
  sorting. Reject mismatched cursors. Prefer keyset pagination; offset pagination
  alone cannot guarantee stable traversal during concurrent writes.
- Prefetch the next 25 when the visible range is within 10 rows of the loaded end.
  Permit one next-page request per list and stop at `hasMore = false`.
- Retain fetched pages for backwards scrolling. Use TanStack Virtual for lists over
  25 logical entries; render a bounded window, not all fetched rows. Keep overscan
  explicit and account for variable breadcrumb/row heights.
- Pin active selections independently of search and paging. Deduplicate pins from
  the result list. A page miss never deselects a resource. Validate unavailable
  selections through authorized lookup responses, not absence from a page.
- Debounce find-ahead search (initially 200 ms), query the full authorized set on the
  server, and return 25 per page. Reset cursor/window on query or scope changes.
  Keep search text stable across background refreshes and mutations.
- Obsolete work must never replace the current list. Use scope/query generations
  after every await. Abort requests only where supported by the transport; remote
  query APIs do not imply an AbortSignal facility. Ignore obsolete responses and
  stop scheduling obsolete next pages when cancellation is unavailable.
- Expose initial loading, incremental loading, empty, error and retry states.
  Failed next-page requests retain previous pages and the current scroll anchor.
- Sorting applies to the full server set, not merely the loaded subset.

## Breadcrumbs and initial loading

Benchmark two equivalent authorized compact projections: direct ancestor joins
versus page results followed by deduplicated compact ancestor lookups. Join using
existing organisationId/projectId columns directly; avoid a client hierarchy
waterfall. Limit the base page before one-to-many locale joins so duplicates cannot
consume the 25-row limit. Do not join unrestricted private ancestor fields.

Prefer minimal joined breadcrumb labels if the measured database/payload cost is
small. Otherwise render rows immediately and skeleton only unresolved breadcrumbs.
Use cached ancestors immediately and `query.batch` for missing IDs, partitioned by
resource, profile and admin/public intent. Batch SQL as well as HTTP: looping over
single-record database reads inside query.batch does not solve N+1 reads.

Retain benchmark code and report dataset size, query count, payload bytes, warm/cold
conditions, repetitions and median/p95. Local SQLite timing measures database cost,
not deployed D1 or browser latency. Do not present simulated network delays as
production measurements.

## Default layers and progressive features

Default selection is a separate lightweight authorized lookup over the complete
eligible layer set, with existing hub defaults and user preferences preserved.
It must not depend on the first 25 panel rows. Resolve metadata needed for selected
layers and their projects independently, including map styles and filter fields.

Fetch features only for currently enabled layers, including every layer enabled by
existing initial-default rules. Use bounded pages (initial target: 250 features) and
bounded concurrency. Commit each successful page so the map appears progressively.
Do not issue an unscoped feature query when no layers are active.

Track loading/partial/complete/error per selection generation and layer. On selection
or authorization change, invalidate the generation, remove obsolete visible features,
and stop fetching old pages. Reuse compatible cached features without assuming the
layer is complete. Deduplicate by ID and preserve retry cursors. Display incomplete
loading status; do not label partial counts as final totals. Yield between batches
and avoid rebuilding all derived map indexes repeatedly for each individual feature.

## Freshness and security boundaries

- Detail freshness: 5 minutes. Collection freshness: 1 minute.
- TTL means eligible for revalidation when accessed/focused, not polling every cached
  page. Refresh only visible pages and selected detail resources.
- Mutations and explicit manual refresh bypass TTL immediately.
- Serve compatible stale data during background refresh and surface refresh failures.
  No cross-session offline guarantee is made in this phase.
- Scope includes user identity, anonymous/account status, effective permission
  signature, hub, admin/public surface and locale where output depends on locale.
- Flush retained entities, page history and active handles when scope changes.
  Advance an epoch first so prior in-flight responses cannot repopulate the cache.
  Remote query arguments must distinguish scopes, or explicitly revalidate before
  exposing reused results. Client scope keys never replace server authorization.
- A permission/not-found response must remove inaccessible data rather than falling
  back to stale privileged data. Ordinary transient failures may retain compatible
  current-scope state.

## Mutations and optimistic collections

Use shared mutation adapters for form/command submission and resource-specific
pure projection functions. Every editable visible collection reads reactive query
state, so overrides propagate immediately without an extra AppCtx copy.

For known detail keys, use server-driven `.set()` with the authorized saved payload
or `.refresh()` where another read is required. For filtered/paged lists, the client
supplies relevant query handles through `submit().updates(...)` or command updates.
On the server, explicitly accept bounded requested refreshes using `requested`.
The installed API requires handling client-requested refreshes; requesting them on
the client is not a substitute for the server policy.

Use `.withOverride(...)` for pending edits. Patch existing rows and breadcrumbs,
remove rows that definitely cease matching, and show pending creates with temporary
IDs. Do not insert creates into every search/page or fabricate cursor positions.
For uncertain membership/order, keep a pending row outside the server page boundary
until refresh confirms it. Clear overrides on validation failure, exceptions and
success, including redirect paths. Concurrent rollback must not overwrite a newer
successful mutation. A successful save followed by a failed refresh is a saved
mutation with stale-read feedback, not a failed save.

Rename changes refresh descendant breadcrumbs. Publish/archive/move changes also
invalidate descendant membership and default selections. Role changes flush the
whole scope. A mutation matrix must cover organisation/project/layer/feature create,
edit, rename, publish/archive, move and delete, plus existing other-resource forms.

## Implementation order and verification

1. Record initial request graph, payload sizes, database benchmark and typecheck
   baseline. Inventory TanStack consumers and existing mutation adapters.
2. Remove the TanStack provider and all consumers; route explicit refreshes through
   native query handles. Preserve identity-generation guards.
3. Introduce profile schemas and authorized compact page/selection queries. Test
   paging, search, scope validation, batch limits and breadcrumb authorization.
4. Add retained domain cache and shared paged panel controller. Migrate Admin/Prisms,
   including narrow/collapsed states and pinned entries, to reactive query results.
5. Separate default selection and progressively load features with cancellation and
   partial-state handling. Measure first-row and first-feature latency.
6. Connect forms/commands to visible collection overrides and bounded requested
   refreshes. Verify create/update/delete, membership changes and rollback.
7. Run focused tests, the full suite, build and real-browser checks. Confirm no
   TanStack Query dependency/import remains; TanStack Virtual is intentionally kept.

Browser acceptance includes more than 50 results, fetch at the 10-row threshold,
backwards scrolling without redundant fetches, bounded DOM rows, remote search for
an initially unloaded item, selected items outside page one, stale search responses,
progressive features, auth changes during requests, and optimistic admin edits
without hard refresh. Record any unavailable authenticated browser coverage.

## Validation record and follow-ups

- TanStack Query and its devtools have no remaining runtime imports or package
  dependencies. TanStack Virtual remains intentionally installed.
- Native query controllers, scope rejection, 25-ID batch partitioning, stale-search
  suppression, stable cursor SQL and immutable optimistic projections have focused
  regression coverage. Cursor tests include nulls, tied localized values, descending
  order and insertions before the cursor.
- A Chromium fixture using the actual shared virtual-list component retained 75
  records after three 25-row loads, mounted 11 rows, triggered the next page at the
  ten-row threshold and reused previous rows without another fetch when scrolling
  back. It produced no page errors. This fixture isolates rendering from auth/D1.
- An application browser trace started all three collection requests and default
  metadata together. Full application/admin interaction coverage is separate from
  the isolated component check; local D1 contention has interrupted guest bootstrap.
- The warm local breadcrumb benchmark (8 organisations, 7 projects, 16 layers;
  100 warmups and 1,000 repetitions) measured joined labels at median 0.01258 ms /
  p95 0.01411 ms versus three batched reads at 0.01143 ms / 0.01281 ms. Payloads were
  3,560 versus 2,212 bytes. Keep direct joins: the small CPU/payload difference avoids
  two round trips. These figures exclude network latency and production D1/auth
  work; repeat against representative production-scale data before claiming a
  production speedup. Reproduce with `scripts/benchmark-resource-breadcrumbs.ts`.
- Advanced admin index filters still evaluate loaded rows where no equivalent
  server predicate exists. Search, publish/archive filters and sorting are remote;
  image/authorship/translation predicates need a separate server-contract migration
  before they can promise matches across unloaded pages.
- `list/card/detail` are compatibility selectors during the profile migration;
  they are not aliases for authorization roles. Offline persistence is deferred.

## References

- [Query deduplication](https://svelte.dev/docs/kit/remote-functions#query-Deduplication)
- [Refreshing queries](https://svelte.dev/docs/kit/remote-functions#query-Refreshing-queries)
- [query.batch](https://svelte.dev/docs/kit/remote-functions#query.batch)
- [Forms](https://svelte.dev/docs/kit/remote-functions#form)
- [Server-driven refreshes](https://svelte.dev/docs/kit/remote-functions#Single-flight-mutations-Server-driven-refreshes)
- [Client-requested refreshes](https://svelte.dev/docs/kit/remote-functions#Single-flight-mutations-Client-requested-refreshes)
