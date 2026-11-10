# Component Architecture

This document defines the UI layering model for Bits components and how logic should be
distributed.

## Form card spacing

Use 32px (`gap-8`) between separate cards in every form, on both axes, including stacked
cards and grids with two, three, or four columns. Keep responsive column calculations in
sync with that gutter; `FormGrid` budgets 32px per gap. Use `gap-8` on custom card
containers and the same 2rem value in shared CSS. Card-internal controls, toolbar items,
and continuous rows separated by dividers retain their own compact spacing.

## Route Context Ownership

Hype remains a single SvelteKit application. Hub mini-apps and dashboards do not require
a monorepo or separate frontend deployments.

| Context        | Owner                                          | Responsibility                                                                                                 |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `RootCTX`      | Root layout, shared by all routes              | Shared session, locale, theme, responsive state, resolved hub identity and background mutation jobs            |
| `CacheCtx`     | Root layout instance, coordinated by `RootCTX` | Scoped resource retention, invalidation and optimistic reconciliation, accessed through typed resource clients |
| `AppCtx`       | Public Hype app layout                         | User-facing app state, including the map, feature collections, filters, panels and app navigation              |
| `AdminCtx`     | `/admin` layout                                | Admin resource views, editing, filters and admin navigation                                                    |
| `{Hub}DashCtx` | The corresponding hub dashboard layout         | Hub-specific operational workflows; use `BreadlineDashCtx` for Breadline                                       |

