# Breadline migration and reconciliation

Tracking: [migration parent #180](https://github.com/tijptjik/hype/issues/180),
[source inventory #191](https://github.com/tijptjik/hype/issues/191), and
[repeatable importer #194](https://github.com/tijptjik/hype/issues/194).

The migration pipeline is split into three durable boundaries:

```text
Breadline PostgreSQL production
  -> read-only repeatable-read sync
  -> local SQLite mirror
  -> versioned Breadline-to-Hype transform
  -> Hype D1
```

The first two boundaries are implemented by `scripts/breadline`. The transform and
D1 write are separate because the Hype schema does not yet contain the Breadline
`event`, `eventAttendance`, `schedule`, `scheduleRule`, and time-segment tables
described in the v4 specification.

## Source inspection

The source inspector reads PostgreSQL catalogues and writes
`.local/breadline/source-schema.json`. It records columns, types, primary keys,
foreign keys, source triggers, estimated row counts, and a per-table incremental
assessment. It does not inspect row payloads or write credentials to the report.

The connection is loaded from `.dev.vars`:

```dotenv
BREADLINE_HOST=
BREADLINE_DB=
BREADLINE_USER=
BREADLINE_PORT=
BREADLINE_PASSWORD=
```

TLS is required by default. `BREADLINE_TLS` may be set to another Bun PostgreSQL TLS
mode for an environment that needs it.

Run the inspector with:

```sh
bun run breadline:db:inspect
```

## Local mirror

Run the initial or incremental pull with:

```sh
bun run breadline:db:sync
bun run breadline:db:status
```

The mirror defaults to `.local/breadline/mirror.sqlite`. Source tables are named
`breadline__{schema}__{table}` so source namespaces cannot collide with sync metadata.
Every row includes an internal source key, source-snapshot timestamp, and row hash.
Exact PostgreSQL numeric and bigint values are stored as text; structured values are
stored as canonical JSON.

`_breadline_change` is an ordered downstream-ingestion journal. It records material
row-hash changes and deletion tombstones while ignoring unchanged rows re-read by the
overlap window. A later D1 dry-run importer can checkpoint this sequence, collapse
repeated changes by source key, and join the current mirror row for the payload.

Each run uses a PostgreSQL repeatable-read, read-only transaction and one atomic local
SQLite transaction. A failed pull leaves the last complete mirror and its checkpoints
unchanged.

## Incremental rules

A table is incrementally pulled only when it has both:

1. a primary key suitable for deterministic upserts; and
2. a supported modification timestamp such as `last_updated_at`, `updated_at`, or
   `modified_at`.

Incremental reads overlap the previous checkpoint by five minutes by default. The
overlap makes retries and late commits idempotent. Rows with null modification
timestamps are fetched on every run. A primary-key-only sweep reconciles hard deletes,
so unchanged row payloads are not downloaded again even though source keys are checked.
The report records whether a source trigger appears to maintain the selected cursor. If
no trigger does, the application write paths must be verified before the table is treated
as safely incremental; a timestamp-shaped column name alone is not proof of change
capture.

Tables without both requirements are transactionally snapshot-replaced. `created_at`
alone is not treated as an update cursor because it cannot detect changes to an existing
row. Schema or primary-key drift also forces a full table refresh. The entire mirror is
verified against exact source row counts before checkpoints advance.

Use `--full` for a deliberate complete refresh, `--table schema.table` to limit a run,
and `--overlap-seconds N` to tune the retry window.

## D1 ingestion boundary

The final transform must persist a private source-identity map for every migrated
entity. The public v4 model can still drop legacy IDs, while the identity map gives
incremental imports a stable D1 target for upserts and deletes. Each D1 ingest run must
record the mirror checkpoint it consumed, generate deterministic change batches, and
advance its own checkpoint only after all related rows commit.

Before cutover, stop Breadline writes, run one final source sync, verify table counts and
foreign-key coverage, ingest the remaining checkpoint range, and then switch traffic.
The retained mirror and row hashes provide the reconciliation evidence for that final
pass.
