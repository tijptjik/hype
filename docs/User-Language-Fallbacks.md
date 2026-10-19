# User language fallbacks

New accounts and runtime/session defaults enable `en` and `zh-hant`.
`zh-hans` is opt-in. Explicit choices, including disabling every fallback, remain
editable after the backfill. Guest names and theme picker labels follow the active
interface language rather than the account's stored English guest name.

The repeatable backfill is
[`sql/routines/backfill_user_language_fallbacks.sql`](../sql/routines/backfill_user_language_fallbacks.sql).
It enables English and Traditional Chinese for every existing account (including
guests), preserves existing Simplified Chinese fallbacks, normalizes legacy
camel-case Chinese locale codes, and preserves unrelated preference keys and
user columns. A second run changes zero rows. Malformed/non-object preferences
are excluded; audit them before applying and resolve them separately if found.

## Local verification (2026-10-19)

Applied to the local `hype-db-local` database after a SQLite backup:

- 13,429 users updated and verified.
- All users have `en` and `zh-hant`; the one existing `zh-hans` choice is preserved.
- Every unrelated user column and preference is unchanged.
- A second run changed zero rows; `PRAGMA quick_check` returned `ok`.
- 34 focused tests pass. An isolated Chromium fixture verified all five UI theme
  translations, the six featured map names, and the Traditional Chinese language
  panel showing English on and Simplified Chinese off.
- Full app verification was blocked by a settings-model server rendering error;
  the project type check reports eight errors in unrelated map/component/test files.
  A later fixture rerun also timed out, so full end-to-end UI acceptance remains pending.

## Production procedure (pending)

Production has not been backfilled. After approval to run production:

1. Export a protected production backup using `bun run db:dump:cf:prod`.
2. Audit JSON validity and the fallback distribution using the queries below.
   Stop if any preferences are malformed or non-object.
3. Execute the same SQL file against `hype-db-prod` with Wrangler's explicit
   `--remote --env production` options.
4. Verify the user count is unchanged, `missing_required_fallbacks` is zero,
   Simplified Chinese choices and other preferences are preserved, and a second
   execution reports zero changes. Deploy the code defaults through the normal
   deployment workflow so newly created accounts also use the new defaults.

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

The SQL backfill updates existing preferences only. The schema source and
application account creation defaults are updated in code; applying the backfill
does not alter the existing SQLite column's historical default expression.
