# Content locale contract (LLM 1)

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180;
[domain specification](../../../spec/breadline/proposal/01-places-features.md).

Contract for LLMs 2–4; no UI-message locale types change.

- `#lib/content-locales/model.js`: branded `ContentLocale`, `ContentLocaleSchema`,
  `normalizeContentLocale(unknown): ContentLocale | null`,
  `normalizeContentLocales(readonly string[]): ContentLocale[]` (stable deduplication),
  `toLegacyContentLocaleKey(string): string`. Explicit aliases `zhHant` / `zhHans`;
  other canonical tags stay unchanged at legacy boundaries. Syntax validation permits
  stored tags outside the authoring catalogue. Never use this helper to merge
  conflicting translation records: LLM 2 must detect collisions before rewriting keys.
- `#lib/content-locales/catalogue.js`: maintained `CONTENT_LOCALE_CATALOGUE`,
  `SupportedContentLocaleSchema`, `getContentLocaleName(tag, displayLocale?)`,
  `getContentLocaleRecord(tag, displayLocale?)`,
  `queryContentLocales({ query?, displayLocale?, limit? }): ContentLocaleSearchRecord[]`.
  Records expose `locale`, `autonym`, `name`, `aliases`. Search matches canonical tags,
  aliases, English and localized names, and autonyms. Missing Intl names fall back to
  explicit autonyms or the tag. The curated catalogue is the settings/dropdown
  eligibility list, not a content deletion allowlist.
- `#lib/content-locales/settings.js`: `ContentLocaleSettingsSchema` and type
  `ContentLocaleSettings` for reads; `ContentLocaleSettingsPatchSchema` and type
  `ContentLocaleSettingsPatch` for writes; `ContentLocaleSettingsFormSchema` accepts an
  object or JSON string. Writes accept only `{ contentLocales?: string[] | null }`;
  omitted key is unchanged, `null` removes the key, arrays replace the ordered override.
  A resulting stored missing key means inherit. Unknown write keys are rejected;
  existing other JSON settings survive updates. Arrays contain 1–32 catalogue entries,
  canonicalized and unique (duplicates are field errors); tags are at most 64
  characters.
- `applyContentLocaleSettingsPatch(current, patch)` preserves unrelated settings.
  Existing Organisation/Project remote forms accept optional `data.settings` with that
  patch shape, use existing update authorization and stale-write guards, and return
  settings on all resource profiles. Older clients may omit settings without clearing
  it. New form inputs start at `{}` and loaded forms include only the contentLocales
  key. Reset sends `{ contentLocales: null }`, never a resolved user default.
- `#lib/content-locales/resolve.js`:
  `resolveContentLocales({ projectSettings?, organisationSettings?, userLocale? }): { locales: ContentLocale[]; origin: 'project' | 'organisation' | 'user-default' }`.
  Project replaces Organisation replaces user fallback; results are fresh arrays for
  form-local state. Unknown UI locales use English fallback; only explicit Chinese
  scripts select Chinese order. No regional Chinese script inference.

Migration owner: LLM 1 reserves `0158_content_locale_settings.sql` (latest existing
migration was 0157). It adds non-null JSON-object settings columns with `{}` defaults to
Organisation and Project; run before deploying code reading these columns. Project flags
remain boolean-only and untouched. No translation-row rewrite is part of this migration.
LLM 2 must coordinate any additional migration number after 0158 and detect alias
collisions before data conversion.

Compatibility: Organisation/Project descriptor editors remain limited to their current
three UI languages; these settings do not migrate their content. Feature/Location
persistence and UI wiring belong to LLMs 2–4. No deployment, authenticated UI
acceptance, or full-feature completion is claimed by this contract.

## Focused verification

`bun x vitest run src/tests/content-locales.test.ts src/tests/content-locale-settings.services.test.ts src/tests/project-flags.test.ts src/tests/project.remote.test.ts src/tests/organisation.remote.test.ts src/tests/authorization.project.test.ts src/tests/authorization.organisation.test.ts`
passed 300 tests across seven files on 29 October 2026. This includes actual SQLite
migration/service round trips, canonical aliases and catalogue search, array limits and
duplicate rejection, all user defaults, Project/Organisation precedence and reset,
stale-write rejection, omitted-field preservation, unchanged Project flags, and
shared-settings authorization. New table columns were rehearsed in an in-memory database
only; no persistent environment migration was applied.

The full `bun run check` still reports errors in concurrently edited
Feature/Location/content-persistence paths and existing fixtures. The final run reported
no errors in LLM 1's model, settings, resolver, Organisation/Project paths, or focused
tests. This is not full-repository or browser acceptance. Catalogue entries should
remain available once used in settings; adding a supported locale does not imply
automatic translation-provider support.

Commit verification repeated the seven-file suite against the isolated patch: all 300
tests passed, and the formatted name-fallback test passed again (44 model/settings
tests). The isolated full check reported 99 errors in existing address/map/UI paths and
missing generated route types; none were in the edited files. These results do not rely
on the other uncommitted locale workstreams.
