# User language fallbacks

## Published content and automatic translation

Reader language is independent of the interface language. New and missing preferences
keep `allowMachineTranslation` off; existing explicit opt-ins remain intact. The
`contentLocale` preference accepts content language tags beyond the three compiled UI
languages. Legacy fallback selections remain stored but do not reorder resolution.

Resolve every field independently. Prefer a published value in the requested language.
For Traditional Chinese, try Simplified Chinese then English; for Simplified Chinese,
try Traditional Chinese then English; for English, try Traditional then Simplified
Chinese. Other requested languages try English, Traditional Chinese, Simplified Chinese.
Finally use another populated published language in a stable order.

With AI enabled, a current automatic value in the requested language comes immediately
after its published value and before the published fallback chain. Never use an
unreviewed automatic value in a fallback language. Display a robot control beside
translated content; activating it reveals the original text and its language.

Existing i18n rows own `autoTranslated`, keyed by field. Each candidate retains its
value, source locale, exact source text, SHA-256 source hash, provider, nullable model
identity, generation time and signed provider receipt. `translationProvenance` records
explicitly accepted text, editor and acceptance time separately, retaining the original
AI provenance. Provider model identity remains null when the provider does not disclose
it. `isAutomaticOnly` identifies cache-only locale rows; these never supply published
values or become editorial Feature, resource or catalog revision content merely because
they exist.

The multilingual bar's selected languages determine missing translations, including
selected languages currently hidden from view. On save, review each mounted multilingual
tab in sequence. Translate into proposal rows using the existing inline field UI.
Generation does not fill submitted authored fields. Accept individual fields or accept
all and continue to the next missing tab. Keeping values undefined resumes the same save
without granting approval. Entirely empty optional fields and inherited names do not
require translation.

Common languages are cached after successful content saves. Additional reading languages
are cached on demand through authorized record reads. Cache writes leave published
values unchanged, recheck source text and parent version, and merge one field at a time.
Reader-triggered jobs translate only the normal authorized read projection and return
only cache entries whose original remains visible there. Feature text fields are scoped
by Feature, property and locale; catalog choices remain owned by their option. Pending
or failed translation leaves the published fallback visible. An edited source
immediately makes its old automatic translation ineligible.

Migration `0233_automatic_translation_values.sql` adds metadata without reclassifying
legacy `*Gen` values. Those flags alone do not establish editorial approval. No bulk
legacy approval or production backfill is implied by this migration.

## Historical fallback rollout

New accounts and runtime/session defaults enable `en` and `zh-hant`. `zh-hans` is
opt-in. Explicit choices, including disabling every fallback, remain editable after the
backfill. Guest names and theme picker labels follow the active interface language
rather than the account's stored English guest name.

The repeatable backfill is
[`sql/routines/backfill_user_language_fallbacks.sql`](../sql/routines/backfill_user_language_fallbacks.sql).
It enables English and Traditional Chinese for every existing account (including
guests), preserves existing Simplified Chinese fallbacks, normalizes legacy camel-case
Chinese locale codes, and preserves unrelated preference keys and user columns. A second
run changes zero rows. Malformed/non-object preferences are excluded; audit them before
applying and resolve them separately if found.

## Local verification (2026-10-19)

Applied to the local `hype-db-local` database after a SQLite backup:

- 13,429 users updated and verified.
- All users have `en` and `zh-hant`; the one existing `zh-hans` choice is preserved.
- Every unrelated user column and preference is unchanged.
- A second run changed zero rows; `PRAGMA quick_check` returned `ok`.
- 34 focused tests pass. An isolated Chromium fixture verified all five UI theme
  translations, the six featured map names, and the Traditional Chinese language panel
  showing English on and Simplified Chinese off.
- Full app verification was blocked by a settings-model server rendering error; the
  project type check reports eight errors in unrelated map/component/test files. A later
  fixture rerun also timed out, so full end-to-end UI acceptance remains pending.

## Production procedure (pending)

Production has not been backfilled. After approval to run production:

1. Export a protected production backup using `bun run db:dump:cf:prod`.
2. Audit JSON validity and the fallback distribution using the queries below. Stop if
   any preferences are malformed or non-object.
3. Execute the same SQL file against `hype-db-prod` with Wrangler's explicit
   `--remote --env production` options.
4. Verify the user count is unchanged, `missing_required_fallbacks` is zero, Simplified
   Chinese choices and other preferences are preserved, and a second execution reports
   zero changes. Deploy the code defaults through the normal deployment workflow so
   newly created accounts also use the new defaults.

```sql
SELECT count(*) AS users,
  sum(CASE WHEN json_valid(preferences) THEN
    CASE WHEN json_type(preferences) = 'object' THEN 0 ELSE 1 END
    ELSE 1 END) AS malformed_preferences
FROM user;

SELECT json_extract(preferences, '$.fallbackLocales') AS fallbacks, count(*)
FROM user GROUP BY 1;

SELECT count(*) AS missing_required_fallbacks
FROM user
WHERE NOT EXISTS (
  SELECT 1 FROM json_each(preferences, '$.fallbackLocales') WHERE value = 'en'
) OR NOT EXISTS (
  SELECT 1 FROM json_each(preferences, '$.fallbackLocales') WHERE value = 'zh-hant'
);
```

The SQL backfill updates existing preferences only. The schema source and application
account creation defaults are updated in code; applying the backfill does not alter the
existing SQLite column's historical default expression.
