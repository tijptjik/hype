# Deferred Migrations

Tracks DB migrations we intentionally defer so they are not lost during refactors.

## Entry format
- Date: `YYYY-MM-DD`
- Scope: resource/table(s)
- Code state: what was renamed/changed in TypeScript/API
- DB delta needed: exact column/table/index change to apply later
- Why deferred: rollout/compatibility reason
- Migration sketch: SQL or drizzle migration notes

## Open items

### 2026-03-05 - `property` / `layerProperty` contributable flag naming
- Scope: `src/lib/db/schema/property.ts`, `src/lib/db/schema/layer.ts`
- Code state:
  - TypeScript field key renamed from `isUserContributed` to `isUserContributable`.
  - Call sites updated to use `isUserContributable`.
- DB delta needed:
  - Rename physical SQLite column `isUserContributed` -> `isUserContributable` in:
    - `property`
    - `layerProperty`
- Why deferred:
  - Keep runtime compatibility and avoid immediate schema migration during refactor pass.
- Migration sketch:
  - Add drizzle migration to rename both columns.
  - Verify no raw SQL or analytics query still references `isUserContributed`.
  - Run backfill/validation query to confirm boolean values preserved.
