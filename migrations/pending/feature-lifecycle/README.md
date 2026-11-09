# Feature lifecycle cutover

Target: a Feature has one accepted current revision, independent of public visibility.
Proposals contain partial changes; accepted identity operations connect exact revisions.

This directory is not an applied migration. The old database must remain writable by its
current services until all readers/writers have switched and conversion rehearsal
passes. Do not run a target schema directly against a live database.

Conversion must preserve:

- Every accepted revision, change-set actor/reason, visibility event, and private edit.
- Proposal/review evidence, including previously stored full candidate snapshots.
- Exact image revision/file pins and the original files on replacement.
- Identity operation members and redirect choices (merge and split use dispositions).
- Task outcomes, contribution ownership, pending upload evidence, visits and wishlists.
- Existing baseline attribution, including unknown historical visibility/archive state.

New creation proposals have no Feature row. Existing provisional rows cannot simply be
deleted: their historical foreign keys must be reconciled before task conversion.

The obsolete publication/private/preparation tables may be dropped only after their
information has been converted and no runtime reader/writer depends on them. A copy of
the actual development database must pass conversion, foreign-key checks, record and
image-reference reconciliation, and service acceptance checks before live apply.

## Staged implementation (7 November 2026)

The target-schema services are in `src/lib/db/services/featureLifecycle*.ts`. They cover
direct accepted edits, visibility/archive events, partial proposals and explicit
conflict resolution, creation proposals, duplicate adoption, atomic split/merge, task
preparation/completion, immutable image replacement and effective public redirects.
Split children receive independent names and Location bindings; retired sources lose
active Location/property/gallery subscriptions while retaining complete snapshots and
historical task/visit references.

The existing accepted-capture, status, publication, text-workspace and public-successor
adapters detect the new schema and route to this writer after cutover. The Feature form,
task contribution/review, immutable upload, History and identity-dialog adapters now
route through the corresponding lifecycle services. The target bindings are deliberately
not exported through the main schema; the live development database still uses the
previous schema.

`bun scripts/dev/feature-lifecycle/inspect.ts SOURCE.sqlite PRIVATE-OUTPUT.json` opens a
read-only transaction and creates a private artifact with source hashes, converted
proposal/review deltas, upload evidence and baseline/identity evidence. It verifies that
each delta reconstructs the exact old candidate. It neither writes the source nor
constitutes a full migration rehearsal. The inspected development snapshot had 428
proposals, 710 review versions and 179 upload evidence rows; every proposal/review
candidate reconstructed exactly. Existing initial identities are retained as legacy
update proposals in this preparation artifact; future creation proposals allocate no
Feature row before acceptance.

The complete conversion rehearsal now passes on a private development snapshot: 1,657
current Features, 1,671 legacy events, 428 proposals, 710 reviews and 179 upload
receipts. It retains 2,111 asset versions, 2,126 image revisions and 2,897 original
Feature-image pins. Foreign-key checks pass and SQLite integrity is `ok`. The live
development database has not been changed.

`bun scripts/dev/feature-lifecycle/smoke.ts MIGRATED-REHEARSAL.sqlite` opens that
rehearsal read-only and exercises services on a temporary private copy, then removes the
copy. It reads every current Feature/history and partial proposal, reviews two migrated
initial submissions, and executes direct edit, split and merge operations. It checks
foreign keys and integrity after the writes. These checks pass against the rehearsal
snapshot; they do not establish browser or complete API readiness.

Task read scope now accepts creation proposals without provisional Features, with author
and live layer/project/organisation checks. Migrated task-transfer restrictions read the
retained immutable change-set evidence. Migrated initial review uses the partial
proposal and accepted-history writer, preserves unrelated edits and visibility, and
decides task/photo evidence atomically instead of falling through to legacy writes.

The latest cleanup rehearsal converts 52 unfinished creation drafts without allocating
new Feature rows: 1,605 accepted Features and 426 active proposals remain. Before-images
retain the removed provisional records and redundant upload proposals; all original
image assets, metadata versions and task-image links are conserved. Creation acceptance
produces an unpublished Feature. The smoke command also accepts `--reject-creations`.

The managed release planner now enrolls resource/logo baselines, prepares the target
schema on a private copy, and replays a separate atomic schema group with foreign keys
enabled. It then converts unfinished drafts in resumable cleanup groups. Incoming
foreign-key dependents are rebuilt together; existing Feature and change-set identities
stay in place. The offline converter's `foreign_keys=OFF` SQL is never replayed on D1.

The development snapshot now prepares with 2,117 verified baseline images, including
exact retained metadata where legacy sidecars are missing. Unreferenced image rows
remain unchanged. Still required before application: authenticated end-to-end browser
verification, a clean release typecheck and the final deployment rehearsal. This
directory remains outside numbered migrations: the managed planner owns the schema
transition and enforces baseline completeness. No successful local rehearsal authorizes
live application.
