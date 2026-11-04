# Profile multilingual editing and ordered content locales

Implementation proposal, 29 October 2026. Related delivery:
[#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). Technical domain:
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

This is a handoff specification, not an implementation or acceptance claim. Preserve the
concurrent dirty checkout; reread affected files before editing. Follow AGENTS.md and
docs/Components.md. Do not commit or publish without authority.

## Intended result

Retain Profile columns by field (Title and Description), HumanVerified controls,
location-derived title behavior, and field-scoped translation. Replace the stacked
locale headings and vertical guide lines with compact locale-prefixed rows. Add a shared
ordered locale toolbar and Organisation defaults with Project overrides. New content
locales must survive validation, saving, loading, translation, and location-name
projection.

## Field layout and editing

- The first displayed locale has no visible prefix, regardless of the user locale.
  Subsequent locales have a compact prefix immediately to the left of their value, on
  the same row: En, 繁中, 简中, 日, or a short language code. Use a consistent prefix
  width and modest indentation; remove vertical guide lines and separate locale
  headings.
- Displayed row order determines prefix suppression. Dragging another language to first
  removes its prefix and restores the short prefix on the former first row.
- Display mode shows ordinary text or an em dash for an empty value, with no permanent
  input outline or “Type here” placeholder. Clicking an editable value opens the input
  in the same position; blur commits to form state and returns to display. Keyboard
  Enter/Space opens editing; Escape restores the pre-edit value. Multiline Enter inserts
  a newline. Do not submit the form implicitly.
- Keep the prefix, value alignment, and HumanVerified control stable between modes.
  Preserve HumanVerified behavior and storage; keep the existing policy for locked
  fields. An inherited title is never locally editable, including empty translations:
  Edit Location is its editing route.
- Use a reusable row component for title and description. Description displays rich text
  through the existing safe renderer and uses the existing editor while active. Do not
  flatten rich content on blur.
- Start with 24px between the field header and first row, 8px between locale rows, and
  24px before the derived-name panel. Review rendered desktop/mobile spacing against the
  user's references, avoiding unnecessary blank height.
- Shorten derived-title help to: **“Name follows Location.”** Keep **Edit Location** and
  the optional separate-name action. Retain the Linked · read-only badge.
- Keep meaningful accessible labels even where the user's locale is visually unlabelled.
  Nontranslated fields must not acquire locale rows.

## Translation in field headers

Move translation controls out of the space below each input into the Title/Description
header. Render **“From”** followed by locale buttons, using native locale labels and an
accessible full language name. Only offer source locales with a nonempty value for that
field; for descriptions, test meaningful text rather than HTML tags alone. Include
populated hidden locales as potential sources.

Clicking a source locale fills **all empty locale values for that field** across the
form's selected locale set, including locales currently hidden by the toolbar.
Visibility is presentation only. Do not create translations for every language in the
catalogue. Exclude the source itself; preserve every populated target. No active-row
target selection or target indicator is needed. Disable translation for
derived/read-only fields; hide an empty source list and disable the action when no
eligible empty targets remain.

Snapshot the source value and target set when clicked. Fan out with bounded concurrency;
handle provider support and failures per locale. Keep successful translations if another
target fails, identify failed/unsupported locales, and let retry target remaining empty
values. Before applying each response, recheck that its target is still empty and that
the source/form context is unchanged: never overwrite text entered while a request was
running or apply a stale response to a different record. Prevent duplicate in-flight
requests.

One click operates on one field across all eligible empty targets, setting
machine-generated flags only on successfully filled values. Human verification and
values on other fields or populated locales remain unchanged. For descriptions,
emptiness means no meaningful text, not merely an empty HTML string. Keep header
loading/error feedback and announce completion counts accessibly.

## Shared multilingual toolbar

- The compact icon-and-text Multilingual button stays on the right. It reveals the
  locale strip to its left, with Add at the far left and visible grab handles on locale
  chips. Use a clipped reveal without resizing/reflowing chips during animation. Adjust
  the header placement so expansion has space; wrap on narrow screens rather than
  overflowing. Animate width/opacity, with reduced-motion support.
- Chips toggle locale visibility across every multilingual field in this form. Maintain
  separate ordered `selectedLocales` and `visibleLocales`; hiding never deletes values
  or verification metadata.
- All configured locales are initially selected. With Multilingual collapsed, show the
  first locale in the current order; expanded mode reveals enabled locales. Collapse
  preserves chip selections and order. Never allow zero visible locales; if the sole
  visible locale is toggled off, keep it enabled and announce why.
- Drag chips to reorder all field rows immediately. Provide keyboard-accessible Move
  earlier/later actions and announcements; do not require pointer dragging. The user's
  locale is not pinned, so another locale can become the first row.
- Add opens a searchable combobox/dropdown. Search by canonical language tag, familiar
  aliases, language name in the user's UI language, and language autonym. Example:
  `zh-Hant`, `zhHant`, `Traditional Chinese`, and `繁體中文` find the same locale. Show
  autonym, localized language name, and code to distinguish variants.
- Choosing a locale appends and enables it across translated fields; already-selected
  locales are revealed instead of duplicated. Adding an empty row need not insert an
  empty translation record until edited. Arbitrary previously stored locales must remain
  round-trippable.
- Toolbar changes are local to the current form/draft, preserved through facet changes
  and draft recovery. They do not modify Organisation/Project defaults. Persist shared
  defaults only through their Advanced settings forms. A future personal ordering
  preference is out of scope.

## Configuration and inheritance

Current implementation facts, checked on 29 October 2026:

- `project.flags` is a SQLite JSON text column, typed through
  `src/lib/projects/flags.ts`. Its schema currently declares boolean keys and
  `.catchall(z.boolean())`.
- Organisation has no equivalent generic `flags`/`settings` column; Advanced is a UI
  facet, not a single storage container. It has dedicated columns and purpose-specific
  JSON such as capabilities.
- Layer presentation overrides use typed metadata, but Layer locale overrides are not
  requested here.

An ordered JSON array is appropriate, but do not put it into boolean-map consumers
without auditing their assumptions. Proposed storage: add a typed `settings` JSON object
to Organisation and Project, default `{}`, containing optional `contentLocales`. Leave
existing Project boolean flags and other policy columns intact. This requires an
additive migration for both columns. Naming the Advanced UI **Supported locales** is
fine; the technical name distinguishes authored content from translated application UI.

```ts
type ContentLocale = string // canonical validated BCP 47 tag, branded in implementation
interface ContentLocaleSettings {
  contentLocales?: ContentLocale[]
}
// Organisation.settings / Project.settings example:
{ "contentLocales": ["en", "zh-Hant", "zh-Hans", "ja"] }
```

Use an explicit schema for this key; no unvalidated arbitrary JSON. Preserve other
settings during partial updates. Arrays must be nonempty, unique after canonicalization,
and ordered. Missing key means inherit; use Reset to inherited to remove it. Reject
empty arrays, malformed tags, and unsupported registry entries with field errors. Apply
reasonable documented size limits.

Effective order: **Project override → Organisation setting → user-locale default**.
Overrides replace the whole array, not merge it. The same ordered array supplies the
default enabled locales. Show effective/inherited values and their origin in Advanced
settings; only an explicit override writes a Project array. Setting or resetting Project
overrides must not copy a transient user-derived default into storage.

| User locale                     | Fallback content order     |
| ------------------------------- | -------------------------- |
| English (`en`)                  | `en`, `zh-Hant`, `zh-Hans` |
| Traditional Chinese (`zh-Hant`) | `zh-Hant`, `zh-Hans`, `en` |
| Simplified Chinese (`zh-Hans`)  | `zh-Hans`, `zh-Hant`, `en` |
| Missing/unknown                 | `en`, `zh-Hant`, `zh-Hans` |

Normalize legacy user keys (`zhHant`, `zhHans`) before choosing defaults. English region
variants may use English order; script-bearing Chinese variants use their script. Do not
guess a Chinese script from a region without a documented mapping. For future UI locales
outside this table, use the explicit unknown fallback until product policy changes.

Configured order takes precedence over user locale: do not unconditionally prepend the
user locale as FeatureProfileEditor currently does. Append locales with existing
nonempty record values that are absent from configuration, in deterministic
canonical-tag order, and expose them when expanded. This prevents configuration changes
from hiding existing content indefinitely. “Supported locales” is an authoring default,
not a deletion policy or hard allowlist, because the form explicitly permits adding more
languages.

Organisation/Project Advanced screens use the same searchable, reorderable selector,
explain inheritance, and enforce existing resource-update authorization on the server.
Do not grant Feature editors permission to change shared defaults merely because they
can add a record translation.

## Locale model and compatibility

Separate **UI locale** (currently three compiled Paraglide languages) from **content
locale** (extensible BCP 47). Adding Japanese content must not require a Japanese UI
build or changing the user's interface locale.

Use canonical tags such as `en`, `zh-Hant`, `zh-Hans`, `ja`, `pt-BR` in the new settings
and content-locale API. Use `Intl.getCanonicalLocales` for syntactic normalization plus
a maintained language/script/region catalogue for dropdown eligibility and names.
`Intl.DisplayNames` helps localized labels; it is not a complete enumerable language
registry. Provide tested autonyms and code fallbacks for missing runtime names. Avoid
repurposing HK/CN UI badges as language identifiers.

Existing code has multiple incompatible representations:
`LocaleKey = 'en' | 'zhHans' | 'zhHant'`, lower-case hyphenated `SupportedLocales`, and
explicit three-key Feature form schemas. Introduce explicit boundary adapters; preserve
older clients and stored content. Do not merely widen a TypeScript alias while Zod or
serializers still discard unknown keys.

Audit before migration:

1. `src/lib/types.ts`, `enums.ts`, `i18n.ts`, and `addresses/featureAddress.ts`: keep
   app-message locale types closed; introduce a separate validated content type.
2. `src/lib/db/zod/constraints.ts` (`getLocales`, `FormI18nRoot`) and Feature draft/save
   schemas: accept dynamic locale maps, maintain required-field semantics, and preserve
   all translation/verification values.
3. Feature translation table schema and actual migrations: inspect database constraints
   and locale uniqueness. Drizzle's text enum annotation alone is not proof of a runtime
   CHECK constraint. Canonicalizing stored rows must detect collisions, e.g. `zh-hant`
   versus `zh-Hant`; conflicting values must not be silently discarded.
4. Feature API/service read/write shaping, remote form registration, clone/copy paths,
   draft recovery, public read projections, and rendering fallbacks: remove
   fixed-three-language assumptions within the affected content path.
5. Translation API/provider validators and target-language support: dynamic form rows
   must save even if automatic translation is unsupported.
6. Location name editing/projection and `featureLocation.acceptancePolicy.nameMode`:
   propagate available locales dynamically for inherited titles, preserve verification
   provenance, and show empty locked rows for missing Location translations. Do not
   invent a translation by copying another language into a missing locale.
7. Shared organisation/project descriptor forms: adding defaults does not itself
   authorize converting all content editors at once. Identify and document downstream
   consumers still limited to UI locales; never drop their existing data during settings
   saves.

A backwards-compatible adapter approach is acceptable initially: keep legacy
en/zhHant/zhHans form keys at old boundaries, map new tags explicitly, and preserve
other tags unchanged. Define one canonical form within the new content layer and prove
round trips before exposing Add in production.

## Distinct LLM responsibilities

Each handoff below is a separate implementation assignment. Read this shared
specification first; the individual briefs define ownership, inputs, deliverables, and
completion evidence. This split does not start implementation agents.

| LLM                                                                            | Responsibility                                                             | Owned integration surface                                             | Depends on                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| [1 — Locale model and settings](profile-locales/01-model-settings.md)          | Content-locale contracts, catalogue, configuration storage and inheritance | Organisation/Project schemas, migrations, settings APIs/services      | None                                           |
| [2 — Content persistence](profile-locales/02-content-persistence.md)           | Dynamic Feature/Location translation round trips and provenance            | Feature/Location schemas, services, serialization, provider adapters  | 1's locale contract                            |
| [3 — Locale controls and Advanced UI](profile-locales/03-locale-controls.md)   | Searchable/reorderable toolbar and shared-default editors                  | New locale-control components; Organisation/Project Advanced routes   | 1; can build fixtures against agreed contracts |
| [4 — Profile editor and translation](profile-locales/04-profile-editor.md)     | Inline rows, header bulk fill, Profile route wiring and draft state        | FeatureProfileEditor, descriptor/translation components, Feature page | 1, 2, 3; can build layout against fixtures     |
| [5 — Integration and acceptance](profile-locales/05-integration-acceptance.md) | Cross-workstream validation, browser evidence, delivery record             | Integration tests/fixtures, final spec/issue evidence                 | 1–4                                            |

LLM 1 publishes the shared types and resolver signatures before dependent code is
merged. LLM 2 publishes dynamic form/serialization and translation-provider contracts.
LLM 3 publishes controlled toolbar props/events. LLM 4 alone owns changes to the Feature
page and shared descriptor/translation UI during implementation; other LLMs supply
contracts or patches for that owner. LLM 1 owns migration numbering and coordinates any
migration needed by LLM 2. No simultaneous edits to shared files: agree a handoff before
transferring ownership. Use isolated branches/worktrees when implementing concurrently,
preserving unrelated work.

Suggested dependency flow: 1 establishes contracts → 2 and 3 proceed independently → 4
integrates → 5 verifies. LLM 4 may prepare UI fixtures earlier; LLM 5 may prepare
acceptance scenarios early. Each implementation LLM runs its own focused checks; final
verification is not a substitute for local validation. No workstream may declare the
whole feature complete independently.

## Acceptance evidence required

- All four fallback-order cases; override precedence; reset-to-inherit; order preserved
  on settings reload; canonicalization/deduplication; unauthorized updates rejected.
- Existing three-language records and an added fourth locale (e.g. Japanese) survive
  create, edit, save, reload, draft recovery, hidden rows, and unrelated-field updates,
  including HumanVerified flags.
- A reordered non-user locale becomes first in every field, becomes unlabelled, and
  remains first when collapsed. No locale change silently deletes a translation or
  rewrites shared defaults.
- Dropdown finds tags, aliases, translated names, and autonyms; no duplicate chips;
  keyboard and touch reordering work; reduced-motion preference is honored.
- First displayed locale is unlabelled; other short locale labels prefix the values; no
  vertical guides; no horizontal text movement on edit/blur; blank read-only
  translations show an em dash.
- Header translation sources contain values for that field only. One source click fills
  all empty selected locales for that field, including hidden ones, while preserving
  populated targets and other fields. Test partial failure, unsupported pairs, retries,
  duplicate clicks, and user edits/source changes during in-flight requests; inherited
  fields remain protected.
- Linked title can only be edited through Location; separate-name behavior and
  parent-policy lock remain intact. Verify derived fourth-locale data, not just
  independent Feature names.
- Chromium and Firefox screenshots at desktop, 390px, and 320px: coherent header
  spacing, no essential label truncation, no overflow, sensible wrapped toolbar, and
  stable focus. Inspect actual rendered output.
- Focused tests/checks plus authenticated admin save/reload. Fixtures are useful but
  cannot close persistence acceptance. Reconcile the previously reported discovery-test
  failures rather than calling a partial run a clean suite.

## Explicit implementation decisions to retain

Header translation fills all empty selected locales for that field from the chosen
source, regardless of row focus or visibility, as explicitly requested by the user. Form
toolbar choices are draft-local, shared settings are changed only in Advanced.
Configured locales are defaults rather than a hard restriction. These resolve
ambiguities in the request and should be called out in the implementation review; do not
invent personal preference persistence or Layer overrides as part of this work.
