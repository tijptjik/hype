# Content persistence contract (LLM 2)

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180;
[domain specification](../../../spec/breadline/proposal/01-places-features.md). Consumes
LLM 1's `#lib/content-locales/model.js`; no shared `constraints.ts` or UI-message locale
changes.

## Interfaces for LLM 4

`#lib/i18n/contentRecords.js` exports `canonicalContentTag`, `contentFormKey`,
`contentStorageTag`, `adaptContentMap`, `contentRowsToForm`, `contentMapToStorage`,
`ContentTagInput`, and `contentLocaleMap`.

Canonical identity is LLM 1's branded `ContentLocale`. At the existing Feature form
boundary Chinese keys remain `zhHant` / `zhHans`, English remains `en`, and other tags
use canonical spelling (`ja`, `pt-BR`). Stored Chinese rows retain `zh-hant` /
`zh-hans`; other tags are canonical. Use `contentFormKey(tag)` for field names and
`canonicalContentTag(key)` for toolbar identities. Never use the closed UI `toLocaleKey`
/ `toLocaleKebab` or shared `toFormLocaleRecord` for dynamic content. Alias collisions,
including identical duplicate entries, raise errors rather than choosing a winner;
embedded row locale must match the map key.

`FeatureI18nByLocaleFormData`, `FeatureDraftI18nByLocaleFormData`, and
`FeaturePropertyI18nByLocaleFormData` now validate dynamic maps. Feature rows contain
`title`, `titleGen`, `description`, `descriptionGen`, `displayAddress`,
`displayAddressGen`, and `addressProperties`; property rows contain `value` and
`valueGen`. The normal Feature form requires at least one nonblank title across its map;
added locales may have an empty title. Drafts may have all-empty titles. Field length
limits remain unchanged. Locale records outside the selectable catalogue are still valid
content.

`toFeatureFormInput` preserves every returned locale, with legacy empty buckets for
existing consumers. Feature read profiles (including compact) retain extra locales.
`prepareFeatureFormRelations` and `updateI18n` retain omitted locales and fields;
explicit empty strings clear values. Normal validated forms carry their flags, so submit
the full current locale row when editing. Hidden or unselected locales are not deletion
requests. Empty added rows need not be submitted until edited. Property deletion still
removes that property's translations; an existing property with omitted locales retains
those translations.

`#lib/api/translation.remote.js` exports
`translateContentField({ text, source, target })`. It returns
`{ status: 'translated', text, source, target }`,
`{ status: 'unsupported', message, source, target }`, or
`{ status: 'error', message, source, target }`. Tags in results are canonical.
Authentication/validation/configuration failures reject the remote call. Maximum
single-field input is 8192 characters. The provider handles one field/target, never
changes form state, and preserves the existing `zh-Hant` → Azure `yue` policy. LLM 4
owns meaningful rich-text emptiness, bounded fanout, hidden targets, source/form
snapshots, in-flight deduplication, and rechecking target emptiness before applying
results. Set only the successfully filled field's `*Gen` flag. Unsupported provider
pairs do not restrict manual saves. The legacy batch `translateText` remote also accepts
dynamic tags.

Draft recovery must save/restore the complete dynamic `data.i18n` and each property's
`i18n`, including all verification flags. Store canonical ordered `selectedLocales` and
`visibleLocales` separately. Restore unknown stored tags; never reconstruct data from
the three UI locale keys or from only visible rows. Serialize all title/description
values and flags, including hidden values, using `contentFormKey`; field names can
include BCP 47 hyphens. The existing hidden-input helper covers dynamic address and
property values; Profile title/description registration remains LLM 4's responsibility.
It is unsafe to expose Add until that wiring and draft recovery are verified.

Location inherited titles project the union of source/current locales, preserve
descriptions and their verification, and leave absent translations empty instead of
copying a fallback language. `LocationResetSchema.names` accepts dynamic tags/aliases.
The address engine remains limited to its existing languages; manually authored
extra-language display addresses are retained.

## Database compatibility

Read-only inspection of the actual local D1 SQLite database on 29 October 2026 found no
locale CHECK constraint on `featureI18n` or `featurePropertyI18n`; uniqueness is
`(featureId, locale)` and `(featureId, propertyId, locale)`. Stored locales were only
`en`, `zh-hant`, and `zh-hans`. Location revision facts have a JSON-validity CHECK, not
a locale allowlist. This change needs no data migration. Any later canonical-case
rewrite must first audit alias collisions across each composite key and Location
name/override map; LLM 1 owns migration coordination. Production constraints/data have
not been inspected in this assignment.

The reproducible read-only audit command is
`bun scripts/i18n/audit-content-locales.ts <existing.sqlite>`. The inspected local
database contains 4,824 Feature translations, 226 property translations and 3,430
Location facts/accepted-override maps: zero invalid tags and zero normalization
collisions. No live database was modified.

Verification toggles now resolve dynamic tags with `contentFormKey`; their generic
remote-form interfaces accept missing dynamic buckets. Legacy descriptor component
changes are type compatibility only. The Feature page and draft-state orchestration were
not edited. No authenticated Profile UI or live provider acceptance is claimed here.

## Verification

- 102 tests pass across 11 focused files, including real transactional SQLite/D1 saves,
  reloads, editable copies/clones, partial older-client updates, additional property
  locales, inherited and independent titles, alias collisions, provider outcomes, remote
  account guards, import merges and verification toggles. A 120-locale write exercises
  D1's parameter limit.
- `bun run check`: zero errors, 19 existing warnings. `git diff --check` passes.
- The wider `location-services.test.ts` run passes 141/143. Its remaining failures are
  `fences a rejection that arrives after acceptance reads but before its batch` (fixture
  SQL parameter count) and
  `retains local structured Feature corrections and explicit clearing without duplicating unit labels`
  (address clearing). They remain open; this assignment does not claim the broader
  Location suite is green.
- Provider responses are mocked; authenticated editor/browser acceptance and production
  constraint inspection remain unverified. Changes are uncommitted and undeployed.
