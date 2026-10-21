# Locations migration rehearsal and release handoff

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). Domain:
[Locations and Features](01-places-features.md).

## Inputs and command

Use a complete retained HYPE SQLite export and Breadline mirror. The initial remirror
receipt is `.local/places/remirror-receipt.json`; a SQLite copy of it is not a new
production export. The source Address/Place API mirror is independent of this import:
this procedure intentionally creates unresolved baselines rather than accepting name or
proximity suggestions as canonical identities.

From the HYPE repository, with Bun, Python 3 and installed dependencies:

```sh
bun scripts/locations/rehearse-migration.ts \
  .local/locations/refresh-20261021/hype-production.sqlite \
  .local/locations/refresh-20261021/breadline.sqlite \
  .local/locations/NEW-migration-rehearsal
```

The output directory must be new and under `.local/locations/`. Existing artifacts are
never overwritten. The script snapshots both SQLite inputs using SQLite's backup API,
records their hashes and the code revision, and uses only the copies. It has no remote
binding or primary-local reset operation. Any failure exits without a completion receipt;
partial artifacts remain available for diagnosis. Retry with a new directory after fixing
the cause. Individual split operations additionally have tested idempotent replay.

## Execution and evidence

1. Read `d1_migrations`; apply each missing checked-in SQL migration in filename order,
   in a fail-fast SQLite transaction with foreign-key verification and ledger entry.
   `schema.json` records each applied filename and SHA-256. Review this list against
   the intended release: it includes all pending repository migrations, not just Places.
2. Preserve `schema-baseline.sqlite`. Read existing Features through the application
   baseline reader and generate `split.json`. Each eligible row gets a deterministic
   unresolved Location, preserved effective values and original provenance. Draft,
   intangible, non-point and already-linked exclusions are explicit; other review
   outcomes stop before split application.
3. Apply each split through `applyUnresolvedFeatureSplit`, then replay it and require
   `already-applied`. `split-apply.json` and `split-replay.json` retain row outcomes.
   The offline D1-shaped adapter uses a real SQLite transaction for each batch and
   individually executes statements, so late failures cannot silently commit early writes.
4. Independently run `verify-feature-split.ts`: compare original Feature/translation/
   property rows in both directions, resolve actual facts plus overrides, and verify
   identities, ownership, histories, integrity and foreign keys. Save its receipt and
   the resulting `before-import.sqlite`.
5. Generate and apply `breadline.sql` with its preflight receipt. Donors require recorded
   runs; all drop-points are considered. Schedules and activity do not replace the run
   criterion. Brands are Place facts and phones use the universal HYPE property.
6. Preserve `before-replay.sqlite`, regenerate `breadline-replay.sql`, and apply it.
   Check original-row preservation and exact replay equivalence across domain/history
   and property-catalog tables. Verify counts, SQLite integrity and foreign keys.
7. Write `receipt.json` only after all checks pass. It contains split/import/replay
   counts, exclusions, validation receipts and plan hashes. The bundle contains private
   source data and belongs outside Git and public issue attachments.

The latest clean rehearsal uses the HYPE and Breadline exports verified on 2026-10-20,
applies 28 pending migrations through 0136, and splits 1,205 existing Features. It
excludes 56 intangible Features and 26 drafts, imports 311 donors plus 19 drop-points,
and skips 155 donors without recorded runs. Replay leaves all imported data unchanged.
All 64 reviewed MTR decisions remain in the import. The result contains 1,617 Features,
1,535 Places and 1,535 associations, with valid integrity and zero foreign-key violations.
Every new Place and baseline revision uses an opaque 12-character ID. Source matches
remain a separate reviewed operation; this initial import has unresolved baselines.

## Activate a rehearsal as primary local data

An isolated rehearsal does not refresh the primary local database. When explicitly
requested, verify the chosen export/rehearsal receipts and identify the exact local D1
binding file. Stop its development server and database browser before replacing data.
Use SQLite's backup API to retain the entire previous database, including committed WAL
contents, then install the verified result into the primary binding. Avoid raw file copies
while connections are open. Check integrity, foreign keys, import counts and ID format
again against the actual primary file.

