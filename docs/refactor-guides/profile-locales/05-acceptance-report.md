# Profile locales integration acceptance — 29 October 2026

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent [#180](https://github.com/tijptjik/hype/issues/180). Requirements: [shared specification](../Profile-Locales-Handoff.md).

## Result

The integrated working tree passes the locale/Profile checks and the revised discovery checks. Full acceptance remains open: no authenticated browser session was exposed for the requested admin save/reload, and two previously documented Location service failures still reproduce. This is not a deployment or production-provider verification.

## Evidence by scenario

| Scenario | Verified evidence | Remaining boundary |
| --- | --- | --- |
| Organisation defaults, Project override/reset, authorization and unrelated settings | Real SQLite settings migration/service tests; Organisation/Project remote authorization tests; Advanced controls browser fixture | Authenticated Advanced form save/reload against the running application |
| English, both Chinese scripts, missing-user default; configured order wins | Locale resolver tests plus cross-workstream persistence test using Japanese-first Organisation defaults | None for pure resolution logic |
| Add Japanese, verification, hide/reorder, draft recovery, save/reload | Chromium/Firefox locale controls and Profile fixtures; dynamic content SQLite save/reload tests; new bridge test combines configured order, hidden translation, serialized draft recovery, form validation, database write and read/form adapters | One authenticated browser flow spanning facets, save and reload; fixture checkpoint/recovery is not a real application-facet check |
| Fill all empty selected targets, including hidden ones | Profile controller/component tests; browser fixture; bridge test proves generated flag persists while populated target values and other fields/flags survive | Real external translation provider remains mocked; provider capability/error contracts are tested |
| Partial failure/retry and concurrent edits | Controller tests verify bounded fanout, per-target outcomes, stale-source/context/target rejection and empty-row edit invalidation | Real network-provider behavior |
| Inherited fourth-language name, read-only, separate-name/parent policy | SQLite content projection/link/save tests, Profile component/policy tests and browser fixture rendering a locked Japanese title | Real authenticated Edit Location → save → Profile reload, including parent-policy UI flow |
| Chromium/Firefox desktop and narrow layout | Both engines at 320, 390 and 1440px: zero page errors/overflow, matching display/input text positions, keyboard focus restoration, hidden-target fill, reordered collapse, inherited Japanese values; locale controls include touch and reduced/normal-motion checks | User visual review; mobile toolbar wraps to a tall stack at 320px, without clipping |

Profile desktop and narrow inherited screenshots were inspected, not just generated. Artifacts live under `output/playwright/feature-profile/` (12 screenshots plus `report.json`) and `output/playwright/locale-controls/` (screenshots plus `report.json`). These generated artifacts are local review outputs, not application data.

## Checks

- Combined 20-file suite: **596 passed, 2 failed (598 total)**. Covers content locales/settings/persistence, locale controls, Profile translation/editor, picker/discovery, Project flags/remotes, Organisation remotes, Project/Organisation authorization, draft state, translation remotes, Location services, Feature services/contributions/import resolution and presentation policy.
- `bun run check`: **0 errors, 19 existing warnings in 4 files**.
- Both checked browser scripts pass all six browser/viewport combinations independently.
- `git diff --check`: clean at verification time.

The 10 previously reported discovery failures were stale assertions. Tests now reflect type-specific Building Position labels and matched-position default, one-step ghost creation/use, and same-identity selection preserving unset/explicit naming intent for the parent policy. The explicit independent-name case now supplies that intent. No production code was changed to make those assertions pass.

Added a cross-workstream case to `src/tests/content-persistence.test.ts`: resolve Japanese-first Organisation settings, hide Japanese, bulk-translate empty descriptions, serialize/recover draft order/visibility, validate/save through the real SQLite relation writer, perform an unrelated partial save, and reload via production adapters. The translated description and generated flag survive; Japanese title/HumanVerified state and an already populated description remain intact.

## Open failures and responsible workstreams

1. `src/tests/location-services.test.ts` — `fences a rejection that arrives after acceptance reads but before its batch`: SQL parameter-count failure in the rejection-race fixture. Reproduced from LLM 2's documented wider-suite baseline. Route to the Location identity/rejection owner; not repaired as part of Profile UI acceptance.
2. Same suite — `retains local structured Feature corrections and explicit clearing without duplicating unit labels`: structured-address explicit-clear expectation still fails. Reproduced from LLM 2's baseline. Route to the Location address/materialization owner.

Reproduce either with `bunx vitest run src/tests/location-services.test.ts -t '<exact test name>'`. The new locale bridge and all focused locale/Profile tests pass independently of these failures.

## Environment and delivery limits

Browser inventory returned no exposed apps/browsers. The user was asked to expose their signed-in tab; a new unauthenticated browser was not treated as evidence about existing authentication. No session was fabricated, no live data was modified, and migration 0158 was not applied to a persistent environment during this acceptance run. Authenticated acceptance stays unchecked.

The checkout contains over 550 changed paths, including independent map, placement, rematching and other work. Locale foundations and controls already exist in commits `00e88c568` and `d93d4236b`. Remaining commit scope must preserve unrelated changes and pre-existing staging; the index was empty at the start of this run. Commit receipts belong in the final delivery/issue update, not inferred from file presence.

No broad importer/parent acceptance item or completed-leaf count advances from this component-level evidence.

## Review refinement: anchored toolbar and priority prefixes

The user's subsequent review supersedes the original user-locale prefix rule:
the first displayed locale is unlabelled; subsequent rows use compact labels such
as En, 繁中 and 简中. Reordering and visibility changes recompute that rule.
The compact Multilingual icon/text action is restored on the right, with Add at
the far left of the revealed strip and grip icons on draggable locale chips.
The reveal clips full-size chips from the trigger side instead of animating chip
width and causing repeated reflow. Narrow screens wrap the strip below the action.

Seventeen focused Profile/control tests pass, including the reordered-prefix case.
Chromium and Firefox pass at 320/390/1440px, including native drag-and-drop,
first-row prefix assertions, fixed trigger position, normal-motion reveal and
reduced-motion behavior. Existing authentication and commit-scope limits above
remain unchanged.

### Drag interaction follow-up

Native HTML dragging and the visible arrow buttons are replaced by
`svelte-dnd-action` 0.9.80: a dedicated grip starts mouse/touch dragging, a floating
clone follows the pointer, and FLIP-animated siblings preview the insertion slot.
Transient preview items stay local; only a finalized order reaches the form.
Language-button clicks continue to toggle visibility independently. Alt+Arrow
shortcuts and the library's keyboard handles remain available; zones are isolated
so Organisation/Project lists cannot exchange locale items.

The 17 focused tests pass, including preview-versus-finalize and hidden-locale
preservation. Chromium and Firefox pass drag/drop checks at 320/390/1440px;
Chromium additionally passes a CDP touchscreen drag with the floating clone
asserted before release. Desktop runs use normal motion and narrow runs use
reduced motion. Svelte check reports zero errors and 19 existing warnings.

### Overlay and form polish follow-up

Language search is now a portalled, opaque popover with hover/focus/touch access
from Add; opening it does not increase the form height. Desktop toolbar expansion
preserves the trigger's vertical and horizontal position. Locale rows transition
with reduced-motion support. Profile prefixes align with values, the description
header says “Translate from”, editable values have subtle outlines, and the two
field columns have a quiet divider. Cancel retains locale presentation. Clear All
is in the Organisation parent header; verification icons morph in place.

Search offers script-level Chinese; Cantonese/yue are Traditional Chinese search
aliases. Retired regional Chinese and yue settings remain valid on writes to avoid
breaking existing records. Self-hosted Noto script fonts support autonyms on
machines without those fonts installed.

The Organisation defaultLocationVisibility hidden input now uses the remote
field's `.as('hidden', value)` binding. The installed SvelteKit parser regression
reproduces rejection of the previous unbound name and accepts both visibility
values with the binding. This is not authenticated persistence proof.

Validation: 92 focused tests pass across locale controls, content locales,
Profile editor, Organisation remote APIs and remote-form fields. Svelte check has
zero errors and 19 existing warnings. Chromium/Firefox pass Profile checks at
320/390/1440px; locale browser checks additionally cover overlay geometry,
Cantonese aliases, Punjabi font loading, opaque surface, and Escape focus return.
Review screenshots are under `output/playwright/locale-controls/` (including
`*-overlay.png`) and `output/playwright/feature-profile/`. Authenticated
Organisation save/reload, the two previously reported Location-service failures,
and remaining broad integration acceptance are still open.

### Edit reveal and reusable field components

The shared `FormI18nSourceBar` animates translation controls on edit-mode changes
(200ms, disabled for reduced motion). Inline fields use 12px horizontal text inset
including the border, with a 40px prefix column instead of 56px; the gap beneath
field headers is 12px. Display/edit text coordinates remain identical in both
browsers. `formI18nSection` exports both shared controls, and shared text-emptiness
logic no longer imports Feature code. Location policy and translation orchestration
remain in the Feature composition. Nineteen focused tests pass; Chromium/Firefox
checks at 320/390/1440px cover edit reveal, reduced motion, spacing and existing
locale interactions. This does not change the persistence acceptance limits above.

### Outro, keyboard focus and shared facet presentation

Profile no longer remounts on Cancel: its existing context invalidation cancels
translation work, while the source bar can finish its closing transition. Inline
row keyboard outlines are inset to avoid clipping by the animated locale wrapper;
active controls explicitly suppress the wrapper focus shadow. The Organisation
header clear action now shows “All”. Profile and Location bind their multilingual
expansion to the page-owned locale state, preserving it across facet remounts.
Address and location-name locale rows use keyed 200ms slide transitions in both
directions, respecting reduced motion.

Validation: 52 focused Profile/translation/address tests pass. Chromium and Firefox
pass Profile checks at 320/390/1440px, including source-bar outro, keyboard Tab and
Shift+Tab, light/dark focus screenshots, and no active-field box shadow. Both
browsers also pass `shared-locale-tabs-check.ts`: Profile expansion reaches Location,
address rows animate open/closed, Location collapse reaches Profile, and remounting
Location retains that state. This fixture verifies presentation bindings, not an
authenticated save or synchronization between separate browser windows.

### Advanced language settings presentation

Organisation Advanced now groups settings under Languages and Visibility; Project
Advanced also labels its Languages section. The shared defaults card uses “Language
order”, “Your language first”, “Set defaults” and “Reset to defaults”. Detailed
behaviour is in a keyboard-accessible info tooltip. Read-only cards show an ordered
language list instead of disabled removal/drag controls. All new copy is translated
into English, Traditional Chinese and Simplified Chinese. The picker uses the
neutral panel surface, explicit theme-aware text and a subtle primary highlight.

Fifty-five focused locale tests pass. Chromium and Firefox pass 320/390/1440px
checks, including keyboard help open/dismiss, inheritance/reset behaviour, picker
geometry and light/dark screenshots. Svelte check reports zero errors and the same
19 existing warnings. Authenticated persistence remains outside this visual check.

### Stable inline editing and translation feedback

Inline rows hide the primitive's empty label with the correctly escaped selector
and remove its flex gap. Display and input text use matching insets; focusing the
editor preserves ancestor scroll positions. Locale prefixes are centred. A clear
button appears on field hover, keyboard focus or touch devices, clears only that
field and records manual provenance. Pending translations are invalidated by clear.

The selected translation source pulses while its request is pending (static
highlight under reduced motion). There is no separate “Translating…” row.
Completion appears in the field-title row, remains for three seconds and fades.
The reusable status component owns timer cleanup; context changes clear results.

Validation adds field-only clearing/provenance and source/progress/timed-completion
checks (21 focused tests). The browser fixture now includes the real FormSurface
and checks both title text coordinates, the title header's position, hover clearing,
keyboard focus and the existing multilingual flows in Chromium and Firefox at
320/390/1440px. The expanded geometry check caught the previously missed empty-label
gap. Authenticated admin persistence remains unverified.

### Navigation persistence and multilingual defaults

Organisation and Project Advanced expose independent content/address multilingual
defaults. Settings schemas, form adapters and patching preserve explicit false,
reset via null/key removal, and retain unrelated settings. Existing settings
permissions and concurrency checks apply. Missing settings default to false.
AdminCtx owns an account-scoped explicit presentation choice that survives Feature
next/previous navigation, while record locale membership stays separate. Without a
manual choice, Profile and Location use their respective configured defaults.
Translation controls appear only in multilingual edit mode.

119 focused tests pass, including both remote form save/reset paths, preservation
of unrelated data, Project false overrides, inherited resolution, account isolation
and hidden controls in single-language mode. Chromium/Firefox pass Profile checks
at 320/390/1440px, next/previous and facet-remount fixtures, and independent settings
switches/override/reset at 390/1440px. Settings screenshots are
`output/playwright/*-multilingual-settings.png`. Fixtures and mocked service tests
are not authenticated persistence evidence; that acceptance remains unchecked.

### Language settings card layout refinement

Language order and multilingual defaults share Visibility's subtle surface and
border treatment. Organisation/Project layouts use two columns only when each card
can retain at least 32rem; otherwise they stack. The fallback description reads
“Based on your language preference”. Reset controls use the shared rotate-ccw icon,
with accessible labels/tooltips, and are hidden when the effective value equals its
default (ordered comparison for language lists, boolean comparison for toggles).
Stored equal overrides are preserved; rendering never writes settings.

Thirteen focused settings/control tests pass. Chromium and Firefox verify side-by-
side layout at 1440px, stacked layout at 900/390px, no overflow and the existing
inheritance/reset interactions. Screenshots: `output/playwright/*-multilingual-settings.png`.

### Default Languages and responsive header refinement

The card is titled “Default Languages”, with Organisation-specific help describing
availability and order across its editors. Edit opens inherited defaults without
writing an override; the action changes to reset only when order differs. Add
language is always visible and follows the locale series. Multilingual switches
reserve reset-button space and fade the control without shifting content. Visibility
help uses a two-item bulleted list with a separate explanation of name overrides.

The adaptive header now includes reserved identity width, padding and flex gaps in
its measurements and observes group size changes. Chromium and Firefox verify
icon-only controls when Settings opens, restored labels when it closes, and updates
when identity width changes without a root resize. Screenshots:
`output/playwright/*-header-settings-open.png`.

Thirteen focused tests pass. Locale controls pass Chromium/Firefox at
320/390/1440px; settings pass at 390/900/1440px, including stable switch coordinates
and two tooltip list items. Svelte check reports zero errors and 19 existing
warnings. These fixture checks do not verify authenticated admin save/reload.

### Scoped commit validation

The locale persistence, shared controls, Profile component and multilingual defaults
were extracted without the unrelated Location lifecycle, map and image changes.
The extracted checkout passes 163 focused tests across 11 files. This check uses the
installed dependencies and generated message modules from the development checkout.
The integrated working tree still passes Svelte check with zero errors and 19 warnings.
The extracted checkout has broader type-check failures in its existing Location/map
and generated-route boundaries; focused tests do not establish a clean standalone
build. Profile route wiring, Location-derived name persistence and their SQLite
integration fixtures remain coupled to the uncommitted Location schema rewrite.
Their inclusion requires a clear ownership boundary before committing that rewrite.

The pre-commit hook treats any partially staged file as a formatting failure and
writes the whole working-tree file. Scoped commits therefore use separate focused
tests and whitespace checks instead of that hook, preserving unrelated edits.

### Default language picker focus refinement

Default Languages now displays the Organisation-specific description directly,
without an info trigger or separate Edit mode. The enclosing form enables locale
controls. Search excludes existing members, including hidden locales. Forward Tab
reaches Close, reverse Tab returns to search, and selection/dismissal restores Add
focus without an outline; Enter reopens search. Added chips do not receive focus.
Chromium and Firefox verify these interactions at 320/390/1440px, with overlay
geometry, reduced motion and narrow-layout checks retained.
