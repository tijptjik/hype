# Location lifecycle rollout and Breadline follow-up

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). Contract:
[Location identity, addresses and relocation](../../spec/breadline/proposal/drafts/location-address-occupancy.md).

This is a local implementation and rehearsal guide, **not authorization to deploy**.
Relationship storage, occupancy-driven relocation, canonical address reconciliation and
Task Queue decisions are implemented. The complete A–Z identity workflow is not yet
accepted; the fixture catalogue alone is not acceptance evidence.

## Installed code boundary

- `0148_location_relationships.sql` adds the eight proposed tables, premises kind,
  immutable scoped relationship chains, calendar precision checks, membership cycle
  guards, accepted occupancy/address/membership references and a derived current
  Feature/container index. Historical assertions retain their own endpoints.
- `0149_location_correction_rows.sql` flattens the retained Organisation correction
  arrays into immutable rows. Existing revision tokens become row IDs; a nonmaterialized
  head view supports current reads. The migration rejects duplicate tokens or
  disagreement between the final retained snapshot and the old head.
- `0150_location_placement_candidates.sql` extends the existing proposal table with
  occupancy/address targets and Layer fences. It does **not** activate a relocation
  executor or create a second proposal/task history store.
- Relationship commands validate evidence, scope, endpoint kinds, dates and expected
  predecessors. A transition and its participants commit in one D1 batch. Retried
  identical relationship/transition IDs reuse the retained assertion; conflicting
  content or competing successors fail.
- The Location editor offers current/former/unconfirmed relationships, scoped
  suppression, premises/occupancy creation, and address priorities. Its Feature list
  distinguishes current associations, accepted physical groupings and historical
  placements. Feature visibility is checked before output pagination.
- The Feature Location page and existing Task Queue share occupancy-backed move review,
  Keep here and Review later. Accepted references retain exact immutable relationship
  versions. Migration 0151 adds geometry, policy and proposal receipts.
- Migration 0153 adds immutable address-order receipts, removes address coverage and
  resolves merged identities through a canonical alias view. Merge reviews fence every
  relationship/correction version and accepted binding. Compatible source histories
  remain under their original IDs; the survivor exposes them through the alias view.
  Conflicting correction scopes, incompatible kinds and containment cycles block
  application. Real-world replacement/merge/split lineage remains a separate evidenced
  event and never redirects or relocates Features.
- Relationship catalogues have keyset pagination and version-history controls. Address
  ordering writes the exact reviewed current set atomically, with replay receipts and
  rollback on any failure. At most 100 current addresses can be ordered in one
  operation; larger catalogues remain readable through pagination.
- Migration 0154 renames Location snapshot fields to `version` and `rawSource`, and
  binding/history fields to `version`. Runtime projections and readers use those names.
  Optimistic command inputs retain `expectedRevision` where that is the established
  transport contract; it compares the binding's `version`.

The v1 content schema is unchanged. Renames preserve every stored value and source
content hash; the source-ingestion hash envelope deliberately retains its established
internal `payload` key so identical source evidence does not manufacture a new version.
Existing full snapshots remain readable. Address mirrors are curated canonical content,
not a second Organisation-owned canonical master.

History stores exact accepted relationship IDs, geometry, policy and proposal receipts,
never cloned containers or expanded paths. Older history has null fields where those
facts were not captured. Do not backfill past pins, tenancy or directions by guessing.

## Current development database

Use [the development rebuild command](Development-Database-Rebuild.md) for normal
development: fresh HYPE export, fresh Breadline export, migrations, reviewed data
conversions, then development-only mock ingestion. Browser acceptance uses the normal
local database. The copy-based commands below remain diagnostic tools and historical
evidence, not the default development workflow.

## Operational decisions on the development database