Run local mirror preparation to initialize reserved development accounts and drain the
import's division jobs. It needs server-side SaanSeoi connection settings; never print
credentials. Keep other local database writers stopped during preparation to avoid
SQLite lock contention, then restart the development server and database browser.
Retain a private receipt with source, target, backup and verification results. This step
replaces local experiments and reviewed local identities with the selected fresh import;
the backup preserves them for recovery. It does not modify production or constitute
acceptance of suggested canonical identities.

## Release boundary

This is a reproducible local acceptance bundle, not a production execution command.
Schema migrations are checked-in SQL; the data split currently runs through the guarded
application service, and Breadline import SQL is generated for the explicit destination
snapshot. The guarded executor described below preserves per-Feature transactions and
conflict/replay checks. Generating this bundle does not grant deployment authorization.

Before release, retain the selected source exports and code/migration hashes, review
all exclusion/review outcomes and repeat verification against the actual release target. Deploy the required SaanSeoi
canonical `filter[id]` support before enabling HYPE's exact candidate reader. Configure
and deploy the Place refresh worker only in the separately authorized release step.
Retain the production recovery bookmark and verify application/worker state afterward.
None of those production actions has been performed by this rehearsal.

Schedule/time-window import remains separate under #195/#196. Canonical Place identity
and Address curation decisions remain explicit reviews; unresolved fallback records are
not automatically upgraded by this procedure.


## Guarded data-split executor

`execute-feature-split.ts` supports an explicit local SQLite file or the `preview` /
`production` D1 binding selected from checked-in `wrangler.toml`. It requires the exact
manifest SHA-256 and an explicit receipt path. Description is the default and performs
no connection, schema mutation or deployment:

```sh
bun scripts/locations/execute-feature-split.ts \
  --manifest .local/places/RELEASE/split.json \
  --sha256 MANIFEST_SHA256 \
  --receipt .local/places/RELEASE/execution.json \
  --remote production --account-id ACCOUNT_ID --database-id DATABASE_UUID
```

Replace the uppercase placeholders with the reviewed artifact hash and target identities.
The database UUID must match the selected environment's unique `DB` binding. The
account ID is explicit; no default environment/database inference is used. The temporary
Wrangler proxy configuration contains only this D1 binding with `remote: true`, disables
local persistence and env-file loading, and uses a `first-primary` database session.
It does not load the application's queues, R2 or other bindings. Installed Wrangler
4.151.1 types/configuration and the current Wrangler API documentation were checked for
this integration. No remote connection was established during development verification.

After separate authorization for the actual release, `--apply` executes the manifest
through `applyUnresolvedFeatureSplit`. Schema migrations must already be applied. Each
Feature is revalidated against live baseline values and commits Place/revision/association
history atomically. A conflict stops subsequent work while preserving prior completed
Features. Retry the same hash/target/receipt to replay accepted steps and continue; later
user edits are not silently repaired. A receipt belonging to another target or manifest
is rejected.

The receipt records a separate run for every invocation and is atomically replaced after
each outcome. A sibling `.lock` file prevents overlapping writers to that receipt. Normal
completion/failure releases the lock. After a process crash, inspect its recorded PID and
confirm that execution has stopped before removing the stale lock; file age alone is not
proof. Retain the receipt, then resume with the same command. Receipts omit source error
bodies and SQL payloads.

Local execution uses `--sqlite ISOLATED_DATABASE.sqlite` instead of the remote/account/
database flags. Verification applied all 1,190 splits and replayed all as `already-applied`,
with original values, one history per split, integrity and foreign keys verified. A second
copy with a changed third Feature stopped after two commits; restoring that deliberate
fixture edit and resuming produced two replays plus 1,188 applications, without extra
history. Eight focused executor/adapter tests cover target/hash validation, explicit
remote config, offline description, receipt locking and append-preserving runs, and
transaction rollback. Remote execution itself remains unverified and has not occurred.

## Rehearse an explicitly reviewed identity match

After independently reviewing an establishment candidate, use the existing local
database containing the imported Feature and pinned source candidate:

```sh
bun scripts/locations/rehearse-identity-match.ts \
  SOURCE.sqlite .local/places/NEW-identity-rehearsal \
  FEATURE_ID CANONICAL_SS_ID 'Evidence-based establishment review reason'
```

