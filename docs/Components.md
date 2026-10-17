# Component Architecture

This document defines the UI layering model for Bits components and how logic should be distributed.

## Route Context Ownership

Hype remains a single SvelteKit application. Hub mini-apps and dashboards do not
require a monorepo or separate frontend deployments.

| Context | Owner | Responsibility |
| --- | --- | --- |
| `RootCTX` | Root layout, shared by all routes | Shared session, locale, theme, responsive state and resolved hub identity |
| `CacheCtx` | Root layout instance, coordinated by `RootCTX` | Scoped resource retention, invalidation and optimistic reconciliation, accessed through typed resource clients |
| `AppCtx` | Public Hype app layout | User-facing app state, including the map, feature collections, filters, panels and app navigation |
| `AdminCtx` | `/admin` layout | Admin resource views, editing, filters and admin navigation |
| `{Hub}DashCtx` | The corresponding hub dashboard layout | Hub-specific operational workflows; use `BreadlineDashCtx` for Breadline |

Keep the exact `RootCTX` spelling. Dashboard context names use the hub name in
PascalCase followed by `DashCtx`. Introduce a dashboard context only when its
routes need shared state or orchestration; individual views can keep local state.
The public app includes the hub-branded map experience described in the
[Breadline mini-app specification](../spec/breadline/breadline.v4.spec.md#mini-apps).

Surface contexts consume shared state from `RootCTX`. Admin and hub dashboards
must not require `AppCtx` or the map bootstrap to initialise. Share domain
services, contracts and reusable UI through their owning modules rather than
coupling one surface context to another. Context state supports the UI;
server-side services remain responsible for authorisation and domain invariants.

The root layout creates `RootCTX`. The `(public)` layout creates `AppCtx`;
`/admin` creates `AdminCtx` with its own `ResourceViewCtx` exposed as `adminCtx.view`.
`ResourceViewCtx` is reusable surface-local implementation, not a root singleton.
Reusable UI resolves that view through `getSurfaceCtx()` or receives explicit
adapter props. Only public map code should require `getAppCtx()`.

Resource query ownership and the standard internal API are defined in
[Context boundaries and resource queries](refactor-guides/Refactor-Guide-Context-Boundaries.md).
Surface contexts own query intent and traversal. `ResourceClient` binds access
metadata, while `CacheCtx` retains compatible native handles. SvelteKit remains
the owner of remote payloads and transport deduplication. Dispose view controllers
on unmount; keep public map mechanics out of root and admin imports.

Draft creation lives in `FeatureDraft` (`view.draft`). Panel commands and URL
state use `PanelController` (`view.panels`); keyboard registration belongs to
`SurfaceInteractions` (`view.interactions`). These owners receive explicit
capabilities rather than the entire resource view. Use them directly instead of
adding forwarding methods to the view. View disposal releases keyboard listeners
and pending panel focus, and account changes discard creation drafts.

## Account and Map Ownership

`RootCTX.account` owns `AccountState`. Its authoritative session identity and roles
are separate from self-profile enrichment (preferences, display fields and saved
layers). Surfaces receive that same account instance and expose a read-only `user`
snapshot. Profile responses are restricted to presentation fields; another user's
profile stays in its resource cache or profile panel. Async saves capture the account
revision so responses and rollbacks cannot cross identity or role changes.

Only the root publishes session changes. Surface layouts call `syncAccount()` to
clear their own identity-bound data after a change; resource views never replace
the session. `isInitialised` means the resource view's initialization is complete,
not that a map has loaded.

Native MapLibre instances and marker DOM elements belong to the renderer.
`AppCtx.mapController` holds only the public map's camera capability, supplied by
`MapCanvas.onMapReady` and cleared on teardown. Other map renderers, such as the
screensaver, have their own controllers. Shared creation flows receive a
`getMapCenter` callback; marker transitions receive the clicked element directly.
`ResourceViewCtx` and admin views require neither a map instance nor a DOM registry.

## Navigation, Selection and Resource Presentation

`ResourceViewCtx` owns resource queries, filters, sorting and retained data. It has
no navigation, selected feature, header state or list-presentation preferences.
The public `AppCtx` and `AdminCtx` each own a `SurfaceNavigation`, provided beside
the resource view through `getSurfaceNavigation()`. Their layouts project the
current SvelteKit URL on initial render and subsequent navigation, including
shallow facet changes and browser history. Navigation commands update the URL;
page configuration can supply supported facet defaults without maintaining a
second route store. Resource references resolve against the owning view's cache.

`AppCtx.selection` owns the selected feature identity and active collection.
Cards resolve fresh data for that identity; the selection retains a preview if
its query page is evicted. Map markers derive their selected ID and highlighted
collection IDs from this same model. There is no separate selected-marker store.
Collection context survives feature stepping and feature-only dismissal; returning
home, clearing the collection, account changes and disposal clear selection.
Public card timers, navigation intent and camera commands belong to `AppCtx` and
its adapters. Shared filter services only mutate filter data.

`AdminCtx.listUi` retains per-resource layout mode and control-bar visibility
within that surface. `HeaderCtrl` owns transient search focus, page metadata and
action visibility; the header adapter combines those with navigation and list
preferences. Search focus resets on route navigation. The unused legacy header
store has been removed rather than extracted into another context.

## Responsive and Surface Layout Ownership

`ResponsiveCtx` is root-owned browser measurement state: layout viewport, visual
viewport, offsets, and keyboard inset. It does not own panels or main-element
measurements. Shared chrome breakpoint policy lives in `src/lib/layout/chrome.ts`
and has no Svelte/context dependency. Viewer-specific breakpoints stay with the viewer.

Each `ResourceViewCtx` (including `AppCtx`) owns a `PanelController` at `panels`
and a `SurfaceLayout` at `layout`. `panels.state` is the canonical logical and
visual panel state, including panel metadata; no root mirror is maintained.
Use controller mutation methods to preserve opening recency. URL synchronization,
focus and profile loading remain surface orchestration. Visual-only openings do
not reserve content width or affect resize arbitration.

`setSurfaceCtx` provides that surface's layout through a lightweight layout context.
Patterns can read geometry without importing resource orchestration. Standalone
patterns use local, unmeasured layout models; they never publish surface state at
root scope. `Main.Root` reports dimensions through `onDimensionsChange`, wired by
its owning route. The app shell measures its own main region. A surface's measured
width and panel state must never affect another surface.

Keep layout viewport width (panel arbitration), visual viewport dimensions
(keyboard/visible content), and effective main width (space after logical panels)
distinct. Menu reservation intentionally uses layout viewport height and effective
main width; shared chrome policy accepts explicit dimensions from its caller.

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
- Owns controller intent (for example `HeaderCtrl`) for page-level visibility/mode overrides.
- Integrates with `appCtx`/`adminCtx`.
- Builds/uses an adapter model (for example `createAdminHeaderModel`) to map app/context state into pattern props.
- Passes controlled/bindable state + callbacks into patterns via the adapter output.

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
- Use adapters (for example `createAdminHeaderModel`) when page/layout glue becomes too large.
- Avoid hardcoded data dependencies inside reusable components; inject via props.

## Layout Component Control Pattern

- Use a page-callable controller context (e.g. `HeaderCtrl`) for per-route header visibility/behavior overrides.
- Keep the Header pattern itself stateless and prop-driven.
- Keep admin defaults in the adapter (`createAdminHeaderModel`) and merge `HeaderCtrl` overrides last.
- Enforce separation:
  - Automatic wiring (adapter): derive structural defaults from app/admin state (`activeResource`, `activeRef`, UI mode state).
  - Manual wiring (page): set programmatic header metadata (`title`, `icon`, `facets`) and per-page visibility intent via `HeaderCtrl`.
- Header metadata lives in `HeaderCtrl`; do not add a parallel header store to resource contexts.
- Recommended merge precedence:
  1. app/admin derived defaults
  2. adapter-level mode mapping (`auto` / `view` / `form` / `none`)
  3. page-level `HeaderCtrl.setVisibility(...)` overrides
- Place domain decisions in route/page code; keep components focused on rendering and local UI interactions.

## Pattern Styling Placement

- Prefer inline Tailwind utility classes directly in Svelte markup for component and pattern styling.
- Do not introduce semantic wrapper classes by default when they only mirror a local set of utility classes.
- Reserve shared CSS in `bits-*.css` files for the relatively small set of genuinely reusable theme tokens, CSS variables, cross-component states, or styling that cannot be expressed cleanly inline.
- When styling needs to be reused across components, prefer extracting theme variables or a small reusable primitive over adding another layer of semantic class indirection.
- When a component's styling logic grows into large class maps or CSS-variable maps, move that styling configuration into a colocated `component.styles.ts` file and keep the `.svelte` file focused on props, state, and markup.
- Treat semantic classes as the exception, not the default.

## Primitive Composition Convention

- When composing pattern or custom primitives, prefer namespaced usage: `<ComponentPrimitive.Root>`, `<ComponentPrimitive.Part>`.
- For pattern components, expose a local namespace via `components/index.ts` and import it as `import * as ComponentPrimitive from './components'`.
- This keeps composition explicit, aligns with Bits-style API shape, and avoids flat import sprawl in composites.

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

- For large service/module files, start with a dedicated TOC fold region using this exact heading block:
```ts
// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
```
- After the heading block, list numbered section labels in file order using `// <N>. <SECTION NAME>`.
- Numbering may start at `0` when a leading utility/mutation section should sort ahead of the main flow.
- Under each section label, list function entries as `// - <functionName>`.
- Include both exported and file-local helpers when they are part of the section's navigable surface.
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

- Directories: use `camelCase` for component folders in `src/lib/bits/**` (for example `formI18nSection`, `inputField`, `labelPrimitive`).
- Svelte components (`*.svelte`): use `TitleCase` filenames (for example `HeaderRoot.svelte`).
- Non-component modules (`*.ts`, `*.svelte.ts`): use `camelCase` filenames (for example `useAdminHeaderModel.svelte.ts`).
- Keep SvelteKit route-convention files unchanged (`+page.svelte`, `+layout.svelte`, `+server.ts`, etc.).

## Type File Convention

- Default for component-scoped types: `name.types.ts` in the same folder as the component entry.
- Use `types.ts` only when the file is intentionally shared by multiple subcomponents in a local `src/` primitive package (for example `custom/*/src/types.ts`).
- Primitive component prop types should live alongside primitive components, typically under the same `components/` folder (for example `components/headerPrimitives.types.ts`), not in the parent composite type file.
- Primitive bundle type files should be named `<component>Primitives.types.ts`.
- Prefer naming by public component contract:
  - `button.types.ts`, `header.types.ts`, `sectionHeader.types.ts`, `formI18nSection.types.ts`.
- Placement rules:
  - `core/{componentType}/name.types.ts` for core wrappers.
  - `custom/{componentType}/name.types.ts` for custom component public APIs.
  - `custom/{componentType}/src/types.ts` only for shared internal primitive contracts.
  - `patterns/{patternType}/name.types.ts` for pattern public APIs.
- Avoid adding new plain `types.ts` files outside internal `src/` primitive folders.
- Existing inconsistent files can remain until touched; when editing or adding nearby types, migrate to this convention.

## Type Ownership

- Define a type used by one implementation near the top of that file, after imports.
  Keep component-local props in the component. Do not export file-local types.
- Share related domain contracts in a colocated `<domain>.types.ts` file. Import
  directly from their owner; do not add a compatibility barrel in `src/lib/types.ts`.
- Reserve `src/lib/types.ts` for foundational resource identities/unions, locale,
  session, generic response, and TypeScript utility contracts. A high consumer count
  does not override clear domain ownership.
- Keep runtime constants and guards in implementation or constants modules. Use
  `import type` for dependencies needed only by type declarations, including
  constants referenced through `typeof`.
- Browser-safe contracts must not import server code at runtime. Server-only
  request contexts belong with the API; inferred request/remote signatures may use
  type-only imports from their implementations.
- Preserve schema/framework inference. Do not copy inferred entity shapes into
  manually maintained interfaces or broaden types to suppress diagnostics.
- Keep related contracts together when splitting them would add unnecessary hops.
  Changes to nullability, optionality, accepted values, or API behavior require
  separate implementation and validation from a relocation.

### Legacy Contracts Requiring Separate Design

- `client/services/form.types.ts` retains opaque `unknown` legacy form aliases.
  Replacing these requires deciding which consumers use current remote forms and
  which still expect store-backed forms; inventing a common interface would hide
  this mismatch.
- `client/services/fieldComponents.ts` retains the legacy constructor contract.
  Migrating it to Svelte's `Component` requires checking the remaining constructor
  consumers and snippets.
- `utils/resourceGuards.ts` preserves the existing structural discriminators.
  Tightening them requires resource-union fixtures and a policy for overlapping
  resource shapes.