Keep the exact `RootCTX` spelling. Dashboard context names use the hub name in
PascalCase followed by `DashCtx`. Introduce a dashboard context only when its routes
need shared state or orchestration; individual views can keep local state. The public
app includes the hub-branded map experience described in the
[Breadline mini-app specification](../spec/breadline/breadline.v4.spec.md#mini-apps).

Surface contexts consume shared state from `RootCTX`. Admin and hub dashboards must not
require `AppCtx` or the map bootstrap to initialise. Share domain services, contracts
and reusable UI through their owning modules rather than coupling one surface context to
another. Context state supports the UI; server-side services remain responsible for
authorisation and domain invariants.

The root layout creates `RootCTX`. The `(public)` layout creates `AppCtx`; `/admin`
creates `AdminCtx`. Both surfaces compose a `ResourceViewCtx`, exposed as `appCtx.view`
and `adminCtx.view`; neither inherits resource behavior. `ResourceViewCtx` is reusable
surface-local implementation, not a root singleton. Reusable UI resolves that view
through `getSurfaceCtx()` or receives explicit adapter props. Only public map code
should require `getAppCtx()`.

Resource query ownership and the standard internal API are defined in
[Context boundaries and resource queries](refactor-guides/Refactor-Guide-Context-Boundaries.md).
Surface contexts own query intent and traversal. `ResourceClient` binds access metadata,
while `CacheCtx` retains compatible native handles. SvelteKit remains the owner of
remote payloads and transport deduplication. Dispose view controllers on unmount; keep
public map mechanics out of root and admin imports.

Draft creation lives in `FeatureDraft` (`view.draft`). Panel commands and URL state use
`PanelController` (`view.panels`); keyboard registration belongs to
`SurfaceInteractions` (`view.interactions`). These owners receive explicit capabilities
rather than the entire resource view. Use them directly instead of adding forwarding
methods to the view. View disposal releases keyboard listeners and pending panel focus,
and account changes discard creation drafts.

Hierarchy selection belongs to `view.scope`, filters and query inputs to `view.filters`,
and loading/result projections to `view.queries`. Wishlist and visited membership belong
to the root account's `collections`, shared across surfaces. Use these owners directly
rather than adding forwarding APIs. Public map visibility, selection and camera
orchestration remain on `AppCtx`.

## Startup dependency boundaries

Use skeletons for pending content, including deferred sections, forms, search results,
and pagination. Trace the loaded component before choosing a skeleton: preserve its
viewport, grid, row height, typography, padding and responsive breakpoints. Deferred
sections must supply a content-owned `pending` snippet; the shared loader must not guess
its layout. Prefer the real component's loading mode or render the same presentation
inside `ContentSkeleton`. Use `LoadingSkeleton` only for individual text values; pass
known eventual text to reserve its exact wrapping and font metrics. Do not insert a
loading row beside content that remains mounted. Unknown first-response row counts and
text lengths cannot have an exact natural-height reservation; retain existing content on
refresh and preserve the owning viewport for initially unknown collections. Verify
pending and ready bounding boxes at narrow and wide widths. Keep loading labels
accessible through `aria-label` or screen-reader-only text, never as visible placeholder
copy. Preserve retry controls, retained results, and reduced-motion behavior.

Admin navigation renders after authenticated surface setup. Bootstrap wires query owners
without fetching duplicate lists; each index owns its initial rows and retries. Exact
index totals use separate count-only requests with the same authorization and filter
predicates, so counting never gates the first visible page. Feature index summaries
retain properties, one thumbnail and image completion counts, while detail requests own
full image galleries.

Quick return visits can reuse verified native results for one minute. Retention is
limited to 32 browser query handles; mutations, identity changes, errors and explicit
retries invalidate freshness. Do not introduce a second copied entity cache. The public
`(app)` server layout owns hub subscription state; shared root metadata must not query
subscription state on admin requests.

Browser authorization consumers use `authz/hubPolicy.ts`, `authz/layerPolicy.ts` and
`authz/shared.ts`. The `hub.ts` and `layer.ts` facades retain database query adapters
for server callers. Keep shared presentation constants out of database service modules.
Policy refactors must retain the existing server authorization decisions.

Map pickers and theme preferences use `map/styles/metadata.ts` and `catalog.ts`. Only
renderers and asset generation import `registry.ts` and `builders.ts`. Catalogue entries
contain presentation metadata, not executable style builders. Run
`bun scripts/checks/admin-startup.ts` after a production build to inspect the actual
production route dependency closure; development route node numbers differ. Use
`--details` to check the six resource detail routes as well. Detail pages import
components directly. Optional history, messaging, embedded indexes and galleries use
`custom/deferred/Deferred.svelte` inside their existing active/visited facet boundaries.
Keep visited editors mounted to preserve unsaved work; a failed chunk must offer retry
without hiding navigation. Required form data stays complete before editing begins.

## Account and Map Ownership

`RootCTX.account` owns `AccountState`. Its authoritative session identity and roles are
separate from self-profile enrichment (preferences, display fields and saved layers).
Surfaces receive that same account instance and expose a read-only `user` snapshot.
Profile responses are restricted to presentation fields; another user's profile stays in
its resource cache or profile panel. Async saves capture the account revision so
responses and rollbacks cannot cross identity or role changes.

Only the root publishes session changes. Surface layouts call `syncAccount()` to clear
their own identity-bound data after a change; resource views never replace the session.
`isInitialised` means the resource view's initialization is complete, not that a map has
loaded.

Native MapLibre instances and marker DOM elements belong to the renderer.
`AppCtx.mapController` holds only the public map's camera capability, supplied by
`MapCanvas.onMapReady` and cleared on teardown. Other map renderers, such as the
screensaver, have their own controllers. Shared creation flows receive a `getMapCenter`
callback; marker transitions receive the clicked element directly. `ResourceViewCtx` and
admin views require neither a map instance nor a DOM registry.

## Navigation, Selection and Resource Presentation

`ResourceViewCtx` owns resource queries, filters, sorting and retained data. It has no
navigation, selected feature, header state or list-presentation preferences. The public
`AppCtx` and `AdminCtx` each own a `SurfaceNavigation`, provided beside the resource
view through `getSurfaceNavigation()`. Their layouts project the current SvelteKit URL
on initial render and subsequent navigation, including shallow facet changes and browser
history. Navigation commands update the URL; page configuration can supply supported
facet defaults without maintaining a second route store. Resource references resolve
against the owning view's cache.

`AppCtx.selection` owns the selected feature identity and active collection. Cards
resolve fresh data for that identity; the selection retains a preview if its query page
is evicted. Map markers derive their selected ID and highlighted collection IDs from
this same model. There is no separate selected-marker store. Collection context survives
feature stepping and feature-only dismissal; returning home, clearing the collection,
account changes and disposal clear selection. Public card timers, navigation intent and
camera commands belong to `AppCtx` and its adapters. Shared filter services only mutate
filter data.

Admin feature and task indexes treat empty prisms as all records the caller is permitted
to read, subject to explicit state and search filters. Clicking Features or Tasks in the
admin menu preserves the current organisation, project, and layer prisms, including an
empty selection. Menu navigation and direct index URLs do not select a layer. Saved
default map layers initialise the public map only; admin starts without hierarchy
selections. Server permissions constrain task lists to the union of owned organisations
and managed projects independently of prism selections, with hub administrator access
resolved by the existing policy.

`AdminCtx.listUi` retains per-resource layout mode and control-bar visibility within
that surface. `HeaderCtrl` owns transient search focus, page metadata and action
visibility; the header adapter combines those with navigation and list preferences.

Admin feature indexes use `FeatureIndexQuerySchema` and `getFeatureIndexPage` for
prisms, status/content/image/licence/translation/field filters, search and sorting.
Loaded rows provide an optimistic local preview; only a response for the current query
replaces rows and publishes an exact count. Counts show a skeleton while pending and
never use the loaded row count. Draft exclusion and authorization are applied by the
ordinary server feature-list policy before view filters narrow it.

The initial page requests its count; continuation, bulk-selection and neighbour queries
use `includeCount: false`. ID-only traversal uses `idsOnly: true`. Counts reuse
maintained status bins where compatible, otherwise a SQL aggregate cached by authorized
predicates and database revision. They do not hydrate feature relations or compute
geographic facets. Migration `0178_feature_index_counts.sql` adds scope indexes and
invalidation for image, translation-generation, field, licence and contributor changes.
Apply it before deploying the filtered reader. Detailed cache misses still evaluate
matching candidates; literal substring search uses FTS candidates for text plus scoped
ID/contributor checks. Local and server search share SQLite-compatible ASCII case
folding and literal punctuation matching. Search focus resets on route navigation. The
unused legacy header store has been removed rather than extracted into another context.

Organisation, Project and Layer indexes use the same `getResourcePage` collection
interface as hierarchy panels, with `indexFilters` and `includeCount: true` on the first
page. Status, manual content, translation, image and project licence predicates are
applied before pagination and counting. Hubs use these predicates through their existing
authorized list query. These smaller resources use direct SQL counts; they do not need
the Feature revision cache. Search matches literal identity/code and localized name,
short name and description, plus domain for Hubs.

`ResourceCollection.totalCount` is authoritative for the current access/query scope, or
null while unavailable. Index controls show a skeleton during debounce and first-page
resolution; loaded rows are filtered optimistically until the server supplies the
matching set. Query inputs snapshot nested filters so toggles cannot mutate retained
query identities. Continuations omit counts and detect more rows with a bounded
lookahead; cursor predicates never constrain the full matching total. Hierarchy panels
do not request counts. Server membership is not filtered again against incomplete client
relation caches after it resolves.

Task indexes include search, review action and outcome in their server query and query
identity; the control bar uses the existing authorized queue total. Hubs and Tasks
retain their existing complete-list traversal. Location indexes count the same
ownership, kind, lifecycle and text predicates as their pages, omitting the cursor and
avoiding relation hydration for counts. Location continuations skip counts. Users retain
their existing server-filtered directory and total.

Admin Feature previous/next navigation retains the index's ordered matching IDs,
including remote search results and every active view filter. The temporary search-focus
display cap does not limit traversal. Account, prism, locale, sort or filter changes
invalidate that sequence. Direct detail visits resolve neighbours in the background
through authorized pages of at most 250 IDs; content/property filters use 50-card pages
with the existing predicates. Text searches use the same server search as the index.
Stop fetching when the next neighbour is known or the matching collection ends.
Traversal stops at either end and never falls back to unfiltered neighbours when a
Feature is outside the matching list.

Feature detail readiness depends on the requested record, never the index or its parent
cards. The first Feature response projects two effective presentation-policy flags so
the initial editable frame respects Layer overrides; independently loaded Project/Layer
records remain the policy owners. Locale defaults reuse their shared cache. Location,
Photos, and saved-only Updates mount on first visit per Feature, then remain mounted to
preserve drafts across tab changes.

The admin Feature index owns its initial 50-card page and loads further pages on demand.
Empty filtered pages continue while more data exists; errors retain visible rows and
allow retry. Returning from a detail reuses pages in the same scope. Initial reads and
continuations reject obsolete account, hierarchy, sort and search scopes. Native
first-page optimistic overrides preserve appended pages. Completion totals are shown
only when the matching collection is fully loaded.

## Responsive and Surface Layout Ownership

`ResponsiveCtx` is root-owned browser measurement state: layout viewport, visual
viewport, offsets, and keyboard inset. It does not own panels or main-element
measurements. Shared chrome breakpoint policy lives in `src/lib/layout/chrome.ts` and
has no Svelte/context dependency. Viewer-specific breakpoints stay with the viewer.

Each `ResourceViewCtx` (including `AppCtx`) owns a `PanelController` at `panels` and a
`SurfaceLayout` at `layout`. `panels.state` is the canonical logical and visual panel
state, including panel metadata; no root mirror is maintained. Use controller mutation
methods to preserve opening recency. URL synchronization, focus and profile loading
remain surface orchestration. Visual-only openings do not reserve content width or
affect resize arbitration.

`setSurfaceCtx` provides that surface's layout through a lightweight layout context.
Patterns can read geometry without importing resource orchestration. Standalone patterns
use local, unmeasured layout models; they never publish surface state at root scope.
`Main.Root` reports dimensions through `onDimensionsChange`, wired by its owning route.
The app shell measures its own main region. A surface's measured width and panel state
must never affect another surface.

Keep layout viewport width (panel arbitration), visual viewport dimensions
(keyboard/visible content), and effective main width (space after logical panels)
distinct. Menu reservation intentionally uses layout viewport height and effective main
width; shared chrome policy accepts explicit dimensions from its caller.

## Layering

1. `src/lib/bits/custom/{componentType}/src/*`

- Lowest-level subcomponents.
- Raw HTML structure only.
- Headless by default; no app/domain coupling.
- No component-theme styles applied here.

2. `src/lib/bits/custom/{componentType}/{ComponentType}.svelte`

- Smallest complete reusable custom component.
- Composes only local subcomponents.
- Provides default classes/styles.
- Allows style extension via `class`.
- No app/domain coupling.

3. `src/lib/bits/core/{componentType}/{ComponentType}.svelte`

- Same as 2, but but built from official Bits UI primitives.

4. `src/lib/bits/patterns/{componentType}/components/*`

- Pattern subcomponents that adapt core/custom components to app usage.
- Can include conditional rendering and UI behavior.
- Should remain context-agnostic where possible.

5. `src/lib/bits/patterns/{componentType}/{ComponentType}.svelte`

- Pattern composite.
- Mostly routes nested props to pattern subcomponents.
- Minimal orchestration state only.
- Avoid direct app context coupling unless unavoidable.

6. `+page.svelte` / `+layout.svelte`

- Consumption boundary.
- Owns app wiring, state ownership, and side effects.
- Owns controller intent (for example `HeaderCtrl`) for page-level visibility/mode
  overrides.
- Integrates with `appCtx`/`adminCtx`.
- Builds/uses an adapter model (for example `createAdminHeaderModel`) to map app/context
  state into pattern props.
- Passes controlled/bindable state + callbacks into patterns via the adapter output.

## Development Feature Drafts

The admin New Feature route checkpoints incomplete field values, its active facet, and
Location discovery/identity choices to account- and tab-scoped `sessionStorage` during
Vite development. Refreshes retain progress, while each tab/window writes and resets its
own draft. Duplicated tabs may inherit an initial copy but then evolve independently;
old shared localStorage checkpoints are not restored. `src/lib/client/devFormDraft.ts`
disables storage access in production and SSR and tolerates disabled/full storage. The
route owns restoration and the development-only Start over action;
`DraftFeatureLocationSearch` exposes serializable progress without retaining DOM,
callbacks or live requests. Restoring progress never replays selection or submit
actions. Successful creation clears the checkpoint. Header Reset on NEW and Start over
share the same complete reset of fields, naming choices, Location discovery and browser
history selection state. Discovery Back remains the separate action for retaining search
results. Saved Feature editors and the public contribution flow are unchanged.

## Feature Card Presentation

`src/lib/features/cardStyle.ts` owns stable presentation codes and SVG preview paths.
`full` renders the standard card; `no-description` renders the compact title/action band
and raised map portal. The renderer mapping stays separate from user-facing, localized
names. `conditional` selects Full when the localized description has content and No
Description otherwise, reusing both existing renderers. Empty rich-text paragraphs and
placeholder dashes count as no content. Both variants reuse the viewer, actions and
contribution forms.

Migration `0094_conditional_card_style.sql` adds the Conditional choice without changing
existing selections. Migration `0093_card_styles.sql` registers the catalogue in
`cardStyle` and adds `project.cardStyleCode` as a foreign key. Existing projects are
initialized to `full` by that original migration; existing saved choices are preserved.
Null/absent project choices now resolve to Conditional, and new project forms explicitly
save Conditional. Layer overrides use validated `metadata.cardStyleCode`, like layer
map-style overrides. Clearing an override removes the metadata key and inherits the
project, without discarding map or other metadata. There is no remaining neon-specific
selection rule.

Project and layer Profile tabs share `FormCardStyleSection`, SVG choice previews, and
the same selection primitives as map styles. Project changes pass the existing project
write policy; layer overrides pass the existing metadata write policy. Both use the
remote form's optimistic-concurrency, save, reset and validation flow. Public project
ancestors and layer profiles expose the selected codes so direct feature links resolve
layer override, project choice, then Conditional.

To add a style, add its code/renderer/preview to the catalogue, localized labels to the
selector, and a migration registering the code in `cardStyle`. Implement a new display
body at the card composition boundary rather than copying entire cards. Apply normal D1
migrations before deploying code that reads a new column. Renderer identities are
code-owned rather than editable admin resources; no separate catalogue sync command or
media upload is required for these bundled SVG previews.

## Help Overlays

`SimpleTooltip` uses the shared Bits popover primitive for hover previews and click/tap
activation. Clicking keeps help open until the trigger is activated again, Escape is
pressed, or the user interacts outside. Keyboard activation of nested buttons retains
the button's action. Controlled notices can still bind `open` and override the content
role. Image controls use this same behavior. Scrolling a trigger's ancestor or resizing
the viewport dismisses its help; an overlay must not remain attached to a row that has
scrolled away.

Help content is portaled and positioned relative to the viewport. Opening or closing
help does not trap focus, lock scrolling, or move focus into the overlay; form geometry
and scroll positions must remain stable.

## Project Advanced Settings

Tracking: [#232](https://github.com/tijptjik/hype/issues/232).

The project Advanced tab stores evolving boolean UI preferences in `project.flags`
(JSON), validated by `ProjectFlagsSchema`. Missing keys inherit application defaults.
`show3dAddressOptions` defaults to true and makes optional portion, unit and floor
controls available in Add detail, ordered from specific to broad. Existing values remain
visible when enabled; empty fields are added explicitly. Entry uses the app locale with
separate Floor type and Unit type dropdowns and validation. `address.unitDetails`
retains SaanSeoi's shared `unitRef`, `unitType`, `floorRef`, `floorType`, and
`unitPortion` fields. Original expressions stay in locale overrides; recognized
semantics generate other languages and display text. Unknown expressions remain literal
(`X`), without invented source unit IDs. Source inventory selection remains available
when compatible data exists. HYPE does not store a local granularity enum or a local
inventory ID in these details. Room is `unitType: "R"`, at the same level as flat, shop,
and other units; a portion is `unitPortion`. Floor `R` means Roof and belongs only to
`floorType`. The local schema rejects `id`, `granularity`, `room`, and `room_part` keys.
A selected source unit may retain its external ID only in `source.address3dUnitId`; raw
source records remain unmodified evidence, including any upstream granularity labels.
Feature-local `address.accessHints` stores localized directions separately from the
building/unit evidence and display address, matching SaanSeoi's Place-level ownership of
`accessHint`. Disabling 3D options preserves parsed details and saved selections.
Compact project responses retain flags for the Feature parent selection flow. Changes
use the normal project form, write authorization, and optimistic concurrency checks.
Migration `0126_project_flags.sql` adds the JSON column and must precede deployment.

## Task review workspace

The task route owns the native editor query, review mutations, header actions and image
context. Observe the query's `current`, `ready` and `error` state instead of awaiting it
before mounting the workspace. Queue data is a read-only presentation preview; review
controls require the authoritative editor response. Pending headers must clear previous
form actions while preserving known task hierarchy.

`TaskEditor` composes one persistent `TaskReviewLayout` for every task type. The layout
owns responsive pane sizing, split resizing and the details slot. Photo submissions use
the full-width gallery; Feature and missing reports use overview/detail maps; Location
reviews use a comparison map. Location-specific review fields belong in
`LocationTaskDetails`, not a second page layout.

`TaskReviewImages` selects the revision or legacy review controller, with a shared
gallery layout and known attachment count. `ImageEditor` owns its pending viewport and
thumbnail rail, reserving the same rail dimensions before image evidence arrives.
`TaskMap` and `Maplet` share their in-place pending presentation. Do not introduce a
parallel page skeleton that duplicates map/image geometry. Known queue coordinates and
text can render immediately, independently of the editor query or image decoding.

`TaskReviewDetails` uses the real field rows for pending and ready content;
`useTaskReviewDetails` owns field derivation and cancellable report metadata loading.
Layout checks must cover pending-to-ready transitions, retained split size, thumbnail
rail geometry, all task types and narrow viewports, in addition to navigation latency.

## Handler Placement

- Local UI handlers:
  - Keep in component/pattern subcomponent.
  - Examples: input value forwarding, local toggle visuals, keyboard interactions.

- Domain/app handlers:
  - Keep in page/layout or adapter model.
  - Examples: filter mutations, facet changes, navigation, save/publish/delete behavior.

- Async orchestration:
  - Keep in page/layout or adapter model.
  - Examples: breadcrumb loading, URL sync, context sync, resource lookup.

## State Principles

- Prefer controlled/bindable props for pattern components.
- Keep pattern components "dumb" relative to app domain.
- Use adapters (for example `createAdminHeaderModel`) when page/layout glue becomes too
  large.
- Avoid hardcoded data dependencies inside reusable components; inject via props.

## Layout Component Control Pattern

- Use a page-callable controller context (e.g. `HeaderCtrl`) for per-route header
  visibility/behavior overrides.
- Keep the Header pattern itself stateless and prop-driven.
- Keep admin defaults in the adapter (`createAdminHeaderModel`) and merge `HeaderCtrl`
  overrides last.
- Enforce separation:
  - Automatic wiring (adapter): derive structural defaults from app/admin state
    (`activeResource`, `activeRef`, UI mode state).
  - Manual wiring (page): set programmatic header metadata (`title`, `icon`, `facets`)
    and per-page visibility intent via `HeaderCtrl`.
- Header metadata lives in `HeaderCtrl`; do not add a parallel header store to resource
  contexts.
- Recommended merge precedence:
  1. app/admin derived defaults
  2. adapter-level mode mapping (`auto` / `view` / `form` / `none`)
  3. page-level `HeaderCtrl.setVisibility(...)` overrides
- Place domain decisions in route/page code; keep components focused on rendering and
  local UI interactions.

## Pattern Styling Placement

- Prefer inline Tailwind utility classes directly in Svelte markup for component and
  pattern styling.
- Do not introduce semantic wrapper classes by default when they only mirror a local set
  of utility classes.
- Reserve shared CSS in `bits-*.css` files for the relatively small set of genuinely
  reusable theme tokens, CSS variables, cross-component states, or styling that cannot
  be expressed cleanly inline.
- When styling needs to be reused across components, prefer extracting theme variables
  or a small reusable primitive over adding another layer of semantic class indirection.
- When a component's styling logic grows into large class maps or CSS-variable maps,
  move that styling configuration into a colocated `component.styles.ts` file and keep
  the `.svelte` file focused on props, state, and markup.
- Treat semantic classes as the exception, not the default.

## Primitive Composition Convention

- When composing pattern or custom primitives, prefer namespaced usage:
  `<ComponentPrimitive.Root>`, `<ComponentPrimitive.Part>`.
- For pattern components, expose a local namespace via `components/index.ts` and import
  it as `import * as ComponentPrimitive from './components'`.
- This keeps composition explicit, aligns with Bits-style API shape, and avoids flat
  import sprawl in composites.

## Folding Regions

- Use `+++ <Region Name>` to start a fold region and `---` to end it.
- Match fold regions to the file's TOC or top-level logical sections.
- Leave one blank line before and after each region boundary line.
  - Preferred layout:
    - `// +++ Derived Header State`
    - blank line
    - section contents
    - blank line
    - `// ---`
    - `// +++ Next Header State`
- This keeps region markers visually distinct and easy to scan in the editor.

## TOC Comment Convention

- For large service/module files, start with a dedicated TOC fold region using this
  exact heading block:

```ts
// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
```

- After the heading block, list numbered section labels in file order using
  `// <N>. <SECTION NAME>`.
- Numbering may start at `0` when a leading utility/mutation section should sort ahead
  of the main flow.
- Under each section label, list function entries as `// - <functionName>`.
- Include both exported and file-local helpers when they are part of the section's
  navigable surface.
- Keep TOC section order aligned with the actual region order in the file.
- Close the TOC region with `// ---`.
- Each implementation section should start with this exact wrapper shape:

```ts
// ---
/********************
 *  2. RESOURCE EDITOR FACTORIES
 ************/
// +++ Resource Editor Factories
```

- The numbered banner text should match the TOC section label exactly.
- The fold-region label should be the same section name in Title Case.
- Preferred example:

```ts
// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. MUTATION
// - revalidateAfterSubmitAttempt
// - handleResourceBooleanStateToggle
// - updateFormData
//
// 1. NAVIGATION
// - toSubmittedCode
// - shouldRedirectToSubmittedCode
// - navigateToSubmittedCode
// - createCodeRefResourceResult
//
// 2. RESOURCE EDITOR FACTORIES
// - createResourceFormConfig
// - createResourceEditorPage
// ---

/********************
 *  2. RESOURCE EDITOR FACTORIES
 ************/
// +++ Resource Editor Factories
```

## File Naming Convention

- Directories: use `camelCase` for component folders in `src/lib/bits/**` (for example
  `formI18nSection`, `inputField`, `labelPrimitive`).
- Svelte components (`*.svelte`): use `TitleCase` filenames (for example
  `HeaderRoot.svelte`).
- Non-component modules (`*.ts`, `*.svelte.ts`): use `camelCase` filenames (for example
  `useAdminHeaderModel.svelte.ts`).
- Keep SvelteKit route-convention files unchanged (`+page.svelte`, `+layout.svelte`,
  `+server.ts`, etc.).

## Type File Convention

- Default for component-scoped types: `name.types.ts` in the same folder as the
  component entry.
- Use `types.ts` only when the file is intentionally shared by multiple subcomponents in
  a local `src/` primitive package (for example `custom/*/src/types.ts`).
- Primitive component prop types should live alongside primitive components, typically
  under the same `components/` folder (for example
  `components/headerPrimitives.types.ts`), not in the parent composite type file.
- Primitive bundle type files should be named `<component>Primitives.types.ts`.
- Prefer naming by public component contract:
  - `button.types.ts`, `header.types.ts`, `sectionHeader.types.ts`,
    `formI18nSection.types.ts`.
- Placement rules:
  - `core/{componentType}/name.types.ts` for core wrappers.
  - `custom/{componentType}/name.types.ts` for custom component public APIs.
  - `custom/{componentType}/src/types.ts` only for shared internal primitive contracts.
  - `patterns/{patternType}/name.types.ts` for pattern public APIs.
- Avoid adding new plain `types.ts` files outside internal `src/` primitive folders.
- Existing inconsistent files can remain until touched; when editing or adding nearby
  types, migrate to this convention.

## Type Ownership

- Define a type used by one implementation near the top of that file, after imports.
  Keep component-local props in the component. Do not export file-local types.
- Share related domain contracts in a colocated `<domain>.types.ts` file. Import
  directly from their owner; do not add a compatibility barrel in `src/lib/types.ts`.
- Reserve `src/lib/types.ts` for foundational resource identities/unions, locale,
  session, generic response, and TypeScript utility contracts. A high consumer count
  does not override clear domain ownership.
- Keep runtime constants and guards in implementation or constants modules. Use
  `import type` for dependencies needed only by type declarations, including constants
  referenced through `typeof`.
- Browser-safe contracts must not import server code at runtime. Server-only request
  contexts belong with the API; inferred request/remote signatures may use type-only
  imports from their implementations.
- Preserve schema/framework inference. Do not copy inferred entity shapes into manually
  maintained interfaces or broaden types to suppress diagnostics.
- Keep related contracts together when splitting them would add unnecessary hops.
  Changes to nullability, optionality, accepted values, or API behavior require separate
  implementation and validation from a relocation.

### Legacy Contracts Requiring Separate Design

- `client/services/form.types.ts` retains opaque `unknown` legacy form aliases.
  Replacing these requires deciding which consumers use current remote forms and which
  still expect store-backed forms; inventing a common interface would hide this
  mismatch.
- `client/services/fieldComponents.ts` retains the legacy constructor contract.
  Migrating it to Svelte's `Component` requires checking the remaining constructor
  consumers and snippets.
- `utils/resourceGuards.ts` preserves the existing structural discriminators. Tightening
  them requires resource-union fixtures and a policy for overlapping resource shapes.

### Reusable multilingual form rows and source controls

`formI18nSection` exports `FormI18nInlineRow` and `FormI18nSourceBar` for use across
resource types. The inline row composes shared Bits `TextInput`, `TextArea`, HTML
preview and verification controls; its caller supplies bound field attributes,
validation, labels and edit/cancel callbacks. It keeps registered controls mounted while
displaying a value. The source bar owns the animated edit-mode reveal and accessible
source buttons; callers supply eligible sources and translation actions. It does not
select targets or implement resource policy. Shared text-emptiness handling lives in
`formI18nSection/text.ts`, with no import from Feature components.

`FeatureProfileEditor` remains the resource-specific composition: location-derived
names, policy locks, translation concurrency and applying translated values belong
there. Other resource editors can reuse the shared controls without adopting those
Feature rules. These are app-owned Bits patterns, not wrappers around a nonexistent Bits
UI multilingual-field primitive.

## Messaging contact settings

The Settings panel places Messaging between Language and Theme. Each platform uses one
phone-or-username field in `UserMessagingSettings`; `contactInput.ts` normalizes
eight-digit Hong Kong numbers to +852 and validates international numbers and usernames.
`useUserMessagingSettingsModel` waits for eight national phone digits or four username
characters (excluding @) before starting its 400 ms typing debounce; blur validates the
current draft immediately. It serializes saves per platform, preserves the other field's
draft and rejects obsolete lookup results. Warning icons explain invalid input or failed
confirmation and allow retry; confirmed accounts show a checkmark. The platform
preference appears only when both contacts have been saved.

`checkUserMessagingIdentity` checks an exact saved revision through an organisation
account the actor may already access. It returns no provider profile data and does not
send messages or grant ownership verification. Missing provider access and private or
unresolved contacts produce warnings. WhatsApp usernames can be retained, but its
current bridge can confirm phone numbers only. Administrator ownership verification
remains a separate action.

## Messaging appearance and offline media

`useMessagingAppearance` loads and saves a shared organisation background through
`messagingAppearance.remote.ts`. Settings and inbox providers are keyed by organisation;
only the timeline inherits the repeating image and intensity. Bubbles retain opaque
theme surfaces. Background writes use messaging membership authorization and patch only
`settings.messagingAppearance`, preserving concurrent locale settings.

The Toastie & friends preset uses the existing Breadline toast crew artwork from
`documents/ChatGPT/Breadline/mascots/hong-kong/toast-crew.png`, copied unchanged to
`static/messaging/toastie-and-friends.png`. CSS applies its adjustable intensity.

The account model and media picker share one IndexedDB cache scoped to the operator and
organisation account. Catalogues, previews, profile data and ordinary attachment blobs
share the 1 GB / 30-day budget. Profiles paint from disk before refreshing; failed
refreshes keep the last cached profile and retry after 30 seconds. Media loads check
native identity and edit revision; deleted and view-once media are excluded. Object URLs
belong to the mounted model and are released on disposal; their blobs remain available
for the next view. The picker footer includes all stored media in its usage count, and
clearing invalidates pending cache writes.

## Tooltip presentation

Mount `TooltipProvider` once in the root layout. Use `data-tooltip={label}` for
plain-text help on native controls and in component `attrs` / `triggerAttrs`. The
provider anchors a Bits popover to the existing element, so labels share the cream-frame
theme styling without adding layout wrappers or changing tab order. It opens after 500
ms of hover or keyboard focus and dismisses on Escape, activation, scrolling, or resize.
Keep an explicit `aria-label` on icon-only controls; tooltip text is a description, not
a replacement for the control's accessible name.

Tooltip content must add information. Do not repeat a visible title, description, or
button label. Scrolling text does not create a tooltip from its own text; an explicit
description may explain something additional. The shared providers suppress repeated
labels while retaining explanations for icon-only controls and full text hidden by
actual clipping. Hidden scrolling copies and inline text dimensions do not count as
clipping.

Use `SimpleTooltip` for rich help cards, interactive help, and tap-to-open info buttons.
Do not add native HTML `title` tooltips. Component properties named `title` that render
headings, document titles, and accessible SVG names retain their normal meaning.
Third-party map controls use `bridgeNativeTooltips` at the map boundary to translate
library-generated titles into the same tooltip labels.

## Gallery sorting

A fresh **Automatic** gallery has no sorting tools. After a manual drag, or when loading
a **Manual** gallery, one control rail slides out at the fixed left edge of the track,
outside the scrolling thumbnails. It never follows selection or covers an image. Restore
Automatic keeps the last manual arrangement for this session and reveals an undo button
underneath. Undo restores that exact arrangement. Reloading a saved automatic gallery
hides the rail and clears the session-only undo. Automatic uses the effective
image-intent catalogue order, then newest image creation within each intent. Editing and
photo-review rails put Unclassified first to prompt classification; public gallery
priority and deliberate manual positions are unchanged. Removed intent identities sort
after configured intents. Historical revision snapshots without `gallery.sortMode` are
interpreted as automatic without rewriting their JSON or content hashes.

Manual uses the revision's complete `gallery.order` array. Dropping a thumbnail with
Svelte DND switches to manual using the current displayed sequence; pointer, touch and
keyboard interactions share the same guarded save. Selection is independent of dragging.
Restoring Automatic provides a session-only manual-order Undo. Failed saves preserve
accepted ordering; concurrent changes require a fresh comparison token. Membership
changes invalidate Undo.

New images join automatic galleries at their intent/date position. They append to manual
galleries. Intent changes, captions, alternative text, rotation and replacement preserve
manual positions. The mode and order travel together through accepted Feature revisions,
image projections and client rendering; an array position alone never implies manual
mode.

Photo tasks show all submissions and existing-image context in the same right-side
gallery as the Feature editor, falling below the image on narrow screens. New
submissions have a small blue dot at the top right. Internal proposal boundaries do not
create separate gallery selectors. Ordering is editable only when one submission owns
the whole displayed gallery; acceptance preserves an existing Feature's mode and
existing positions, appending reviewed additions in their relative submission order.
Automatic Feature galleries then display those additions by intent/date. Initial Feature
creation can adopt its reviewed gallery mode because it has no accepted gallery to
preserve.