This command always snapshots its read-only input into a new private directory. It
never applies to the input or a remote database. It requires an unresolved Feature
Place and a current, already-mirrored canonical candidate with no associated Features.
It captures a retained identity review, verifies that acceptance requires a merge,
and applies the explicit merge using the existing domain services. The actor is
labelled `system:isolated-identity-rehearsal`; the decision is not attributed to a user.

Verification requires the original HYPE Place ID to become linked, the absorbed
candidate to become a redirect, and every Feature-owned table to remain exactly
unchanged. A consumed review cannot apply twice; replay must leave identity, revision,
review and redirect rows unchanged. Integrity and foreign keys must pass before the
private receipt is written. The receipt includes the input snapshot hash and reason.
Do not treat a successful rehearsal as production acceptance or a general candidate
matching algorithm. Facts/location adoption remains a separate policy-controlled step.

Verified with Breadline donor #4: matching branch/address/unit evidence and a
publication-unique phone corroborate the candidate, whose point is 24.4 metres away.
The isolated acceptance retained all 23 Feature-owned tables, including routing/MTR
data, with no duplicate transition on replay. Primary local identity decisions remain
unchanged. No raw contacts or review exports belong in tracked documentation.

## Apply a reviewed identity to primary local state

After a successful independent identity rehearsal:

```sh
bun scripts/locations/apply-reviewed-identity.ts LOCAL_D1.sqlite REHEARSAL_DIRECTORY
bun scripts/locations/apply-reviewed-identity.ts LOCAL_D1.sqlite REHEARSAL_DIRECTORY --apply-local
```

The first command describes the operation. Only real SQLite paths beneath this
checkout's `.wrangler/state/v3/d1/` are accepted; there is no remote mode. Application
requires unchanged target/source identity, revision and history baselines, plus exact
agreement of all Feature-owned rows with the successful rehearsal. A complete
`before-primary-apply.sqlite` backup is retained before any review writes. Actual
acceptance uses the current domain guards and records `system:reviewed-place-migration`
as the actor, with the reviewed evidence reason and reference to the isolated review.

On success `primary-apply.json` records the retained Place ID and new review IDs.
Existing application evidence blocks repeat execution. After an interruption, inspect
the database, backup and reviews before any retry; do not remove the evidence just to
rerun the command. An identity/merge decision does not adopt source facts or location.

The command was rehearsed on another isolated copy, then applied to donor #4 in
primary local state. The original HYPE Place ID now carries the reviewed SaanSeoi ID;
the mirrored candidate is a redirect. All 23 Feature-owned tables are unchanged,
including MTR access. Integrity and foreign keys pass. A changed-Feature fixture was
refused before backup/review writes; a repeat application was refused without writes.
This supersedes earlier statements that primary local identity decisions are zero.
No production database, deployment or source publisher was modified.

## Preserve Feature values while starting source inheritance

After the preceding identity application, explicitly select its exact reviewed source
revision without replacing current effective values:

```sh
bun scripts/locations/apply-reviewed-identity.ts LOCAL_D1.sqlite REHEARSAL_DIRECTORY --preserve-feature-values
```

This separate step requires the accepted identity history tail and its source revision
to remain current/latest. It retains a second full backup before calling the existing
guarded reassociation service. Equal values inherit; differing values become overrides;
existing explicit corrections remain explicit. No source records are edited. A private
`preserving-reassociation.json` receipt records revision tokens and override field names.
Existing backup/receipt evidence prevents blind retries after an interruption.

The isolated rehearsal and primary local donor #4 application both pass: names, brands
and location are preserved as overrides, while the equal phone array inherits. Every
effective value and the HYPE Place ID is unchanged. Other associations are unchanged,
exactly one association-history row is added, and all 37 other Feature/Place tables
remain identical. Stale replay is refused without extra history; integrity/FKs pass.

A subsequent full Breadline import replay on a copy of this primary state matched
all 330 imports, created zero, skipped the 155 ineligible donors and retained all 64
MTR decisions. Every row in all 86 application tables remained identical, including
the reviewed source identity and new inheritance overrides. This verifies that import
replay does not undo later identity curation. Production remains untouched.

