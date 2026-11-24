# Breadline post-cutover reconciliation handoff

Work from the Hype repository root. Production is already on the revision-enabled
schema. This is a separate release. The original cutover run is complete.

- [x] **Establish the current state.** Inspect the active production release and
      journal, the operator's post-deployment work under
      `.local/curation-release/20261124-post-deploy/`, and any later receipts. Establish
      whether a release has been prepared, applied, or verified before starting another
      run. If it has already been applied, proceed to independent production readback.
      Leave the completed cutover's `resume.sh` alone.
- [x] **Pin inputs and scope.** Read
      `migrations/pending/matching-and-branding/README.md` and `release.json` from the
      checkout including pending edits. Record the exact tool revision or patch and the
      hashes of the five private inputs. The November package is under
      `.local/curation-release/20261123T180818Z/release/`. Compare frozen DEV with
      current DEV for curation drift and document the selected snapshot. DEV supplies
      reviewed matches, placements, naming and branding. The production Breadline donor
      export supplies phone numbers. The packaged release also writes MTR and catalogue
      data. Identify the selected scope and its dependencies explicitly. A
      Breadline-only release requires its own scoped plan and verification.
- [x] **Capture a recoverable target.** Take or validate a fresh consistent local
      production backup with checksum, release ID, schema ledger and journal position.
      Restore it privately and run integrity and foreign-key checks. Refresh the ordered
      donor export and compare it with the pinned rows. Rebuild and verify affected
      amendments if inputs changed. Keep raw exports, phone numbers and credentials
      private.
- [ ] **Prove identity and history.** For all 330 frozen source crosswalks, compare
      source table, ID, hash, and production Feature ID. Verify each intended Location
      link, match decision, override, and existing production predecessor. Append
      curated values through production revision chains. Compare old source revisions,
      Feature and Location revisions, change sets and binding history before and after.
      Check that unresolved donors retain independent identities, no duplicate
      identities or orphan revisions appear, and unrelated production and authentication
      rows agree with the baseline.
- [ ] **Verify effective donor data.** Check every donor's current and accepted Feature
      revision, rendered name, materialized phone, Location contact and binding. The
      November rehearsal covered 311 donors. Of these, 245 inherited an exact Location
      phone, 39 filled a missing Location phone with attribution, 25 retained a Feature
      override, and two blank source phones preserved the existing Feature value. It
      found 161 linked and 150 unresolved establishments. Verify 113 reviewed MTR
      placements and 933 localized template outputs for the combined scope. Explain any
      count change against source keys and approved input changes.
- [x] **Rehearse the exact plan.** Generate the plan in a fresh private run directory
      from the post-cutover target. Review its table and field changes, prerequisites
      and conflicts. Verify all 769 referenced media objects by SHA-256 for the combined
      release. Run the journal and mirror rehearsals in the runbook. Show that a stale
      before-image rolls back without advancing the install cursor, a retry finishes,
      integrity is OK, there are zero foreign-key violations and replay proposes zero
      writes. The earlier 191 groups and 84,619 operations were measurements on an
      earlier copy.
- [ ] **Apply and verify production.** For an authorized production apply, use the
      separate managed release and its write fence. Compare the fenced target with the
      rehearsed inputs, replan on drift, and retain the final plan hash and journal
      receipt. Read back the scoped rows and revision chains from production, repeat the
      donor checks, and demonstrate zero proposed writes against a fresh post-apply
      copy. Exercise a linked donor, an unresolved donor, a phone override and a
      drop-off in the live app. For the combined scope, also check a station page and
      catalogue artwork. Confirm the active release, normal writes and restoration of
      any paused consumers.
- [ ] **Report evidence.** Return the release ID, input and plan hashes, scoped
      before/after counts, discrepancies and their dispositions, production readback,
      replay count, live page results and private receipt paths. Mark each item
      verified, failed or pending. A local rehearsal or completed media upload alone is
      insufficient evidence of a production database apply.

