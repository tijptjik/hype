# Breadline donor naming proposal

Refs #194. Applied to the local database on 12 November 2026 after approval. Not applied
to remote databases. This is a snapshot-specific data migration, not a schema migration
to run automatically at deployment.

The proposal covers 311 imported donors and 933 localized titles. 508 titles change. The
CSV also lists the 16 newer research/test records unchanged (949 rows total). All
proposed donor names are unique within each language.

Review: `outputs/breadline-donor-naming-review/before-after-difference.csv`.
Machine-readable approved review: `outputs/breadline-donor-naming-review/review.json`.
The refreshed application snapshot is
`outputs/breadline-donor-naming-review/applied-review.json`; all 933 donor rows are
identical to the approved review. It excludes 17 research/test records, including one
added since the CSV was prepared.

## Composition and scope

Compose localized brand plus optional outlet format, followed by `-` and branch. When
there is no branch, use the standalone Location name, then the Feature name. Combine
localized access hints and an explicitly true paid label in one parenthesis, separated
by `-`: `(D - Paid)`, `(Tickets - Paid)`, or `(Paid)` alone. Missing paid status remains
unknown, rather than being inferred as unpaid.

Branches and outlet formats use existing localized Location fields. Store letters and
positions use Feature address access hints; letters are not interpreted as exits.
Whampoa estate block letters remain in branch names. Paid status uses the existing
Breadline project property `mtrPaidArea`; consequently this template is restricted to
the Breadline project. `join` in the shared editor preserves either available part
without a dangling separator. Feature access hints cannot be used by Location templates.

The migration also versions the Donors layer naming policy: future Place features
inherit this template. Other feature-type defaults, the inherited type catalogue, and
other layers remain unchanged. Existing donors receive explicit pinned assignments.

## Trading-name and format exceptions

- All 54 Maxim's Cakes donors compose brand `Maxim's` with English format `Cakes`. The
  Chinese brand already includes 西餅, so no additional Chinese format is appended.
- Seven names use standalone fallback: Childhood Bakery, Dee Dee Bakery, Garden,
  Harlan's, Nibbles Baking Nook, The Peninsula, and Wooloomooloo Prime. Bakery and Prime
  remain part of the trading name and are not appended again.
- The Peninsula drops Hong Kong, becoming The Peninsula / 半島酒店 / 半岛酒店.
- Localized brand additions/corrections cover Fresh Wheat (美麥多包餅屋), Childhood
  Bakery (小時候麵包店), Garden (嘉頓), and The Peninsula (半島酒店).
- Existing canonical Chinese brand spelling is used: 聖安娜餅屋 and 山崎麵包, replacing
  abbreviated 聖安娜 and variant 山崎麵飽 in generated titles.

## Resolved review differences

- `blD236b565af`: English branch is Domain Mall, replacing Yau Tong MTR.
- `blD089ee14b9`: Chinese branch is 海港城, removing the extra final 港.
- The access hint uses `In-town Check-in`; `H; Outside station` is unchanged.

No identity/translation differences remain flagged in this review.

## Preparation and validation

Use a consistent SQLite backup of the intended database, never a copied WAL file. The
actor must already exist in that database.

```sh
dev-check bun scripts/breadline/prepare-donor-naming.ts --database SNAPSHOT.sqlite --output REVIEW_DIRECTORY --actor ACTOR_ID
dev-check python3 scripts/breadline/apply-donor-naming.py --database SNAPSHOT.sqlite --migration REVIEW_DIRECTORY/migration.sql --review REVIEW_DIRECTORY/review.json
```

The second command defaults to dry run on an in-memory copy. It verifies every name,
unchanged research records, source preservation, unrelated accepted content, foreign
keys, integrity, replay idempotence, and rejection of mismatched prerequisites.

The migration appends accepted Feature, shared Location, brand and template revisions;
it does not rewrite imported source history. Only changed Location fields receive new
acceptance pins. Existing catalogue affiliations, logos, categories, and unrelated
Feature fields remain intact. Snapshot guards reject concurrent changes, existing
overrides, authored branches/access hints/paid values, and locked edited fields.

`--apply` creates a database backup and was used for the approved local application. Do
not apply stale output or bypass failed guards. Regenerate from the intended database
and review the new CSV if prerequisites have changed. The SQL must execute as one
transaction. The schema/runtime must include shared template and `join` support.

## Local verification

All 933 localized names, source and unrelated content preservation, foreign keys,
integrity, replay, and mismatched-prerequisite rollback passed. Runtime verification
uses `scripts/breadline/verify-donor-naming.ts DATABASE.sqlite` to check inherited Place
policy, Breadline-only availability, and composition from new brand/format/branch/hint
values. The backup path is recorded in
`outputs/breadline-donor-naming-review/local-application.json`.

## Original template identity correction

The original catalogue entry is `Breadline Donor` (`breadline-donor`, ID
`2966d49c-fa7d-4902-97c9-9e7b94f9c75a`). `reconcile-template.sql` is the required
follow-up to `migration.sql`: it publishes the approved expression as version 2 on that
existing identity, then appends revisions rebinding all 311 donors and the Donors Place
naming default. The 933 displayed names are unchanged. Both old immutable template
revisions remain for historical inspection; the generated identity no longer has active
donor assignments.

The correction was applied locally after an isolated dry run and replay check, with a
second backup. Use `scripts/breadline/reconcile-donor-template.py` to regenerate the
correction against another reviewed pre-correction snapshot. The existing central
identity remains immutable, while the project-property prerequisite still limits
selection to Breadline. Superadmin editing of a central identity may supply its
prerequisite project; this does not grant central publishing to organisation managers or
relax prerequisite validation.