After a fresh rebuild, run
`bun run scripts/locations/accept-placement-local.ts --apply`. This backs up local
SQLite and runs exclusively against a private copy using an explicit Wrangler
persistence path. It rejects already-exercised O/P/Q fixtures. Synthetic policy Layers
and domain decisions remain in that copy, including after failure; they must never
appear in the normal ELN layer list. Real ELN policy is unchanged. It checks
fixed/review/follow, immutable accepted history, replay, exact-set address ordering and
stale rejection. Private state, receipts and before-images go under
`.local/locations/operational-acceptance/`. Never restore the whole copy over concurrent
application changes. Browser decisions on normal development state are a separate check.

This runner covers L/O/P/Q operations, not the entire A–Z catalogue or server
authorization. Complement it with the remote authorization tests and real Task Queue
browser actions. Mistaken-identity splits and arbitrary local-building deduplication
remain unsupported and cannot be signed off by navigating to their fixtures.

After Q has followed its synthetic occupancy, run
`bun run scripts/locations/accept-address-local.ts --apply` with other local emulator
writers stopped. It exercises canonical Keep, convergence/override retirement and Accept
through actual proposals and decisions. It checks same-address pin retention, localized
access directions, immutable source content, stale replay, unrelated-save retention and
unchanged non-fixture Features. Each run retains its own before-image and private
receipt; it does not reset the database or manufacture real-world facts.

## Production release prerequisites

The 22 October inventory found production at migration 0108, with 46 pending SQL files
through 0154. Pin exact hashes and recheck the live migration ledger before application.
The development rebuild command is never a production deployment tool. Migration 0152
depends on the reviewed historical-layer setup; retain that ordering. The app deploy
helper deploys division-refresh and location-refresh before the app, and stops on either
failure. Apply and verify migrations first; worker deployment does not prove that the
resulting queues drained.

A successful bundle is insufficient: require the agreed A–Z operations, type checks,
production-specific data manifests, immutable source/build boundary, before-images, and
live post-deployment checks. Concurrent unreviewed changes must not enter a Location
release merely because they share the working tree. Keep actual acceptance and rollout
completion on issue #194.

## Export diagnostics

D1's ordinary export rejects the existing FTS virtual table. Export an explicit list of
canonical tables, omitting `featureSearchFts` and its shadow tables. Capture the schema
inventory from the same database, including indexes, views and triggers. Use
`scripts/dev/restore-d1-export.ts` to restore those objects and rebuild FTS locally. Do
not remove production FTS to make export work.

```sh
bun run scripts/dev/restore-d1-export.ts canonical.sql schema.json fresh-hype.sqlite
python3 scripts/locations/rehearse-lifecycle.py \
  --source-db fresh-hype.sqlite --output-dir /tmp/hype-lifecycle-rehearsal
```

The rehearsal opens the input read-only, retains `before.sqlite`, applies all pending
migrations transactionally to `rehearsal.sqlite`, records hashes in `report.json`,
checks foreign keys/integrity and repeats migration discovery to prove a no-op replay.
It compares all original Feature IDs, Organisation/Project/Layer ownership, geometry and
publication/archive/draft flags. It separately reports additions by older pending
migrations. On failure, retain the report and before-image and resolve the specific
conflict; do not remove guards or mark the migration applied manually.

Verified on a fresh HYPE export on 22 October 2026: all 1,279 original Features retained
those fields; older pending ELN migrations added 12 Features; no foreign-key or
integrity failures; replay applied nothing. This does not prove the unimplemented
relocation/UI acceptance cases below.

Migration 0149 must also be rehearsed on a dataset with several correction versions and
accepted references to an older version. The focused service tests include that case and
verify exact-token retention. Never rewrite accepted correction tokens to whatever head
happens to be newest.

## Local review fixtures

Choose an existing **local** Organisation, Project and Layer with matching ancestry. The
command only accepts a SQLite file; it contains no remote database mode. Preview without
`--apply`. It saves a before-image before the first write.

```sh
bun run locations:seed:lifecycle --db /path/to/local.sqlite \
  --organisation ORG_ID --project PROJECT_ID --layer LAYER_ID
bun run locations:seed:lifecycle --db /path/to/local.sqlite \
  --organisation ORG_ID --project PROJECT_ID --layer LAYER_ID --apply
```

