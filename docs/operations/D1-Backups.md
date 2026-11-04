# Remote D1 backups

Run `bun run db:dump:cf:prod` or `bun run db:dump:cf:preview`. Wrangler asks for
confirmation because the export temporarily blocks other database requests. For an
unattended export, append `--yes`.

Whole-database D1 exports fail when a virtual table exists. Migration `0081` introduced
the derived `featureSearchFts` index. The dump commands now capture the live schema and
export all ordinary tables together in one explicit-table export, excluding FTS and its
shadow tables. No remote tables are dropped or rewritten. Unknown virtual tables stop
the backup until a rebuild strategy is defined.

The script creates every ordinary table and index before loading data, so foreign-key
references can resolve even when the data arrives out of dependency order. It preserves
AUTOINCREMENT high-water marks, appends virtual-table definitions and views, rebuilds
FTS from `featureSearchContent`, then installs triggers. Installing triggers after the
rows prevents import from duplicating derived data. It preserves multiline SQL and
trigger bodies without passing them through the legacy SQL reorderer. A second schema
inspection detects concurrent schema changes.

Before publishing a backup, the script restores the exact resulting SQL into a fresh
local SQLite database, checks integrity and schema coverage, and verifies the rebuilt
search index. Existing source foreign-key violations are counted and reported; the
backup preserves those rows unchanged.

Successful exports produce private files under the ignored `sql/backup/`:

- `hype-db-<environment>-<timestamp>-<unique>.sql`: standalone restore SQL.
- The same SQL with `-ordered.sql`: compatibility with existing restore commands.
- A `-schema.json` sidecar: the source schema inventory.

The `-ordered.sql` file is published only after verification. Failed or canceled
attempts retain a hidden staging directory for diagnosis and cannot be selected as the
latest successful backup. Keep backups private: they contain application and
authentication data.

Existing restore commands consume the standalone SQL without requiring the sidecar. This
change does not execute a local or remote restore. The verification is a SQLite
rehearsal, not proof of importing the artifact into remote D1.

See
[Cloudflare's export limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations).