## Rehearse complete source mirroring and Address hydration

The normal bulk command and the isolated rehearsal share
`scripts/locations/lib/mirror-source-subset.ts`; only their database/source transports
and checkpoint sinks differ. To verify against the retained source exports:

```sh
bun scripts/locations/rehearse-source-mirror.ts \
  HYPE.sqlite SOURCE_EXPORT_DIRECTORY CURRENT.sqlite \
  PUBLICATION.json CHECKPOINT.json .local/places/NEW-source-mirror-rehearsal
```

The command snapshots HYPE into its new output directory and opens the source shards
read-only through the actual in-process Atlas API. CURRENT must match the source API
schema. The input publication and checkpoint must select the same publication/subset.
It runs the same hydration, forward-only persistence, receipt verification and page
checkpoint path as `mirror-source.ts`. Private page checkpoints survive for inspection.
Completion additionally requires exact preservation of every Feature-owned table,
complete pagination, integrity/FKs, and a completed-checkpoint replay with no API
requests or new source revisions. No primary local or production database is changed.

Verified from the retained version-one completed bakery checkpoint: version-two replay
processes all 1,330 Places over 14 pages and 176 source requests. All 81 referenced
Addresses resolve to their exact published snapshots; 1,249 Places have no Address
reference. All 23 Feature-owned tables remain exact. Completed replay makes zero
source requests and adds no revisions. The first attempt exposed API-origin navigation
links being compared as canonical data; the corrected comparison is verified in the
final complete run. Source payload bytes remain retained, including their original links.

125 focused tests cover publication races, canonical evidence, checkpoint upgrades,
partial-page Address failures, persistence conflicts and failed checkpoint writes.
A failed page never reports completion or advances durable progress. Worker checking
passes; application checking retains its existing 10 errors and 19 warnings.

### Apply the verified mirror to primary local HYPE

After retaining a consistent SQLite backup, copy the input checkpoint to a new
private application directory. Keep the original checkpoint as evidence. The normal
command accepts the same sealed source exports without requiring a hosted API key:

```sh
bun scripts/locations/mirror-source.ts PUBLICATION.json APPLICATION_CHECKPOINT.json bakery \
  --source-export SOURCE_EXPORT_DIRECTORY --current-export CURRENT.sqlite
```

Both source flags are required together. Without them, the existing authenticated
hosted source reader is used. The destination remains the default local HYPE binding
from `wrangler.local.toml`, with remote bindings disabled. Source and Wrangler handles
are closed on success or failure, including proxy initialization failure.

Primary-local application verified all 1,330 records, including 81 resolved Addresses
and 1,249 without Address references. All 23 Feature-owned tables and all identity
tables were preserved exactly. Only `placeRevision` and Wrangler's `_cf_METADATA`
changed. Integrity and foreign keys pass. A completed-checkpoint replay leaves all
application tables unchanged; Wrangler still advances its internal metadata counter.
Private backup, checkpoint, table fingerprints and receipt are
retained; source and production databases were not modified.

## Rehearse the monthly canonical refresh

Use a local HYPE snapshot with migrations through 0125 installed, an idle refresh state not
already checked this UTC month, and sealed SaanSeoi exports:

```sh
bun scripts/locations/rehearse-canonical-refresh.ts \
  HYPE.sqlite SOURCE_EXPORT_DIRECTORY CURRENT.sqlite \
  .local/places/NEW-canonical-refresh-rehearsal
```

The command backs up HYPE read-only, then invokes the actual durable refresh loop
against the read-only local source API. No source responses are mocked. New runs
capture every source-linked Place with associated Features and require acknowledged,
publication-pinned exact-ID lookup. Existing catalogue cursors remain compatible with
migration 0121, but this fresh-run command deliberately requires an idle input.

Completion requires all captured items to have durable outcomes, unchanged reviewed
identities/associations/overrides, integrity/FKs, and an idle replay with zero requests
or database changes. The private receipt records the backup hash, processing outcomes,
changed tables and source request count. Source, primary HYPE, publisher-feed dispatch,
routing-service invocation and deployed cron delivery are outside its mutation scope.