This creates 104 synthetic Locations and 26 unpublished Features. A second run is a
no-op when the namespace is complete. Restore the fixture before-image to reset edited
fixtures; do not delete immutable audit tables to simulate a reset. No existing
Project/Layer policy is changed by seeding. Test fixed/review/follow in separate
explicitly configured review scopes once the executor is ready.

Each letter has `/admin/features/lifecycle-demo-<letter>-feature` and four Location
pages: `lifecycle-demo-<letter>-shop`, `-building`, `-premises`, `-destination`. The
letter is lowercase in IDs. Private Y records require the supplied Organisation context
(`?organisation=ORG_ID`). Select “Features placed here” or “Past accepted placements” on
the building/premises page to compare groupings.

| Scenario | Starting example and review purpose                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| A        | Unknown identity without invented occupancy.                                                                    |
| B        | Two named revisions of one establishment.                                                                       |
| C        | Separate identities; full merge/split impact review remains to implement.                                       |
| D        | Temporary closure followed by reopening, with occupancy unchanged.                                              |
| E        | Permanently closed business retained with its identity.                                                         |
| F        | Demolished building and distinct replacement, linked by an evidenced event.                                     |
| G        | Feature and operating establishment remain separate; sign-property editing uses the existing system.            |
| H        | Two canonical-content versions of one fixture address.                                                          |
| I        | Two separately identified fixture addresses.                                                                    |
| J        | Qualified shop address.                                                                                         |
| K        | Feature pins the old canonical version while a newer version exists.                                            |
| L        | Two ranked address choices; clear/change rank in the Location editor.                                           |
| M        | Building inside premises. Nested/multiple membership writes are supported by the service.                       |
| N        | Former episode plus a new return episode at the same building.                                                  |
| O        | Accepted old placement remains while the business has a new occupancy. Configure fixed policy explicitly.       |
| P        | Unconfirmed destination retains old placement; an evidenced proposal supports Move, Keep here and Review later. |
| Q        | Verified current destination follows only when policy and every review gate permit it.                          |
| R        | Direct building association derives its premises grouping.                                                      |
| S        | Later facts do not silently change the accepted facts or placement.                                             |
| T        | Review against existing Project/Layer policy controls; no fixture changes their settings.                       |
| U        | Source availability is missing, without closure or identity deletion.                                           |
| V        | Scoped suppression leaves the shared occupancy intact.                                                          |
| W        | Former/current occupancies alongside a Feature retained at its old placement.                                   |
| X        | Unlinked Feature leaves accepted relationship history behind.                                                   |
| Y        | Private endpoints excluded from shared relationship reads.                                                      |
| Z        | Stable fixture namespace for replay; service tests exercise competing successors and rollback.                  |

These are review starting points. In particular C, G, O–Q and T do not constitute
complete execution tests simply because their rows exist.

### Repeatable fixture and browser acceptance

Audit the **actual database used by Vite**, not an adjacent copy under `v3/d1`. Use the
normal `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` database; leave
`HYPE_DEV_STATE` unset. The audit reads a consistent SQLite snapshot without writes,
checks one explicit starting-state invariant for every letter, and generates links using
each Feature's persisted Organisation. Feature links open `#location`.

```sh
python3 scripts/locations/audit-lifecycle-fixtures.py \
  --db /path/to/local.sqlite --base-url http://127.0.0.1:4174 \
  --markdown /tmp/location-scenarios.md > /tmp/location-fixture-audit.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
  bun run scripts/locations/verify-lifecycle-browser.ts \
  /tmp/location-fixture-audit.json /tmp/location-browser-report.json
bunx vitest run src/tests/location-lifecycle-acceptance.test.ts \
  src/tests/location-relationships.services.test.ts \
  src/tests/location-linked-features.test.ts \
  src/tests/layer-relocation-policy.services.test.ts --config=vitest.config.ts
```

Start the review server against normal development state with
`bun run dev:agent admin --port 4174`. This seeds reserved development personas using
the existing local helper. Never point the demo at a remote binding. Keep generated
catalogues/reports local; their links contain real review-scope IDs. The browser command
checks all 26 Location pages and Feature Location tabs, including accepted references
where present. It does not click move decisions or claim map-tile acceptance.

