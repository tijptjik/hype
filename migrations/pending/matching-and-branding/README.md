# Matching and branding release

Refs #194. This package carries the November 24 dev curation into a schema-current
production database. The source is a consistent SQLite backup. The release manifest pins
the private before-images, desired records and media inventory. Keep the private release
directory with the operator's cutover backups.

| Included  | Frozen scope                                                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue | 572 active brands and groups, the archived Blossom group, retained catalogue revisions, localized names, source mappings and group membership. Three archived identicon test identities are excluded.                                                                             |
| Matching  | 138 accepted SaanSeoi identity histories, all 198 retained comparison records and their evidence, including unresolved comparisons. Includes the 104 accepted MTR identities and 23 Breadline resolutions.                                                                        |
| MTR       | 1,758 shop source identities, 9,122 physical units, 98 stations, occupancy and membership history, operator and map associations, corrections and station release pointers.                                                                                                       |
| Breadline | 330 import crosswalks checked by source table, source ID, Feature ID and source hash. Includes donor and drop-off Location bindings, the 113 reviewed MTR placements, relevant Feature revision chains, overrides, naming policies, templates and 933 localized template outputs. |
| Media     | 555 catalogue logo objects across current and historical revisions and 214 immutable station-map objects, including 94 additional referenced source snapshots. Existing objects require byte-for-byte equality.                                                                   |

The original backup retains dev attribution. For references with a foreign key to
`user`, the reviewed mapping from the reserved local admin points to the verified
production contributor `tijptjik`. Free-text historical actor and evidence fields retain
their recorded values. The data groups create no user or authentication rows.

## Post-cutover release

The operator selected this combined package for a separate release after the first
production lifecycle cutover. Dev supplies the reviewed matches and branding. The
production Breadline donor export supplies contact numbers. Compare the scoped dev
values with the newly migrated production target and apply them through its revision
history. Preserve unrelated domains and identity references. The initial cutover uses a
fresh directory without `--curation-package`.

## Use during the curation release

Set `PACKAGE` to the private directory containing `curation.json`, `records.jsonl.gz`,
`production-baseline.json.gz`, `donor-phones.json.gz`, `media.json` and `objects/`.
Choose the run directory for the reviewed cutover. The November 24 release on the
managed desktop is `.local/curation-release/20261123T180818Z/release`.

1. Follow the cutover plan for the production export, schema, lifecycle enrollment and
   target-specific curation prerequisites. Preserve existing production IDs. The
   normalized Feature history, donor source crosswalk, identity catalogue storage,
   derived-title guard, operator and indoor schemas must exist when the group runs. This
   package already includes the captured donor naming and brand restoration outcomes.
   Check overlapping donor work against the target before selecting any separate donor
   migration. Revealing Arrow retains its own release package.
2. Prepare this data package separately against a private copy of the schema-current
   production export. `retainMatchingBranding` verifies the five pinned inputs. The
   standalone `prepareRelease` planner in `scripts/revisions/production/prepare.ts`
   accepts the reviewed package, rehearses it on the copy and records the D1 groups,
   fingerprints and receipt. Application deployments only apply numbered migrations.

3. Inspect `release/curation/verification.json` and `release/curation.log` in the
   selected snapshot. The planner requires each affected target row to match a recorded
   before-image, the exact known 0247 seed, or the desired result. It checks independent
   source and revision IDs, predecessor chains, source crosswalks and foreign keys. A
   divergence requires a target-specific reconciliation using the stable source keys and
   reviewed evidence. Retain production edits. A data plan from the development
   rehearsal is specific to its input.

   The November production-derived rehearsal has the same 330 donor and drop-off source
   fingerprints, Feature IDs, Location IDs and source revision IDs as dev. Independent
   enrollment gave all 330 different binding versions and revision ancestry. Twenty-one
   source revisions also differ in their recorded phone facts. The private production
   baseline anchors each source to its production import, original binding and enrolled
   Feature content. The planner keeps those facts and histories, appends the captured
   curation to the target's own predecessors and checks the resulting projections.
   Unexpected edits to the same field require review. A private `conflicts.json.gz`
   records divergent row keys and their before, target and desired values when row
   comparison fails.

   The 24 November export covers all 311 donors. The amendments inherit 245 exact
   Location matches, contribute 39 missing Location phones through attributed shared
   revisions and retain 25 differing numbers as Feature overrides. Two blank source
   phones preserve the existing Feature values. Verification checks the accepted
   revision, materialized phone, Location contact and donor binding. The 161 linked
   SaanSeoi establishments and 150 unresolved Hype establishments retain their
   identities.
4. The 24 November upload created 550 catalogue images and 214 station-map objects. All
   769 required production objects passed SHA-256 readback. The private receipt is
   `production-media-verified.json`. The command below compares the package with R2. For
   an authorized upload, append `--apply-production` to create missing objects using a
   conditional write and SHA-256 readback. Retries check existing bytes.

   ```sh
   dev-check bun --env-file=.dev.vars migrations/pending/matching-and-branding/transfer-media.ts "$PACKAGE"
   ```

