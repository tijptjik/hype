# Places migration rehearsal and release handoff

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). Domain:
[Places and Features](01-places-features.md).

## Inputs and command

Use a complete retained HYPE SQLite export and Breadline mirror. The initial remirror
receipt is `.local/places/remirror-receipt.json`; a SQLite copy of it is not a new
production export. The source Address/Place API mirror is independent of this import:
this procedure intentionally creates unresolved baselines rather than accepting name or
proximity suggestions as canonical identities.

From the HYPE repository, with Bun, Python 3 and installed dependencies:

```sh
bun scripts/places/rehearse-migration.ts \
  .local/places/hype-production-20261020.sqlite \
  .local/breadline/mirror.sqlite \
  .local/places/NEW-migration-rehearsal
```

The output directory must be new and under `.local/places/`. Existing artifacts are
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
   unresolved Place, preserved effective values and original provenance. Draft,
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

The completed 2026-10-20 rehearsal applied 12 missing migrations (0109–0120), split
1,190 Features, excluded 56 intangible Features and 25 drafts, imported 311 donors plus
19 drop-points, and skipped 155 donors without recorded runs. Replay created zero
records and matched all 330 imports. All 64 reviewed MTR decisions were retained.
Result: 1,601 Features, 1,520 Places and 1,520 associations; original Feature data
preserved, replay unchanged, integrity valid and zero foreign-key violations.
Additional canonical candidates mirrored during earlier development are not inputs to
this production-export rehearsal and are not accepted canonical matches.

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
bun scripts/places/execute-feature-split.ts \
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
bun scripts/places/rehearse-identity-match.ts \
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