The additional service acceptance suite exercises N + V + Z together: an ended episode,
a return to the same building, scoped suppression of the return, identical replay, and
rejected stale/conflicting writes without row changes. Y + Z verifies that a private
episode remains absent from shared and other-Organisation reads and cannot be
republished into shared scope. Existing suites cover accepted grouping, unlink history,
transition rollback, policy fences and authorised Feature pagination. These
service-level checks do not replace remote-API permission-revocation tests.

On 22 October the audit detected an obsolete C fixture in the previous browser database.
The corrected seed database was copied into a new isolated review state; the previous
review database and its editor changes were preserved. All 26 corrected starting-state
checks and 19 focused service tests passed. A new rehearsal against the saved fresh HYPE
export preserved the same 1,279 original Features, added only the 12 records from older
pending migrations, passed integrity/foreign-key checks, and applied no migrations on
replay. This was not another production export. Chromium verified all 52
Location/Feature pages without page errors. Separate browser checks confirmed W's
retained Feature under “Features placed here” at the former building and X's unlinked
Feature under “Past accepted placements”. The browser runner includes both grouping
checks. Full `bun run check` still reports 10 errors and 19 warnings outside the new
acceptance suite.

After the adoption engine lands, extend acceptance through its actual planner, decision
and execution APIs for O–Q, K, S and T. Assert the post-decision Feature pin,
address/access directions, exact history and policy references, routing work,
rejected/deferred target retention and rollback on stale authority/head/policy. Do not
replace these operations with SQL that directly installs their expected state.

## Required lifecycle completion before activation

The relocation/address/queue subset now has a guarded executor and focused acceptance:

- `addressCanonical` retains validated publisher content by identity/content hash.
  Curator imports require the expected preceding canonical ID; publication-verified
  source refreshes use the existing run lease. Same-content observations reuse the
  immutable content version; later publication observation receipts still belong to
  source refresh history, not rewritten canonical payloads.
- `locationPlacement` separates same-address corrections from occupancy changes. It
  resolves Project/Layer policy, checks evidence/current occupancy, destination
  visibility and connected ancestry, then fences the Feature, binding, correction,
  policy counters and resolved relationship snapshot in the commit transaction.
- `fixed` stays put. `follow` applies only when no review gates remain. A reviewer
  explicitly handles address differences, pins, unit details and localized directions.
  Keep here is a durable rejection of that exact target; Review later leaves it pending.
  Missing addresses and unconfirmed occupancy remain reviewable, never inferred.
- Sparse address overrides pin their base version. Accept retires differences; Keep
  reasserts only values differing from the new canonical version. Ordinary facts saves
  preserve the accepted pin, address and access-direction history.
- The existing queue projects occupancy/address candidates independently of facts
  revisions. Relationship writes reconcile bounded Feature pages; the editor exhausts
  returned cursors. Canonical ingestion callers must likewise resume `nextCursor`
  through `reconcilePlacementPage`. Geometry triggers retain durable routing jobs;
  successful remote moves also wake routing enrichment.

Remaining broader lifecycle work before complete A–Z activation:

6. Complete acceptance of every identity variant, including mistaken-identity splits and
   arbitrary local building deduplication. The implemented merge executor remains the
   reviewed local-to-SaanSeoi identity consolidation path. The new impact fence, alias
   resolution, correction retention, lineage editor, ordering and pagination are
   implemented and tested; this does not broaden the executor to every identity kind.
7. Verify all A–Z variants and combinations using service calls and browser actions,
   including revoked permission, private evidence, stale head/policy/reparenting races,
   planned moves, ambiguous containers, and preservation of media context.
8. Inspect the other thread's final `isVisitable`/`isIntangible` contract and integrate
   it last. This implementation has not duplicated or replaced those flags.
9. Apply the exact six-dataset policy manifest only after selecting the rollout
   environment and rechecking its persisted IDs and policy revisions. The local
   rehearsal covers all six datasets and ten Layer rows, with zero replay changes.
   Project defaults and unrelated settings remain unchanged.

