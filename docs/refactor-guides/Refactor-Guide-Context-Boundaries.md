# Context boundaries and resource queries

## Ownership

Hype is one SvelteKit application. The root layout creates `RootCTX`, which owns
shared identity, hub resolution and a request-local `CacheCtx`. Shared theme and
responsive providers live at this layout. There is no module-global `AppCtx`
fallback.

| Owner | Responsibility |
| --- | --- |
| Remote functions and server services | Query implementation, validation, authorisation and response profiles |
| SvelteKit native queries | Active payloads, request deduplication, refresh and optimistic overrides |
| `CacheCtx` | Scoped native-handle retention, active-controller registration, freshness, invalidation and optimistic reconciliation |
| `ResourceClient` and typed providers | Standard detail/collection APIs, bound access metadata and profile inference |
| `ResourceViewCtx` | A surface-local resource view, including existing selection, navigation, presentation projections and adapters |
| `AppCtx` | Public map bootstrap, viewport queries, map rebounding and public application orchestration |
| `AdminCtx` | Admin queries and editing/navigation state, using its own `view: ResourceViewCtx` |
| `{Hub}DashCtx` | Future hub workflow state, using injected resource capabilities; Breadline uses `BreadlineDashCtx` when needed |

`ResourceViewCtx` is shared implementation, not a shared singleton or another
application. `AppCtx` extends it; admin constructs its own instance. A dashboard
can use `ResourceClient` directly without constructing either existing surface.

The `(public)` route group owns the public app, sign-in/sign-up map landing,
screensaver and headless map-render routes. URLs are unchanged. `/admin` owns its
own view and does not construct `AppCtx`. Its initialisation loads only the
selected resource; hierarchy panels load their own independent pages. App and
admin filters and selection are independent. Leaving a surface releases its view
state rather than carrying its selection into the next surface.

## Standard internal API

`ResourceClient` is injected with the root cache, a current-scope getter, the
surface's isolated record store, and an access-intent getter. Controllers are
inert until loading is requested. The hierarchy provider preserves native remote
profile inference:

```ts
const project = view.hierarchy.projects.detail({
  ref: projectId,
  meta: { profile: 'detail' },
})
await project.load()
// project.data remains connected to native optimistic overrides.
project.release()

const projects = view.hierarchy.projects.createList({ profile: 'compact' })
await projects.load({ q: search, prisms, sorting })
await projects.next()
await projects.refresh()
projects.release()
```

Details expose `data`, `loading`, `error`, `load()`, `refresh()` and `release()`.
Collections expose `rows`, `loading`, `error`, `isInitialised`, `hasMore`,
`load(input)`, `next()`, `refresh()`, `revalidate()` and `release()`. Collection
inputs contain view intent; the client supplies resource family and access/cache
metadata. Counts are not invented for endpoints that do not provide them.

The lower-level typed `client.detail(resource, input, nativeFactory)` supports
other resource families. Domain-specific dashboard collections should supply
appropriate typed traversal/providers rather than forcing events through the
hierarchy endpoint. `client.createList(type)` is the lower-level full-input
traversal interface used by existing surface orchestration; normal view adapters
use `createCollection` or the typed hierarchy API.

Existing detail-by-ID helpers now delegate through the resource client. Existing
resource view arrays/maps remain presentation projections for adapters and
synchronous navigation; they are not the authority for typed detail profiles or
query membership. Native detail handles distinguish complete input, profile and
access identity. No full-record cache is shared between app and admin views.

## Cache and lifecycle rules

- The root cache is created per layout instance, including SSR. Identity, anonymous
  promotion, roles, super-admin status and hub changes invalidate incompatible
  retained data. Locale and surface intent participate in resource-client scope.
- Each surface gets separate raw record maps. Compatible native details can be
  reused across surface lifetimes without treating privileged records as public
  state. The native query arguments also include client scope; it never grants
  server-side authority.
- Lists and feature controllers belong to their consumers. `CacheCtx` registers
  them for reconciliation instead of constructing fixed app/admin slots. Named
  public feature controllers are lazy and owned by the resource client.
- Public feature traversal mechanics are supplied by `mapResourceProviders`.
  The root does not import those mechanics. Admin supplies ordinary resource
  providers, and the public layout installs its map providers.
- A view's `dispose()` invalidates pending resource commits, releases controllers
  and raw records, and detaches its admin feature collection. It does not clear
  another view or all compatible retained details.
- `release()` supersedes pending traversal and unregisters refresh targets.
  It does not imply cancellation of shared native transport. Scope generations
  prevent old detail responses from being exposed after identity changes.
- Inactive detail retention is bounded to 128 entries while active consumers stay
  pinned. Hierarchy traversal retains at most 12 prior query identities. Feature
  traversal retains its existing entity/query/page bounds.
- Mutations go through `ResourceClient.beginMutation` and settlement/rollback.
  Optimistic patches affect the originating access scope and its view stores;
  an admin patch cannot inject fields into a retained public detail. Successful
  reconciliation invalidates retained queries and refreshes registered active
  collections, including cursor membership when needed.
- Image controllers receive narrow resource/view capabilities explicitly. Their
  provider disposes listeners and supersedes pending reads when unmounted.

## Import boundaries

Root and admin shell code imports the components it actually uses. Broad layout
and panel barrels previously pulled `MapCanvas` into unrelated entry points.
Keep optional map UI at the public or explicit map-widget boundary. Do not add a
root provider barrel that imports every application or dashboard implementation.

Shared controller implementations remain reusable without running public
bootstrap. Root readiness is identity/hub readiness, not completion of resource
queries. Each surface owns its loading/error behavior and retry flow.

## Verification

The refactor has focused coverage for independent admin initialisation, separate
query maps/filters/record stores, scope and profile isolation, stale responses,
controller release, access-bound collection inputs, native cache reuse, optimistic
rollback, image lifecycle behavior and public/admin mutation isolation.

A production build passes. Static dependency traversal of its manifest finds no
`MapCanvas`, MapLibre, or public `AppCtx` chunk in the root or admin layout
closures; the public layout includes its map dependencies. Browser checks confirm
the privacy route loads without map-module requests and the sign-in map landing
renders without page errors in the initial smoke run. A final repeat timed out
while the development server was handling regenerated build files; it did not
provide additional browser acceptance evidence.

Authenticated admin browser acceptance remains unverified: a fresh browser is
redirected to public sign-in by the existing access guard. Context tests and
production dependency evidence do not substitute for that signed-in workflow.
Repository-wide `svelte-check` retains its pre-existing diagnostics; compare
against the saved baseline rather than treating this repository as globally clean.

Final focused validation: 90 tests across 11 files pass, and the production build
passes. Normalising moved source paths, the full type-check adds no diagnostics
to the existing baseline of 984 errors and 20 warnings in 184 files.
