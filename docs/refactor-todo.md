# Refactor TODO

Use this checklist for execution tracking. Keep items small enough for one PR.

## Now
- [ ] Inventory all `sveltekit-superforms` usage by route and component.
- [ ] Define the first migration slice (1 route) to SvelteKit remote `form` call.
- [ ] Create/standardize first Bits UI primitives under `src/lib/bits`.
- [ ] Add migration note template for PRs (before/after behavior + screenshots).
- [ ] Review and approve `docs/Resource-Cache-Architecture.md` as the cache/source-of-truth direction.

## Forms: Superforms -> Remote `form`
- [ ] Replace first production form end-to-end.
- [ ] Preserve server validation and error message behavior.
- [ ] Confirm optimistic/pending UI behavior.
- [ ] Add/update tests for success, validation failure, and server failure.
- [ ] Repeat per route until no `sveltekit-superforms` remains.

## UI: DaisyUI -> Bits UI
- [ ] Add `// BITS COMPONENTS` import grouping in mixed files.
- [ ] Keep legacy imports under `// COMPONENTS`.
- [ ] Rebuild key interactive elements with Bits UI primitives.
- [ ] Remove DaisyUI classes from migrated screens.
- [ ] Track screens still on DaisyUI and prioritize by usage.

## Svelte / Architecture Items (migrated from old cursor checklist)
- [ ] Evaluate async guidance: https://github.com/sveltejs/svelte/discussions/15845#discussioncomment-13456944
- [ ] Evaluate `@attach` for replacing action patterns: https://svelte.dev/docs/svelte/@attach
- [ ] Use `<svelte:boundary>` where relevant.
- [x] Use `@debug` for targeted debugging as needed.

## Icon System
- [x] Evaluate move to Iconify:
  - https://github.com/unplugin/unplugin-icons/tree/main/examples/vite-svelte
  - https://github.com/unplugin/unplugin-icons/tree/main
  - https://icones.js.org
  - https://iconify.design
- [x] Choose icon set(s).
- [x] Add/verify Vite config integration for SvelteKit if adopted.

## Map Stack
- [ ] Evaluate migration to `svelte-maplibre-gl`:
  - https://github.com/MIERUNE/svelte-maplibre-gl

## Resource Cache Unification
- [ ] Create `CacheCtx` and inject it as a dependency into `AppCtx`.
- [ ] Implement organisation-only canonical store (`entities`, `entityMeta`, `queryIndex`) in `CacheCtx`.
- [ ] Add organisation projection graph and `satisfiesProjection(...)` checks.
- [ ] Implement `ensureResource(type, id, { minProjection, policy })` with in-flight dedupe.
- [ ] Implement `ensureQuery(queryKey, fetcher, { projection, policy })` with in-flight dedupe.
- [ ] Migrate organisations list/detail to `CacheCtx` read path.
- [ ] Migrate organisation mutations to `CacheCtx.mutateResource` optimistic flow.
- [ ] Persist organisation cache to IndexedDB and hydrate on boot.
- [ ] Define TTLs and stale/expire policies per resource/query type.
- [ ] Expand `CacheCtx` coverage to projects, layers, then features.
- [ ] Remove duplicated cache sync logic from `AppCtx` after parity validation.

## Runed Utilities
- [ ] Evaluate `useGeolocation`.
- [ ] Evaluate `onClickOutside`.
- [ ] Evaluate `TextareaAutosize`.
- [ ] Evaluate `previous`.
- [ ] Evaluate `debounced`.
- [ ] Evaluate `watch`.
- [ ] Evaluate `resource`.

Reference docs:
- `docs/refactor-roadmap.md`
- `docs/Resource-Cache-Architecture.md`
