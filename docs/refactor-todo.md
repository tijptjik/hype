# Refactor TODO

Use this checklist for execution tracking. Keep items small enough for one PR.

## Now
- [ ] Inventory all `sveltekit-superforms` usage by route and component.
- [ ] Define the first migration slice (1 route) to SvelteKit remote `form` call.
- [ ] Create/standardize first Bits UI primitives under `src/lib/bits`.
- [ ] Add migration note template for PRs (before/after behavior + screenshots).

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
- [ ] Evaluate move to Iconify:
  - https://github.com/unplugin/unplugin-icons/tree/main/examples/vite-svelte
  - https://github.com/unplugin/unplugin-icons/tree/main
  - https://icones.js.org
  - https://iconify.design
- [ ] Choose icon set(s).
- [ ] Add/verify Vite config integration for SvelteKit if adopted.

## Map Stack
- [ ] Evaluate migration to `svelte-maplibre-gl`:
  - https://github.com/MIERUNE/svelte-maplibre-gl

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