Keep public delivery/acceptance status in issue #194 and parent #180; this guide is
technical handoff material, not a substitute progress tracker.

## Breadline follow-up after HYPE schema/API/UI acceptance

Do not run Breadline imports as part of the HYPE migration rehearsal.

- Export Breadline separately, preserve the original source keys and take independent
  before-images. Update the importer for immutable Organisation correction rows and the
  new binding fields; do not replay its old mutable `history` writer.
- Preserve curated address-parentage as source evidence for future premises/building
  relationships. Matching text, street-number ranges and old successor pointers are
  insufficient to infer physical membership or branch continuity.
- Distinguish continuing donor establishments, dropoff subjects and their accepted
  physical placements. Uncertain containers remain unresolved; do not manufacture
  unit/floor Locations to make joins succeed.
- Resolve donor/dropoff Organisation/Project/Layer IDs explicitly and prepare guarded
  follow-policy settings with before/after revisions. Policies do not themselves move
  imported Features.
- Rehearse canonical-address mapping, source snapshot retention, original IDs,
  ownership/publication, routes, contact data and media before activation. Produce row
  counts, conflict inventory, content/reference checks, rollback and replay receipts.
- Revisit `scripts/locations/lib/rehearse-curated-adoption.ts` and all external import
  SQL that targets the old Organisation correction array or positional binding inserts.
  Coordinate SaanSeoi's address-content rollout separately; no upstream maintenance or
  production hash rewrite occurred in this HYPE implementation.

## Verification recorded for this implementation

The focused service run passed 160 tests across Location services, lifecycle statuses,
new relationships and reverse Feature lookup. Browser checks used an isolated migrated
fixture database and the reserved local admin: the N occupancy view, M premises view and
a scoped “mark former” write succeeded. The development server was stopped after
verification. Full `bun run check` still reports 10 errors in unrelated map, panel and
existing test files; no clean repository-wide check is claimed. The public map tile
surface was not part of this UI acceptance.

### Placement acceptance rehearsal (22 October 2026)

Migration 0148–0151 rehearsal retained all 1,617 existing Feature rows with identical
content hashes, passed integrity/reference checks, and replayed with zero migrations.
The before-image remains available alongside the ignored local rehearsal report. The
201-test focused suite and Location refresh worker type-check pass. Service tests cover
fixed/review/follow, Layer inheritance, replay, directions/unit preservation, sparse
correction rebase/retirement, missing addresses, private targets, stale policies, source
leases, atomic rollback, canonical import fences and authorization. Browser actions on
isolated synthetic records verified Move (new pin and history), Keep here (old pin and
rejected receipt), and Review later (old pin, pending proposal). No production database
or primary development database was changed by this rehearsal.

### Relationship and naming acceptance (22 October 2026)

The application build and Location refresh worker type-check pass. The expanded
Location/Task Queue suites passed 501 tests across 49 files; subsequent focused tests
also cover correction-history retention during merge and scope-separated cycle checks.
The full application check retains 10 unrelated errors and 19 warnings.

A fresh 0148–0154 rehearsal preserves all 1,617 Features and 1,581 immutable Location
source snapshots/content hashes, passes integrity/reference checks and replays without
changes. Address fixtures now validate against the shared SaanSeoi content schema.

Browser verification on isolated synthetic data covers all 26 A–Z Location pages, saving
a complete address order, reading version history and authoring replacement lineage.
These page checks are smoke acceptance, not proof of every A–Z operational variant.
Move/Keep/Review later were verified in the preceding placement run.

`scripts/locations/rehearse-dataset-relocation.py` validates exact persisted dataset
identities and creates a versioned JSONL manifest, before-image, guarded local apply and
replay receipts. It does not write a remote database. The rehearsal changed ten Layer
policies for six datasets with zero conflicts and no Feature changes.

Remote rollout has no selected environment in this execution session. No production or
primary development database was mutated. A built artifact alone is not a deployed or
fully accepted release.
