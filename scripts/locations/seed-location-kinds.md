# Deterministic Location kind seed

Refs [#194](https://github.com/tijptjik/hype/issues/194). Technical domain:
[Locations and Features](../../spec/breadline/proposal/01-places-features.md).

`seed-location-kinds.py` reads an explicitly named SQLite snapshot and produces a
versioned JSONL inventory, one assertion per Location, separate unresolved
unassociated-Feature assertions, a guarded executable SQL plan and a compensating
rollback plan. It never connects to a remote service. No runtime/schema contract is
added: an eligible owner baseline uses the existing `organisation-baseline-edit` payload
with `actorId`, `organisationId`, `previousRevisionId`, `typeChange` and
`provenance.locationKindSeed`. Facts are copied exactly, and `location.kind` is the only
existing value changed.

## Persisted scope

The planner resolves Organisation and Project codes through persisted ancestry, then
inventories all specified layers without publication, archive, visitability, draft or
intangible filtering. Layers have no code column; their stable IDs are used instead. A
Feature's subject does not determine its Location kind.

| Dataset                | Organisation code / ID          | Project code / ID                        | Included layer IDs                                             |
| ---------------------- | ------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Ghost Signs            | `hkghostsigns` / `4Jsk5LngvFZq` | `hkghostsigns` / `YuSFnia9VOtG`          | `7akti7OImSFg`                                                 |
| ELN venues             | `eunic` / `KpeoIsOhgyP-`        | `eln` / `vGBvWfSZNELM`                   | `lvWu_dCwiVZt`, `0bf1RYWdpaAt`, `vli8hfmD-XEZ`, `zJJawV9ay56p` |
| Independent Bookstores | `cmef` / `kXCT_5XMH1Nj`         | `independentBookstores` / `-z26MuNRTJwi` | `RfWMLs_jW6QJ`                                                 |
| Breadline donors       | `hkfoodworks` / `2u4orWMxRNbz`  | `breadline` / `UMsz5DHb29Lx`             | `1msQMcuqfHrP`                                                 |

All persisted ELN edition layers are included, including the unpublished 2027 edition:
these are venue Locations associated with book Features. Breadline's `kin0shUTfrUi`
dropoff layer is excluded. The Ghost Signs project's two empty, archived Neon layers
(`4KZSKPircRIN`, `R2gBlTWfqpIj`) are explicitly inventoried as excluded, as is the
separate Neon project. Neither Neon names nor proximity imply a deterministic type.
Breadline import crosswalks are retained in the private inventory; a dropoff source
identity in the donor cohort produces a conflict.

## Guard and replay behavior

Only an unknown, owner-controlled, local unmatched/manual Location is eligible. An
already-correct kind is a no-op. Contradictory kinds, mixed dataset requirements,
source-linked identities, source revision evidence, foreign owner authority and sharing
with an unclassified dataset remain explicit review decisions. A building / tenant
conflict needs reviewed reassociation or identity splitting; this planner creates
neither identities nor associations. Original Location/Feature IDs, ownership, immutable
evidence, correction heads and Feature acceptance tokens are preserved.

The plan fences logical schema and migration ledger, complete persisted ancestry, scoped
Feature values and counts, all shared associations, source crosswalks, Organisation
corrections, current Location values and immutable baseline heads. All fences execute
before authoring. Stale data aborts the whole transaction. Replay requires this exact
plan's immutable baseline and resulting kind; merely finding the desired kind does not
establish a successful previous application.

The existing `location_local_change` trigger queues one local refresh item for each
appended baseline. This is part of the current authoring model. Application never edits
Features or adopts their new baseline as a side effect. Queue processing and subsequent
Feature adoption remain governed by the existing policy.

Rollback appends another owner baseline with inverse `typeChange`, retaining the forward
revision, provenance and normal queue evidence. It restores only the kind, requires the
forward baseline to remain the head, and rejects later edits. A reviewed rollback cannot
be overwritten by replaying the forward plan. The local runner backs up the destination
before application. Restore a full backup only as an explicitly reviewed recovery
operation when unrelated later changes are absent.

## Commands

Use new output directories; artifacts contain internal evidence and belong in an ignored
private directory. The actor is an explicit historical migration identity, not an
inferred logged-in user. Planning opens SQLite read-only in a consistent read
transaction.

```sh
python3 scripts/locations/seed-location-kinds.py \
  --database /absolute/path/to/snapshot.sqlite \
  --actor migration:location-kind-seed-refs-194 \
  --output .local/places/kind-seed-plan

python3 scripts/locations/seed-location-kinds.py \
  --database /absolute/path/to/isolated-copy.sqlite \
  --apply-plan .local/places/kind-seed-plan/plan.json \
  --output .local/places/kind-seed-application

# Compensating rollback on the same isolated copy:
python3 scripts/locations/seed-location-kinds.py \
  --database /absolute/path/to/isolated-copy.sqlite \
  --apply-plan .local/places/kind-seed-plan/plan.json --rollback \
  --output .local/places/kind-seed-rollback

PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/locations -p test_seed_location_kinds.py -v

PYTHONDONTWRITEBYTECODE=1 python3 scripts/locations/rehearse-location-kinds.py \
  --database /absolute/path/to/populated-snapshot.sqlite \
  --output .local/places/kind-seed-rehearsal
```

The local runner rejects active `.wrangler` database paths, including symlinks resolved
to them. SQL files require one error-propagating atomic transaction; do not apply them
through Bun's multi-statement `exec`. The runner executes each SQL statement inside one
transaction and checks foreign keys/integrity before commit.

## Populated local acceptance, 21 October 2026

The source was a SQLite backup of primary local HYPE at migration
`0141_organisation_location_scope_guards.sql`; primary local HYPE was read only. Private
evidence is in `.local/places/location-kind-seed-20261021-handoff/`.

| Dataset                | Features | Unique Locations |    Eligible changes | Already correct | Unassociated |
| ---------------------- | -------: | ---------------: | ------------------: | --------------: | -----------: |
| Ghost Signs            |      517 |              484 |     484 to building |               0 |           33 |
| ELN venues             |       39 |               39 | 38 to establishment |               1 |            0 |
| Independent Bookstores |      128 |               79 | 79 to establishment |               0 |           49 |
| Breadline donors       |      311 |              311 |                   0 |             311 |            0 |
| Total                  |      995 |              913 |                 601 |             312 |           82 |

The inventory includes 14 archived Features, 311 Breadline source mappings and zero
canonical source-linked Locations. The 82 unassociated Features comprise 26 drafts (19
Ghost Signs, seven bookstores) and 56 intangible records (14 Ghost Signs, 42
bookstores). These flags explain existing inventory; they do not assert lifecycle status
or authorize changing the flags or inventing Locations. All 82 remain unresolved until a
separate association review supplies an eligible identity.

Forward rehearsal preserved 1,617 Features, 1,535 Locations and 1,535 associations.
Kinds changed from 312 establishment / 1,223 unknown to 484 building / 429 establishment
/ 622 unknown. It appended 601 baselines and exactly 601 expected refresh items. All old
revisions and Location fields other than kind are identical; 74 unrelated tables have
identical fingerprints. Integrity is `ok`; foreign-key violations are zero. Both
exact-plan replay and fresh planning produce zero changes. Compensating rollback adds
601 inverse revisions; its replay adds zero.

A separate populated adversarial copy includes a Location shared by Ghost Signs and ELN,
a source-linked establishment associated with Ghost Signs, existing correct donors and
all unassociated Features. Its two conflicts remain untouched; a stale kind rejects the
complete plan atomically. The focused suite additionally checks stale baseline,
association, correction, schema and cohort changes, actor and plan tampering, no-op
preservation and immutable rollback history.

Evidence files:

- `plan/plan.json`, `plan/manifest.jsonl`, `plan/features.jsonl`,
  `plan/conflicts.jsonl`, `plan/counts.json`, `plan/apply.sql`, `plan/rollback.sql`:
  exact target inventory and executable plans.
- `before.sqlite`, `receipt.json`: backup, before/after counts, preservation hashes,
  replay and inverse-revision receipts. `rehearsal.sqlite` is left after rollback.
- `adversarial-plan/`, `adversarial-receipt.json`: actual-schema conflict/stale checks.
- `cli-plan/`, `cli-application/`, `cli-target.sqlite`: standalone planner/runner
  acceptance.
- `eln-replay-receipt.json`: ELN generator replay on a seeded copy preserves all four
  Location/association/correction tables; generated output was intercepted.

## Dependencies and integration boundary

No numbered migration is claimed. Agent 7 must assign a filename after coordinating the
actual migration head and contracts. This plan already contains an executable data
migration; its filenames are `apply.sql` and `rollback.sql` inside the private plan
directory. Regenerate after any schema, scope or authoring changes, and reconcile Agent
3's supported Neon proposals before applying a combined plan.

`scripts/breadline/features.ts` already creates donors as `establishment`, leaves
dropoffs unknown, and preserves existing Location kinds on source replay. Its six
focused importer tests pass. `scripts/eln/generate.py` writes content/publication
metadata without editing Location tables. Its replay was executed on a populated, seeded
isolated copy and preserved Location kinds, immutable revisions, associations and
corrections. No generator changes are needed for these replays. For newly associated
ELN/Ghost Signs/bookstore Locations from the generic split pipeline, regenerate and run
this guarded seed stage after association planning; unassociated drafts/intangible
records cannot be repaired by a kind-only seed.

Remote rollout is unexecuted and requires an exact authorized database/environment,
fresh target snapshot, coordinated migrations, active-writer handling, a recovery copy
and post-application reconciliation. This handoff does not authorize selecting or
mutating an unspecified remote target. No UI verification applies to this data planner,
and no deployment or primary-local application was performed.

## Offline review tool

Generate a self-contained HTML review tool from the exact seed snapshot and plan:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/locations/review-location-kinds.py \
  --database .local/places/location-kind-seed-20261021-handoff/before.sqlite \
  --plan .local/places/location-kind-seed-20261021-handoff/plan/plan.json \
  --split-manifest .local/places/opaque-baseline-rehearsal-20261021/split.json \
  --output .local/places/location-kind-seed-20261021-handoff/review/index.html
```

The generated file opens directly in a browser without a server or installation. It
starts with the 82 unassociated Features and supports title/address/ID search, dataset
and skip-reason filters, kind-change/no-op review, saved localized content, coordinates,
photos on request, Feature admin links and nearby existing Location leads within 250 m.
Proximity is not a source identity match. Snapshot and plan inputs must agree; no
current live state is claimed.

All 82 missing associations were found in the original split receipt: 56 were excluded
as `intangible`, and 26 as `draft`. The actual guards are in
`readFeatureLocationBaseline` (`src/lib/db/services/locationBaseline.ts:93`). These
exclusions happen before initial Location creation or source matching. An intangible
flag does not establish closure or demolition, and a Point geometry alone does not
establish eligibility. The tool preserves these facts and lets the reviewer recommend
flag review, keeping the record unassociated, a new local identity, investigating a
nearby identity or further research. Existing kinds can be accepted for the seed or
referred for identity review.

Notes and recommendations are stored in browser local storage scoped to the seed plan;
Export reviews downloads versioned JSONL with expected Feature revision, flags,
association tokens, baseline revision and explicit recommendations. Import reviews
validates the plan, records and available recommendations before restoring notes. No
recommendation changes a database row, an association or a flag. A separate reviewed
authoring operation must validate the exported expected values.

The exporter and its assets live in `scripts/locations/review-location-kinds.py` and
`scripts/locations/kind-review/`. The generated HTML and browser receipts stay inside
ignored private artifacts. Desktop/mobile Playwright checks cover the real 995-record
export, all 82 missing associations, filters, notes, local persistence, kind review,
export/import and zero page errors. Screenshot evidence is in
`output/playwright/location-kind-review-{desktop,mobile}.png`.
