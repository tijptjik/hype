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

## Use during the cutover

Set `PACKAGE` to the private directory containing `curation.json`, `records.jsonl.gz`,
`media.json` and `objects/`. Choose the run directory for the reviewed cutover. The
November 24 release on the managed desktop is
`.local/curation-release/20261123T180818Z/release`.

1. Follow the cutover plan for the production export, schema, lifecycle enrollment and
   target-specific curation prerequisites. Preserve existing production IDs. The
   normalized Feature history, donor source crosswalk, identity catalogue storage,
   derived-title guard, operator and indoor schemas must exist when the group runs. This
   package already includes the captured donor naming and brand restoration outcomes.
   Check overlapping donor work against the target before selecting any separate donor
   migration. Revealing Arrow retains its own release package.
2. Select the curation package during managed preparation. The runner copies and
   verifies the three pinned manifests, rehearses on its private post-schema copy and
   includes the resulting D1 groups and fingerprints in the retained plan. The selection
   follows a fenced replan and resumes from the same run directory.

   ```sh
   bun run revisions:prepare:prod --local-backup --run-dir "$RUN" --curation-package "$PACKAGE"
   ```

3. Inspect `release/curation/verification.json` and `release/curation.log` in the
   selected snapshot. The planner requires each affected target row to match a recorded
   before-image, the exact known 0247 seed, or the desired result. It checks independent
   source and revision IDs, predecessor chains, source crosswalks and foreign keys. A
   divergence requires a target-specific reconciliation using the stable source keys and
   reviewed evidence. Retain production edits. A data plan from the development
   rehearsal is specific to its input.
4. Preview media with the command below. After **separate production upload
   authorization**, append `--apply-production` to create missing objects using a
   conditional write and read-back SHA-256 verification. Retries check existing bytes.

   ```sh
   dev-check bun --env-file=.dev.vars migrations/pending/matching-and-branding/transfer-media.ts "$PACKAGE"
   ```

5. During the approved production cutover, resume the retained managed run as described
   in the cutover plan. The apply path verifies every production media object before
   closing writes. Stage groups populate a fenced private table. One transaction checks
   the expected rows, installs the changes, restores the pinned historical triggers,
   checks the resulting rows and foreign keys, and drops the staging table. Stage data
   and the normal release cursor commit together. Independent changes to opaque revision
   IDs, hashes or contributor identity stop the release.
6. Verify the exact release against the fenced production export, including journal
   resume and D1 execution limits. Exercise the production catalogue artwork route and
   representative station and donor pages. A fresh production-to-dev mirror can follow
   once the production readback passes.

## Offline verification

The rehearsal can run independently of a live cutover. It reads the target SQLite file,
writes only a new private output directory and checks that replay proposes zero writes.
The mirror rehearsal exercises the canonical SQL restore used by the dev rebuild and
compares the restored scoped rows and identities again.

```sh
dev-check python3 migrations/pending/matching-and-branding/package.py prepare \
  "$PACKAGE" "$SCHEMA_CURRENT_TARGET" "$NEW_OUTPUT"
dev-check python3 migrations/pending/matching-and-branding/rehearse-mirror.py \
  "$PACKAGE" "$NEW_OUTPUT/rehearsal.sqlite" "$NEW_MIRROR"
```

The package also contains the freeze tools.
`package.py capture BASELINE SNAPSHOT OUTPUT` uses an aligned, pre-curation database
with the current schema and the frozen dev backup. `media.py SNAPSHOT OUTPUT` reads the
matching local R2 object indices and exact blobs, validates object sizes and checksums,
and writes the media manifest. Regenerating the private release requires reviewing and
pinning its new manifest hashes.

[Production cutover](../../../docs/operations/Preview-to-Production-Cutover.md) ·
[Places and Features](../../../spec/breadline/proposal/01-places-features.md)
