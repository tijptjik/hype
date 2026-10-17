# Breadline migration and reconciliation

Current implementation scope: [isolated user import](02-user-import.md). The user
planner is usable now; the broader conversion/apply framework below remains deferred.
User import uses `0085_breadline_users.sql` and `0086_username_display_case.sql`;
the broader event schema is inactive.

Reviewed cross-email merges and exclusions are supported by the user planner's
private decisions file; see [decision rules and reconciliation boundaries](02-user-import.md#reviewed-merge-and-exclusion-decisions).
The plan retains source user/volunteer crosswalks and explicit exclusions. Existing
Hype identities requiring consolidation block insert SQL and rehearsal until a
separate destination reconciliation is complete. Future history stages must consume
both the crosswalk and exclusions; live account reconciliation is not implemented
by this planning command. Refs #194.

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

The final transform must persist its source-to-target identity map offline, alongside
private migration logs under `.local/breadline/`. Keep separate records for local and
production targets, including the target database identity, transform version, source
snapshot/checkpoint and stable assigned Hype IDs. Back up this state before every run.
Persist assigned IDs and the intended batch before submitting writes; reconcile target
rows after success or an interrupted run before advancing the offline checkpoint.
Local records and remote D1 cannot share a transaction, so safe replay must be tested.

Hype stores only the normal user, supported-provider account and domain records needed
to serve migrated users and their history. Do not add migration identity/checkpoint
tables, old Facebook app IDs, source row payloads or audit logs to Hype. The old source
IDs and all reconciliation evidence remain offline. No old tokens or sessions migrate.

Before cutover, stop Breadline writes, run one final source sync, verify table counts and
foreign-key coverage, ingest the remaining checkpoint range, and then switch traffic.
The retained mirror and row hashes provide the reconciliation evidence for that final
pass.

## Schema review and import commands (October 2026)

Related work: [event model #195](https://github.com/tijptjik/hype/issues/195),
[account support #189](https://github.com/tijptjik/hype/issues/189), and
[daily operations #202](https://github.com/tijptjik/hype/issues/202).
The active Drizzle change is `user.telephone`; migration
`0085_breadline_users.sql` contains no Breadline rows. Broader schema proposals
are retained as inactive files under `drafts/`.
See [schedule/event decisions](04-schedules-events.md) before applying it.

The existing mirror can be preserved independently:

```sh
bun run breadline:db:backup
```

This creates a timestamped, private SQLite snapshot under
`.local/breadline/backups/`, includes committed WAL contents using `VACUUM INTO`,
and runs `PRAGMA integrity_check`. It does not contact PostgreSQL. The snapshot
retains the mirror's original source timestamps; copying it does not refresh it.
This is a data mirror backup, not a PostgreSQL disaster-recovery dump containing
roles, extensions, sequences and database-level configuration.

After schema review, refresh the source with:

```sh
bun run breadline:db:sync --full
```

Sync now backs up an existing mirror before connecting to the source. A failure
in that backup aborts the refresh. Prefer `--full` until all source modification
cursors have been verified against every legacy writer.

Prepare a conversion plan for either target:

```sh
bun run breadline:db:import --target local
bun run breadline:db:import --target production
```

Both commands default to conversion only. They snapshot the mirror, run the
versioned stages in `scripts/breadline/stages.ts`, and write a private SQL artifact
under `.local/breadline/plans/`. They do not contact the target in dry-run mode.
The stage registry is deliberately empty pending schema and mapping review, so
these commands currently exit without generating a plan or importing anything.
They are an execution framework, not a completed MIG-2 importer.

Once reviewed converters exist, adding `--apply` first exports the selected Hype
D1 database to a local SQL backup, then executes the conversion SQL. Local routing
uses `wrangler.local.toml --local`; production uses
`wrangler.toml --env production --remote`. No implicit environment fallback or
schema application is performed. Subprocess output is suppressed because SQL
errors can contain personal data. A failed multi-statement import may be partial;
all stages must be retry-safe. Do not advance checkpoints independently of the
rows they cover. Atomic target batches, reconciliation, offline checkpoint recovery, exception counts and
resume verification remain requirements for each real converter before activation.

Credentials, mirrors, plans and backups must stay outside Git. Connection errors
redact all configured `BREADLINE_*` values, not just the password. No credentials
or raw source rows belong in issue updates.

### Confirmed identity and quantity requirements

Facebook was a legacy login method; Breadline has supported Google-only login for
a long time. Retained Facebook rows are historical identities, not evidence of
currently supported Facebook login. Investigate identity matches and run ownership
before mapping users; keep individual audit results offline.

All Breadline users must retain their complete history and be able to access it on
login, including Facebook users. Import or match the user independently of their
login provider; bind all historical attendance and measurements to that stable Hype
user identity. Do not discard users, archive them merely because they used Facebook,
or leave their history accessible only as anonymous historical attribution.

A normal, unambiguous email match is the intended account-recovery/linking path,
not an import exception. Reuse an existing Hype user where the identity match is
established; otherwise pre-create the migrated user. Subsequent supported-provider
logins must resolve to that same user after email ownership is established.

Facebook IDs are app-scoped. Preserve old IDs only in offline records with their source context,
but do not insert an old-app ID as an authenticated identity for Hype's different
Facebook app without a verified provider mapping. On login, link the new app-scoped
ID to the migrated user. Changing authentication libraries does not itself invalidate
provider IDs; provider identity scope is what matters. Missing/provider-withheld
email or a changed address needs an account-recovery path that retains history.

Current implementation evidence: `src/lib/auth/config.ts` trusts Facebook for
linking; the installed Better Auth `oauth2/link-account.mjs` defaults
`requireLocalEmailVerified` to true. Pre-created users with unverified email will
therefore not automatically link on first OAuth login. The importer must not mark
all imported emails verified merely because the source contains an address. A tested
migration account-claim flow must establish ownership, link the provider, and expose
all prior history without creating a second user. This is an implementation
requirement, not behavior already delivered by the schema proposal.

Quantities remain per event, as confirmed in the design. Multiple attendance rows
must not multiply the same event quantity in aggregate calculations.

### Conversion decisions awaiting review

- Resolve genuinely ambiguous identity records before assigning their history:
  examples include multiple source users sharing a normalized email, or an existing
  provider ID pointing at a different target user from the email match. Retain all
  source rows and histories while resolving these cases. This is what the earlier
  term "quarantine" meant; ordinary source-to-Hype email matches are expected.
- Resolve Claudio's target account before attributing imported features.
- Define per-volunteer attribution before allowing multiple volunteers to share
  the same pickup; this does not change the confirmed per-event quantity storage.
- Resolve unknown historical timestamps, phone normalization, legacy drop-off times,
  unsupported UIDs and orphan references in converters rather than inventing values.

No issue acceptance checkbox is completed by the framework alone. Tests use
synthetic rows and prove the backup and schema boundaries, not a production import.
