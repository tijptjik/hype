# Donor import policy

Refs #194. Parent specification: [Migration](03-migration.md).

The executable policy is `scripts/breadline/donor-import-policy.json`. Apply it to
all donor feature import plans and the temporary MTR review queue.

## Rules

1. **Exclude donors with no recorded runs.** A donor qualifies only when at least
   one row in `breadline__public__runs` references its ID. Any historical run
   qualifies, regardless of claim or collection status. An `active` flag or NGO
   schedule alone is not sufficient.
2. `excludedDonorIds` records additional explicit exclusions. It is currently empty.
   Document the reason here when adding an ID.
3. Inactive donors with run history remain eligible; their imported features stay
   unpublished. Eligibility and publication are separate decisions.
4. Dropoffs are outside this donor policy.

The planner evaluates exclusions before geometry checks and existing-import
matching. Its private `.receipt.json` records every excluded donor ID, reason,
policy version and whether it was already imported. Exclusions do not delete
existing features or source history. Re-evaluate against each fresh source export:
new run history may make a donor eligible later.

## 19 October 2026 snapshot

- 466 donors: 311 eligible, 155 excluded for `no_recorded_runs`.
- Excluded: 150 active and 5 inactive, including donor #89.
- 19 dropoffs remain eligible: 330 total feature imports.
- MTR review: 12 excluded from the 27-case queue, leaving 15 cases.

The earlier local rehearsal imported all 466 donors. Its 155 now-excluded donor
features still need reconciliation before final migration acceptance. Do not use
that earlier all-donor SQL plan for production; regenerate the feature plan from
the production snapshot with this policy. No production data has been removed.

## Reviewed MTR access (Refs #194, #213)

`scripts/breadline/donor-mtr-decisions.json` records 64 validated decisions from the
latest review export: 47 Breadline references, 16 calculated references, and the
explicit Tai Koo D1 correction for donor #6 (357 m). Export SHA, source row hashes,
review revisions, coordinates and routing provenance make the decisions auditable.
The original exports and retained paths are private under `.local/breadline/review/`
and `.local/breadline/plans/`.

`features.ts` applies these choices to both new and previously mapped donors.
Source-hash or coordinate changes fail closed. Accepted parent labels remain in
`mtrResolution.review.exitLabel`; when multiple sub-exits match, core access uses
the shortest validated walking route among those sub-exits. Explicit individual
choices take precedence over the inside-station default.

Donors #558 (Hong Kong A2) and #727 (Hung Hom C2) have accepted source labels but no
matching catalog entrance. Their station and review label are retained, with null
entrance/distance and `unsupported` resolution. Catalog mapping remains outstanding;
do not substitute a different entrance or invent a walking distance.

The import clears matching refresh jobs after writing reviewed fields. General
backfill excludes reviewed results and guards its updates against later approvals.
The existing geometry-change trigger clears these fields and queues a fresh
calculation when a feature moves. Applying old pre-review backfill SQL would bypass
these protections: discard it and regenerate plans after importing reviewed access.

Applied and verified against the local application database and repaired production
snapshot rehearsal: 64 reviewed records, no queued jobs for those records, intact
foreign keys, and geometry-change invalidation. Production has not been changed.
