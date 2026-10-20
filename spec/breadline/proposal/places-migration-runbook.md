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

The completed 2026-10-20 rehearsal applied 11 missing migrations (0109–0119), split
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
snapshot. A production executor must preserve those per-Feature transaction and
conflict/replay checks rather than bypass them with unguarded inserts. Generating this
bundle does not grant deployment authorization.

Before release, retain the selected source exports and code/migration hashes, review
all exclusion/review outcomes, provide the production data-split execution path, and
repeat verification against the actual release target. Deploy the required SaanSeoi
canonical `filter[id]` support before enabling HYPE's exact candidate reader. Configure
and deploy the Place refresh worker only in the separately authorized release step.
Retain the production recovery bookmark and verify application/worker state afterward.
None of those production actions has been performed by this rehearsal.

Schedule/time-window import remains separate under #195/#196. Canonical Place identity
and Address curation decisions remain explicit reviews; unresolved fallback records are
not automatically upgraded by this procedure.