The real imported-data rehearsal completed the full captured set of one associated
canonical Place in six steps and four source requests. Facts adoption preserved values;
location remained under review, without geometry or MTR changes. Reviewed identities
and explicit corrections survived; idle replay and integrity checks passed. This
replaces the unfinished full-catalogue performance rehearsal, whose partial checkpoint
was retained when it was deliberately stopped.

## Consolidate an existing twenty-table local installation

Migrations 0122–0125 reduce Places storage to nine dedicated tables, moving settings
and detached brands to Project/Feature and decisions/receipts to their owning records.
They preserve all old business/audit values; only the unused publisher diagnostic
pipeline is retired. Retain its old pages in the database backup.

Rehearse against an explicit pre-0122 local snapshot in a new private directory:

```sh
python scripts/locations/rehearse-simplification.py INPUT.sqlite .local/places/NEW_SIMPLIFICATION_REHEARSAL
python scripts/locations/test_simplification.py
```

The command creates `before.sqlite`, migrates `result.sqlite` atomically and writes a
count-only `receipt.json`. It checks every pre-existing column in retained tables,
every moved policy/decision/merge/redirect/receipt, integrity, foreign keys and exactly
nine dedicated tables without compatibility views. It never modifies its input.
The populated fixture covers states absent from the primary local database.

After successful rehearsal, take a fresh primary backup and apply the same migrations
locally in one transaction with the migration ledger. Verify against that backup before
committing. Do not reuse a migrated result as the input for this conversion command.
Normal migration tooling uses `d1_migrations` to skip already-applied versions.

Rehearsal on 20 October 2026 preserved the accepted Fitfort identity and redirect and
all retained columns across 76 tables. The fresh production-export import rehearsal
split 1,190 Features, imported 330 donor/dropoff Features and replayed unchanged.
Canonical refresh on a converted copy completed in six steps/four source requests,
retained identities/overrides, held location for review and replayed idle unchanged.
Private artifacts are under `.local/places/simplification-*`; do not publish exports.

## Organisation ownership conversion (0135)

Private Places now use `ownerOrganisationId`; Project adoption settings remain on
`project`. Migration 0135 translates persisted owners and retained identity-review
comparison tokens, preserves identity/redirect/decision evidence, and rejects missing
Organisation ancestry. Association triggers resolve the persisted Project owner and
block cross-Organisation Feature and Project moves. Shared Places retain null ownership.

Rehearse this conversion alone on a database through 0134:

```sh
python scripts/locations/rehearse-organisation-ownership.py \
  INPUT.sqlite .local/places/NEW-organisation-ownership-rehearsal
```

The 2026-10-20 conversion rehearsal preserved 2,850 Places, including 1,520 private
Places, and the retained identity review. All other tables were unchanged; integrity
and foreign keys passed. The primary local database has 0135 recorded and the expected
Organisation foreign key. Its Place rows and review evidence match the rehearsed
conversion; ongoing unrelated local edits mean a whole-database byte comparison is
not an appropriate post-application check.

The subsequent full import rehearsal applied 27 pending migrations through 0135,
including intervening non-Place migrations. It split 1,202 existing Features, imported
311 donors and 19 drop-points, excluded 155 donors without runs, and retained all 64
reviewed MTR decisions. Result: 1,613 Features, 1,532 Places and 1,532 associations.
The additional 12 splits versus the earlier rehearsal came from the intervening
migration set. All newly generated Place IDs are opaque. Import replay was unchanged.

Canonical monthly refresh on the converted copy completed with zero failures, held
the affected Feature for review, preserved identities and overrides, and made no
changes on idle replay. Address-curation rehearsal also verified automatic adoption,
per-Project review isolation, preserved overrides and idempotency. Real Organisation
policy tests permit its owner and reject Project-only roles and other Organisation
owners. Chromium verification on an isolated local database confirmed the Organisation
selector, HKFoodWorks private Place results and the corresponding detail page, with
no page errors. The dev server was stopped after the check. Production application
remains a release step.

## Display preview

