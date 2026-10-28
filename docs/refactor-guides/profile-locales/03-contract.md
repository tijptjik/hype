# Locale controls contract (LLM 3)

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180; [domain specification](../../../spec/breadline/proposal/01-places-features.md). Consumes [LLM 1's contract](01-contract.md). Feature routes and Profile fields remain LLM 4's ownership.

## Profile toolbar

`#lib/bits/custom/localeControls/LocaleToolbar.svelte` is controlled. Its public types are in `localeControls.types.ts` beside it.

- `selectedLocales: string[]`: unique, canonical ordered tags, including previously stored tags absent from today's catalogue.
- `visibleLocales: string[]`: enabled subset. Hiding changes presentation only; never use this array to remove content or restrict translation targets.
- `expanded: boolean`, `onExpandedChange(boolean)`: caller owns expansion, including facet/draft recovery.
- `options: LocaleOption[]`: `{ tag, name, autonym, aliases? }`. Use `contentLocaleOptions(getLocaleKey())` from `#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js` to consume LLM 1's catalogue and localized labels.
- `onChange(change)`: atomic next `selectedLocales` and `visibleLocales`, plus `action: add | reveal | toggle | reorder | remove`, `locale`, and `from/to` for reordering. Accept the returned arrays into caller state. `remove` is used only by explicit `mode="membership"` in shared settings. Default `mode="visibility"` never removes a selected tag.
- Optional `disabled`, `class`, `labels: LocaleControlLabels`. `alwaysExpanded` is for the settings editor.

Use `displayedLocales({ selectedLocales, visibleLocales }, expanded)` from `localeControls.js` to determine field-row order. Collapsed uses the first selected tag even if that tag was hidden; expansion restores the enabled subset. The toolbar blocks hiding the sole visible tag. Configured/persisted content selection remains caller-owned; the toolbar never touches translations, verification or persistence.

```svelte
<LocaleToolbar {selectedLocales} {visibleLocales} {expanded} {options}
  onExpandedChange={value => expanded = value}
  onChange={change => {
    selectedLocales = change.selectedLocales
    visibleLocales = change.visibleLocales
  }} />
```

Add focuses the searchable combobox. Arrow keys navigate results, Enter selects, Escape returns to Add. Selection focuses the new/existing chip. A duplicate reveals the existing tag without appending. Explicit Move earlier/later buttons support touch and keyboard; Alt+Arrow shortcuts and native pointer dragging also reorder. Reordering preserves locale identity and returns focus to its chip; removals in settings return focus to Add. Status announcements describe changes and last-visible protection. Search matches canonical tags, legacy aliases, localized names, English names, and autonyms. Search does not canonicalize content values.

## Advanced settings

`#lib/bits/patterns/forms/contentLocaleDefaults/ContentLocaleDefaults.svelte` receives `value: string[] | undefined`, `inheritedLocales`, `inheritedOrigin: organisation | user-default`, `scope: organisation | project`, `options`, `disabled`, optional `labels/issues`, and `onChange(string[] | undefined)`.

The caller resolves inheritance through LLM 1's `resolveContentLocales`. Opening the editor emits nothing. Inherited values are read-only until Set Organisation defaults / Override for Project explicitly creates an array. Reset emits `undefined`; route adapters must serialize that action as `{ contentLocales: null }`, which removes the saved key. Missing/untouched settings remain `{}`. Do not serialize an inherited effective order on render.

Both Organisation and Project Advanced routes wire this to `formCtx.form.fields.data.settings` through its JSON hidden-field registration and existing save/reset/validation lifecycle. Project reads the authorized selected parent Organisation profile and waits for its settings before enabling inherited editing. Existing project flags are separate. Backend authorization and migration remain LLM 1's ownership.

## Fixtures and verification

- `src/tests/fixtures/components/LocaleControlsFixture.svelte`: controlled Profile presentation plus Project/Organisation defaults, using the real catalogue/resolver. It deliberately keeps content separate from visibility.
- `src/tests/locale-controls.test.ts`: interaction coverage.
- `src/tests/fixtures/localeControlsCheck.ts`: browser entry point.
- `scripts/visual-checks/locale-controls-check.ts`: Chromium/Firefox at 320px, 390px and desktop; artifacts under `output/playwright/locale-controls/`.

This handoff is not full integration acceptance. Authenticated admin save/reload must be recorded separately from the fixture and backend service tests.

Evidence on 29 October 2026: 10 locale-control interaction/transport tests plus LLM 1's model/settings suites pass (56 tests total). Chromium and Firefox fixture checks pass at 320px, 390px and 1440px with no horizontal overflow or page errors; screenshots were inspected. Checks include keyboard focus, Add, reorder, first-locale collapse and reduced motion. The full workspace Svelte check reports two errors in the Feature route's existing descriptor-field integration and 19 warnings; none point to this workstream's controls or Advanced additions. No available browser/session was exposed by browser inventory, so authenticated Advanced save/reload is **unverified**. Service tests exercise the actual migrated SQLite settings implementation, but do not replace that UI acceptance. No migration was applied, commit/push made, or deployment performed by LLM 3.
