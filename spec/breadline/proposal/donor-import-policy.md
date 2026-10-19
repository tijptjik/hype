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

## Evidence for unmapped exit labels (19 October 2026)

Evidence only; these findings have not changed the accepted import decisions or
added entrance coordinates.

- **#727, Hung Hom C2:** MTR's [January 2026 street map](https://www.mtr.com.hk/archive/en/services/maps/huh.pdf)
  explicitly lists C2 for Fortune Metropolis, alongside B2 and D6. C2 is on the
  southern side of the station facing Metropolis. The [station layout](https://www.mtr.com.hk/archive/en/services/layouts/huh.pdf)
  places C2 at the U2/3 Exit C concourse. The label is confirmed; our entrance catalog
  still lacks the corresponding mapped point.
- **#558, Hong Kong A2:** MTR's [August 2026 street map](https://www.mtr.com.hk/archive/en/services/maps/hok.pdf)
  shows A, with no A1/A2 subdivision, and lists A for Central Piers. The
  [March 2025 station layout](https://www.mtr.com.hk/archive/en/services/layouts/hok.pdf)
  also shows A at ground level near B1/B2. A is a plausible intended reference,
  but no evidence established A2 as a historical or equivalent label.

The temporary review map and scratch browser/test artifacts were retired after
processing all 64 decisions. Original exports, retained route evidence and
pre-application backups remain private. The committed decision policy and source
audit script are the retained import/review deliverables.

## Location-review exclusions (20 October 2026)

Maxim's Cakes – Lo Tak Court and Maxim's Cakes – MTR Kowloon Tong B both have
zero recorded runs in the retained source mirror. Both are excluded by the existing
`requireRecordedRun` policy before coordinate and MTR import processing. Do not carry
these records forward from the earlier all-donor rehearsal or guess replacement
coordinates. If either acquires run history, recheck eligibility and verify its shop
location before importing: the retained points conflict with the source addresses.
Nam Wan Bookshop is outside Breadline; its guarded address correction is separate.


The 20 October fresh planner pass confirms both entries are excluded with
`no_recorded_runs`. Both already exist from the earlier import: this policy skips
future import operations; it does not delete existing features or alter their
locations. Removing those existing records requires a separate reviewed cleanup.