The fresh 2026-10-20 12:05 UTC input bundle is privately retained at
`.local/places/address-contract-refresh-20261020/`, with schema metadata, SQL export,
restored HYPE SQLite, complete Breadline mirror, integrity receipts and SHA-256 hashes.
The isolated `address-contract-rehearsal-20261020` rehearsal applies 27 pending
migrations, splits 1,205 Features, excludes 56 intangible Features and 26 drafts,
and imports 311 donors plus 19 drop-points. It excludes 155 donors without runs.
All 64 accepted MTR choices survive; #558/#727 still lack entrance mappings.
Replay matches all 330 imports without adding rows; integrity and foreign keys pass.
This is working-tree evidence, including the separate pending property migrations,
not certification of a clean release commit.

The reproducible display preview command is:

```sh
bun scripts/locations/preview-address-migration.ts SPLIT.json CANDIDATES.json \
  SAANSEOI_CURRENT.sqlite PRIVATE_OUTPUT_PREFIX
```

It writes a complete JSON comparison and a short Markdown sample. The current preview
retains all 3,537 localized displays across the 1,205 existing eligible Features when
converting to authored content. Matching against the local SaanSeoi publication finds
335 Features with exact-name candidates, 870 with proximity-only candidates, and zero
meeting the existing name-plus-unique-phone corroboration criterion. Of the leading
name candidates, 305 have no usable canonical address in the pinned dependencies.
Candidates remain unaccepted; the output is private and is not a migration instruction.

## Shared address implementation verification (2026-10-20)

The fresh rehearsal using the retained production exports splits 1,205 Features,
imports 311 donors and 19 drop-points, and excludes 155 donors with no recorded runs.
The 64 reviewed MTR decisions remain applied. Replay produces no database changes.
Address content is parsed through `@saanseoi/address`; original display strings and
source provenance remain available. Unknown premises components require curation.

No granularity repair command is needed. The obsolete repair tooling is removed.
Upstream address reconciliation and retirement of local content remain tracked in
[#233](https://github.com/tijptjik/hype/issues/233).

## Fresh primary local rebuild — 21 October 2026 (Refs #194)

Read-only production exports of HYPE and all 15 Breadline tables were refreshed on
21 October. HYPE canonical tables were exported individually because the full D1
export rejects virtual FTS tables; the restore utility rebuilt derived FTS indexes.
The fresh HYPE source contained 1,275 Features. No production writes were performed.

Applied all 30 pending migrations through `0138_location_storage.sql`, split 1,205
existing Features, then imported 311 donors and 19 drop-points. The donor import
excludes 155 donors without recorded runs; scheduled dates constrain the review
cohort, not the import policy. All 64 reviewed MTR decisions were retained. The
accepted labels for donors #558/#727 still need entrance mappings.

The primary local database was replaced with the rehearsed result, retaining a
pre-activation backup. It contains 1,617 Features and 1,535 Locations, each with
one initial revision, association and association-history row. Kinds are 311
`establishment` and 1,224 `unknown`; unmatched legacy baselines are not silently
assigned source identities. All Location IDs are opaque 12-character IDs.

Import replay matched all 330 imports and created no additional rows. Integrity
and foreign-key checks pass. All nine lifecycle tables now use Location names;
there are no Place compatibility tables/views. Populated migration tests cover
identity review/redirect receipts, nested baselines, history preservation, immutable
guards and unmodified raw source payloads. Private exports, hashes, activation
receipt and backups are under `.local/locations/refresh-20261021/`.

Current runtime paths are `src/lib/locations/`, `scripts/locations/`,
`workers/location-refresh/` and `/admin/locations`. Historical migration names
and upstream SaanSeoi `places` contracts intentionally retain their original names.
The refresh worker rename is local source/configuration work; it has not been deployed.

Post-install preparation completed against the primary local database: October
division release `data-hk-divisions-2026-10-01.0`, zero pending division jobs, valid
integrity and foreign keys, and both reserved development personas initialized.
The final schema has no legacy Place tables or local Place-named columns.

Validation: 496 Vitest tests across 38 files pass, plus 30 Bun domain/import/split
tests, nine Python historical/matching tests, the synthetic address-curation and
adoption rehearsal, and the Location refresh worker TypeScript check. Full app
checking retains its baseline 10 errors and 19 warnings. Chromium verified the
Organisation-scoped directory, imported Location details and Project Locations
tab against the primary local database.