The previous local comparison reports are under
`.local/curation-release/20261123T180818Z/post-cutover-final/{planner/curation,journal,mirror}/verification.json`.
The operational context is in `docs/operations/Preview-to-Production-Cutover.md` and the
Breadline places specification is in `spec/breadline/proposal/01-places-features.md`
(Refs #194).

## Production release evidence, 24 November 2026

The final optimized plan is
`725500a5dfb78a4b4f302225177b4774871e3e3cbdc913de5a67389404f8c4db`. Its private operator
directory is `.local/curation-release/20261124-production-optimized/`. The retained
application release is
`97adef5e895ef96e0b10da59b28fd87ababb8016850abfbaa8c325e83e563dd3`, at cursor 5681. The
data release contains 265 atomic groups across 172 checked tables.

### Verified preparation

- DEV backup: `20261124-production-final/dev.sqlite.gz`, SHA-256
  `d0ff6c9e8eaa20a09efe4c4f4150af51839899304dc6521a301a46e3a1ee814b`. Its scoped records
  matched frozen DEV; the reviewed frozen package was selected.
- Fresh production backup: `production-backup.json` and `fenced-backup.sqlite` in the
  optimized directory. Restore passed integrity and foreign-key checks. Losslessly
  compressed artifacts retain original hashes in `compression.jsonl`.
- Fresh Breadline snapshot: 24 November at 08:42:00 UTC. All 330 eligible source
  identities and all 311 donor phone rows are unchanged from the selected package.
  Source data and phone values remain private.
- User reconciliation: 122 additions, 157 updates, zero exceptions; 925 planned
  mutations including the private checkpoint. Rehearsal replay proposes zero writes.
- Curation: 84,619 operations, 330 source crosswalks, 161 linked and 150 unresolved
  donors, 933 localized titles, 493 active brands, 79 active groups and one archived
  group. The 113 reviewed MTR placement history records span 110 current donor bindings.
- Approved removal: 405 City Recorder and 39 EUNIC Locations, with 444 attributed
  Feature detachment revisions preserving content and historical snapshots. Exact
  removal before-images remain in `removed-location-archive.json`.
- Exclusions: new City Recorder, EUNIC and SaanSeoi-owned Locations. SaanSeoi access
  remains through its APIs; no SaanSeoi database was modified.
- Durable donor rules: donor 767's contact correction and donor 768's permanent closure
  are applied through attributed Location and Feature revisions. Repeating
  `prepare-donor-curations.ts` produces zero groups when the rules are satisfied.
- All 769 referenced media objects passed a fresh production SHA-256 readback with none
  missing (`release/production-media-preflight.json`).
- Exact-plan journal rehearsal rejected a stale before-image at cursor 190, rolled back,
  then completed all 265 groups. Native workerd D1 verified the expected tables, exact
  schema restoration, original application journal and zero-write completion retry.
- Focused tests passed for donor curation, importer behavior, bounded-memory SQLite
  execution and data-only release handling. The abort/retry test passed on Li in
  `job-oaSkgKqp0E`. This is not a claim that the whole repository suite passed.

The five private input hashes are retained in `input-pins.json`; the records hash is
`23d250355ded70319db595e7214b5b7abfb1f8d963a8f8e51bebc734842a4d53`, and the production
ancestry hash is `fb4964d405e6486a5eddf63c59738a21003f367d8ce9532b83842d2d6dc4d358`. The
exact bundled runner hash and its progress-logging changes are in `runner-pin.json`.

### Production application and live acceptance

Pending the optimized production apply and readback. Do not interpret the preparation
receipts as evidence of installed production data. The media preflight, application,
readback, replay, live pages and consumer restoration must all be recorded here before
marking the combined application item complete.

### Recovery evidence

The preceding plan `aa5061ac21ff5d2ce5baebc6685fd78d36a8d7f182d403ac81d1924b18086d9d`
hit D1's CPU limit in the atomic install at cursor 190. Its transaction rolled back. All
172 original business tables were verified unchanged before staging was removed; the
exact application journal and both queue settings were restored. Receipts are in
`20261124-production-fenced/staging-recovery.json` and `health-recovered.json`.

The optimized install caches the stable canonical Location lookup within the same
transaction, retains all validation triggers, verifies that the cached mapping still
matches the restored recursive view, and removes the cache before commit. Local CPU
profiling fell from 18.4 to 6.2 seconds. A subsequent preparation filename collision
aborted before any data group; the data-only abort path now preserves the original
application cursor and has focused retry and post-mutation rejection coverage.

### Ongoing sync and remaining acceptance

The existing incremental Feature sync planner targets legacy Place tables and must not
be enabled against the deployed Location schema. Port and rehearse that recurring
planner before enabling it; run the supported current-schema donor curation step after
source reconciliation. Raw source hashes remain unchanged. The accepted user-sync
manifest must be advanced only after verified production application.

Stratigraphy is already multi-select (`many`) in production; no additional migration is
required for that field. Private inputs, phone values, identity decisions and backup
exports stay in the ignored operator directories.
