# Breadline migration and reconciliation

Current identity stage: [phone-based users, auto-claims and latent identities](02-user-import.md#phone-based-latent-users-replacement-design-18-october-2026).
Refs #189, #194. The destination will be reset; reconciliation of old HYPE accounts
is outside this import. Migration `0089_breadline_phone_identity.sql` enforces unique
phones and adds private ownership/source-crosswalk tables. The planner groups by
normalized phone (falling back to exact/reviewed email with NULL phone), auto-claims single-email/name identities, and leaves ambiguous
groups without a primary email or login credentials. It preserves reviewed exclusions
and all mapped source user/volunteer IDs. Regenerate old email-based plans.

The identity planner and disposable rehearsal are implemented; the broader event
schema and conversion/apply framework below remain deferred. First-login claiming
is implemented for verified social profiles and one-time email links, retaining the
imported user ID. Migration `0090_breadline_claim_audit.sql` supplies runtime audit
fields; see the identity specification for atomicity and verification evidence.

Fresh local preparation is implemented by `scripts/breadline/prepare-local.ts`: a
versioned schema baseline, all current migrations, minimal application setup, shared
map-style catalog, Breadline source identity import and separate private local fixtures.
See [local rebuild and corrected source audit](02-user-import.md#phone-audit-correction-and-local-rebuild-19-october-2026).
The local apply requires an explicit reviewed `--application-snapshot` so identity
work cannot replace application content with migration seed rows. It uses a backup
and SQLite online backup installation; it has no remote target. Missing phones may inherit one known phone from an exact-email/reviewed identity
family; the old ten cross-phone exceptions were NULL-key misclassification, now fixed.

The 19 October completion update adds migration `0091_breadline_email_identity.sql`
for nullable imported phone provenance. Whitespace is removed before structural
validation and HK numbers must have eight national digits. Invalid phones no longer
exclude email identities or their history mappings. The updated local plan maps all
14,179 retained source rows to 13,386 users, with seven reviewed exclusions and no
exceptions. Local incremental application clears four malformed phones while
preserving accepted IDs and sessions; 2,723 imported users need phone completion.
Authenticated Breadline access is blocked until a structurally valid unique phone is
saved. See [completion and evidence](02-user-import.md#email-fallback-and-mandatory-phone-completion-19-october-2026).

Private reviewed telephone overrides can clear an explicitly rejected source number
or supply its canonical correction, guarded by the expected original value. They
preserve email/history mappings and do not modify the source. See
[reviewed overrides](02-user-import.md#reviewed-telephone-overrides).

Local application recovery after the minimal-bootstrap regression is implemented by
`scripts/breadline/restore-local-application.py`. The pre-rebuild snapshot restores
resource IDs, translations, publication/archive flags, original hub scopes and content,
while preserving all existing authentication and import tables. Rehearsals without
application snapshots remain allowed; minimal installation is blocked. Historical
author references are inert profiles, not restored credentials. Invalid orphan
translations remain private recovery evidence. See the [preservation contract](02-user-import.md#reproducible-fresh-local-preparation).

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

Hype stores normal users, supported-provider accounts and domain records, plus the
private `breadlineImportUser` and `breadlineImportIdentity` evidence needed for
latent ownership and source-history resolution. The phone-based import supersedes
the earlier offline-only identity-map restriction. Keep checkpoints, raw source row
payloads and operational audit logs offline; legacy subjects in the private identity
crosswalk are provenance and must not become guessed provider credentials. No old
tokens or sessions migrate.

Before cutover, stop Breadline writes, run one final source sync, verify table counts and
foreign-key coverage, ingest the remaining checkpoint range, and then switch traffic.
The retained mirror and row hashes provide the reconciliation evidence for that final
pass.

## Schema review and import commands (October 2026)

Related work: [event model #195](https://github.com/tijptjik/hype/issues/195),
[account support #189](https://github.com/tijptjik/hype/issues/189), and
[daily operations #202](https://github.com/tijptjik/hype/issues/202).
Active identity changes are `user.telephone`, phone uniqueness and the private
ownership/source-crosswalk tables; migrations `0085_breadline_users.sql` and
`0089_breadline_phone_identity.sql` contain no Breadline rows. Broader schema proposals
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

## Shared phone and organisation brand properties (19 October 2026)

Refs [MIG-2 #194](https://github.com/tijptjik/hype/issues/194), parent
[MIG #180](https://github.com/tijptjik/hype/issues/180).

Migration `0095_breadline_phone_brand_properties.sql` upgrades the existing core-hub
`phoneNumber` definition (`gPropPhNum01`) to `PhoneField` and promotes the existing
Breadline `brand` (`WhWlW8KcN2wq`) to the HKFoodWorks organisation. Established property
and value IDs, project opt-ins, layer visibility and feature references are retained.
The five brand options have English, Simplified Chinese and Traditional Chinese
labels: Maxim's / 美心西餅, Arome / 東海堂, 7-Eleven, Saint Honore / 聖安娜餅屋,
and Yamazaki / 山崎麵包. Unrelated/custom options are preserved. Conflicting scoped
catalogs fail closed rather than being silently merged.

`PhoneField` is a non-translatable specifier in the existing property component
model; no additional database column is required. It accepts valid Hong Kong
landline/mobile numbers with optional +852 and formatting spaces, parentheses or
hyphens. Values are normalized to E.164; extensions, foreign numbers, multiple
numbers and prose are rejected. Blank values remain optional. Browser feedback
uses the same parser as server validation; persisted definitions determine the
validation rule, including import and contribution paths. Validation occurs before
feature writes and before property replacement/deletion.

The migration was applied locally after an online SQLite backup and a disposable
rehearsal, including repeat execution, preserved feature/assignment counts and
foreign-key/integrity checks. Tests cover parsing, persisted-definition validation,
pre-write rejection, scope promotion, translations, preserved references and
conflicting catalogs. An isolated rendered-input Playwright check verifies telephone
input, HK acceptance and rejection feedback. Production application remains pending.

### Core MTR access data: local implementation and routing blocker

Nearest MTR access should be derived feature data (`mtrStation`, `mtrExit`,
`mtrDistance` in metres), rather than configurable properties. Prefer stable station
and exit references and record routing/source versions and calculation time. Recompute
on feature creation or coordinate changes; stale/failed results must not appear current.
Shortlist entrances spatially, then compare actual pedestrian routes across candidate
stations. Do not select a station by centroid distance or restrict routing to its
geometrically closest exit: barriers and disconnected streets can change the winner.
An unreachable route remains unknown/unreachable rather than becoming a straight-line
walking estimate.

Import Breadline bakeries and drop-off points into their existing layers before the
all-feature backfill. Rehearse the routing backfill locally against a recent production
export. Keep schema expansion and data updates as separately reviewable migration
steps; guard updates by feature ID and the coordinates used for calculation so changed
production locations cannot receive stale routes. Migration `0098` retires the two legacy MTR properties and their assignments;
the shared HYPE `phoneNumber` property remains. Legacy feature values cause the
retirement migration to fail for review rather than silently losing data.


Local evidence (2026-10-19, refs #194 and #213): fresh Breadline mirror and HYPE
production base-table export were taken. HYPE FTS is a virtual table unsupported by
D1 export; its schema/index contents were reconstructed for rehearsal. Migrations
0095–0098 were applied locally. The import creates 466 donor features and 19 dropoff
features, with stable source mappings; a second plan matches all 485 without inserts.
Foreign-key and integrity checks pass. Existing application data is preserved.

The source contains seven brands, including Independent and Maison Kayser in addition
to the five previously specified. Three source longitudes needed reviewed corrections
in `scripts/breadline/feature-coordinate-corrections.json`. Donor 171 has only an
estate-centre approximation and remains unpublished/pending review. Peninsula remains
private; inactive donors remain unpublished. Source Chinese is Traditional and is
preserved as a fallback for Simplified Chinese. Schedules/events are outside this
feature-location import and remain in the source mirror for their own migration.

Full routing acceptance remains blocked: the pinned Valhalla 3.8.3 graph
`dff05fbd7b562e6bd672d2ed9e6b67f0ad0cf6107eeed5369d87e155bd443a4f`
returns error 499 / HTTP 500 (`GetTags: offset exceeds size of text list`) for a
reproducible pedestrian request. The archive hash matches the release manifest;
reproduction includes the pinned container digest and single-thread configuration.
Failed calculations keep durable retry jobs. Explicit partial plans may contain only
successful calculations; they are not evidence of a complete backfill. Production
application and complete routing/browser acceptance remain pending.

The explicit partial backfill applied locally has 2,258 ready results and 60 retained
jobs (479 of 485 Breadline features ready). The production-snapshot plan has 2,255
ready results and 60 failures; the three-result difference is local-only content.
There is no complete production backfill yet. A real public-feature card browser check
renders station, exit and walking metres with zero page errors; authenticated Breadline
card acceptance remains pending. Focused MTR/property/API/card tests: 47 passed. Retry
Worker typecheck and Wrangler preview dry-run pass; no Worker was deployed.

Final whole-app typecheck reports 14 errors in unrelated map/panel/test and concurrently
edited geocoding paths; no MTR/phone implementation errors were reported.