5. During the approved post-activation curation release, resume the retained managed run
   as described in the cutover plan. The apply path verifies every production media
   object before closing writes. Stage groups populate a fenced private table. One
   transaction checks the expected rows, installs the changes, restores the pinned
   historical triggers, checks the resulting rows and foreign keys, and drops the
   staging table. Stage data and the normal release cursor commit together. Independent
   changes to opaque revision IDs, hashes or contributor identity stop the release.
6. Verify the exact release against the fenced production export, including journal
   resume and D1 execution limits. Exercise the production catalogue artwork route and
   representative station and donor pages. A fresh production-to-dev mirror can follow
   once the production readback passes.

## Offline verification

The rehearsal can run independently of a live cutover. It reads the target SQLite file,
writes only a new private output directory and checks that replay proposes zero writes.
The mirror rehearsal exercises the canonical SQL restore used by the dev rebuild and
compares the restored scoped rows and identities again.

On 24 November the post-cutover rehearsal prepared 84,619 row operations in 191 groups.
It preserved 330 original source crosswalks, 330 binding histories, 330 original
Location revisions, 1,013 Feature revisions and 354 change sets. Of the 143 donor
Locations absent from the target, 129 had a confirmed SaanSeoi establishment ID and 14
had an unresolved Hype identity. Local workerd D1 executed one preceding schema
migration and all 191 curation groups through the production journal. A deliberately
stale install rolled back at cursor 191. The corrected retry reached verification at
cursor 192. Direct database readback and a restored mirror retained every donor phone
and binding and passed integrity and foreign-key checks. Mirror replay proposed zero
writes. The private receipts are under
`.local/curation-release/20261123T180818Z/post-cutover-final/`.

```sh
dev-check python3 migrations/pending/matching-and-branding/package.py prepare \
  "$PACKAGE" "$SCHEMA_CURRENT_TARGET" "$NEW_OUTPUT"
dev-check python3 migrations/pending/matching-and-branding/rehearse-mirror.py \
  "$PACKAGE" "$NEW_OUTPUT/rehearsal.sqlite" "$NEW_MIRROR"
```

For a journal rehearsal, run
`dev-check bun migrations/pending/matching-and-branding/rehearse-journal.ts "$SCHEMA_CURRENT_TARGET" "$PLAN_JSON" "$NEW_JOURNAL"`.
It interrupts installation with a stale before-image, checks rollback and resumes the
retained plan. To inspect the independent source bindings, run
`dev-check python3 migrations/pending/matching-and-branding/compare-bindings.py "$PRE_CURATION_DEV" "$POST_SCHEMA_PRODUCTION_COPY" "$NEW_PRIVATE_REPORT"`.

The package also contains the freeze tools.
`package.py capture BASELINE SNAPSHOT OUTPUT` uses an aligned, pre-curation database
with the current schema and the frozen dev backup. `media.py SNAPSHOT OUTPUT` reads the
matching local R2 object indices and exact blobs, validates object sizes and checksums,
and writes the media manifest.
`production_baseline.py POST_LIFECYCLE_COPY NEW_REFERENCE` captures the production donor
ancestry from a reviewed, independently enrolled copy. The replay checks production's
existing source revisions, Feature revisions, change sets, crosswalks and binding
history against the input copy. Regenerating the private release requires reviewing and
pinning its new hashes.

Refresh the phone export with
`bun --env-file=.dev.vars migrations/pending/matching-and-branding/export-donor-phones.ts "$PACKAGE" "$NEW_PRIVATE_EXPORT"`.
At release freeze compare the new export's ordered `rows` to the retained export. An
unchanged donor list and identical phones can reuse the pinned amendments. Run
`donor_phones.py FROZEN_DEV POST_SCHEMA_PRODUCTION_COPY NEW_PRIVATE_EXPORT NEW_AMENDMENTS`
to generate both rehearsal variants. Review and pin the new amendments before preparing
a fresh release plan.

[Production cutover](../../../docs/operations/Preview-to-Production-Cutover.md) ·
[Places and Features](../../../spec/breadline/proposal/01-places-features.md)

## Post-deployment review

The 24 November post-deployment review and prepared donor corrections are retained in
`.local/curation-release/20261124-post-deploy/`. DEV and production backups passed
integrity and foreign-key checks. The scoped DEV records match the earlier frozen
package. The fresh Breadline export proposes no donor/drop-off source changes. User
reconciliation proposes 121 creations and 157 updates, with no exceptions.

The prepared target contains 493 active brands, 79 active groups and one archived group.
It adds the requested Harlan’s contact correction and Wooloomooloo Prime closure through
attributed Location and Feature revisions. Local workerd verified the curation and user
reconciliation against this target across 173 tables. Production application and live
acceptance remain pending. The post-deployment ancestry input and operator corrections
still require final managed-plan pinning and journal/mirror rehearsal.

The [acceptance checklist](acceptance-checklist.md) records completed evidence and the
remaining scope decisions. Use its current status when resuming this work.
