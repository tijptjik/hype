# Breadline post-cutover reconciliation handoff

Work from the Hype repository root. Production is already on the revision-enabled
schema. This is a separate release. The original cutover run is complete.

- [x] **Establish the current state.** Inspect the active production release and
      journal, the operator's post-deployment work under
      `.local/curation-release/20261124-post-deploy/`, and any later receipts. Establish
      whether a release has been prepared, applied, or verified before starting another
      run. If it has already been applied, proceed to independent production readback.
      Leave the completed cutover's `resume.sh` alone.
- [ ] **Pin inputs and scope.** Read
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
- [ ] **Rehearse the exact plan.** Generate the plan in a fresh private run directory
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

## Verification status on 24 November 2026

The 14:40 Hong Kong time production readback confirms the original cutover release is
active and ready at cursor 5681. Its release ID is
`97adef5e895ef96e0b10da59b28fd87ababb8016850abfbaa8c325e83e563dd3`. Production still has
14 brands and seven groups. The requested Harlan’s phone correction and Wooloomooloo
Prime closure are pending. Stratigraphy is already `many`.

The current private review is
`.local/curation-release/20261124-post-deploy/review.json`. Its accompanying
`commit-audit.json` contains the independent production readback. The verified DEV
backup is `dev.sqlite`; the verified production restore is `prod.sqlite`.
`production.sqlite` is an interrupted restore attempt and must not be selected as an
input. The completed backups have checksum, integrity and foreign-key receipts in
`dev-backup.json` and `production-backup.json`.

| Checklist area         | Status and evidence                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current state          | Verified against production. The combined curation release is prepared locally.                                                                                                                                                                                                                                                                                                                              |
| Inputs and scope       | Partially verified. Current DEV matches frozen DEV for the package’s scoped records. All five private inputs are retained. The post-deployment production ancestry hash differs from the earlier checked-in pin. Final scope selection and managed-plan pinning remain pending.                                                                                                                              |
| Recoverable target     | Verified for the retained snapshot. DEV and production restore passed integrity and foreign-key checks. The complete fresh Breadline export has zero donor/drop-off changes from the accepted source baseline. Recheck target drift before application.                                                                                                                                                      |
| Identity and history   | Local rehearsal preserved all 330 crosswalks, 330 source Location revisions, 330 original bindings, 1,013 Feature revisions and 354 change sets. Production after-state verification remains pending.                                                                                                                                                                                                        |
| Effective donor data   | Local rehearsal verified 311 donor bindings and 933 template outputs, with 161 linked and 150 unresolved establishments. The additional two operator corrections passed normal revision services and local D1. Final production donor checks, rendered names and the explicit 113-placement acceptance check remain pending.                                                                                 |
| Exact-plan rehearsal   | Local D1 executed all 191 amended curation batches and the user sync. Comparison across 173 tables found zero differences after normalizing two generated history timestamps. All 769 R2 objects passed SHA-256 readback. Journal failure/resume and mirror tests passed for the earlier plan. Repeat those tests for the final managed plan with the two operator corrections and selected user-sync scope. |
| Production application | Pending. The prepared SQL hash is `dd408c78754e53f8735333580e4c8f4103c845ff13994c22d994e5f1285e039e`. This identifies the private SQL artifact; it is not an activated release ID.                                                                                                                                                                                                                           |
| Final report           | Pending production conservation readback, zero-write replay, live page checks and consumer restoration evidence.                                                                                                                                                                                                                                                                                             |

The prepared user reconciliation contains 121 new users and updates to 157 existing
users, with zero exceptions and zero-write replay. Its private plan hash is
`c96253aed6d3b601569d01dae9cda66b4690814903541d3b266ddff4bc54c5a2`. The existing
production sync tools target Hype. Confirm whether the operator also wants a separate
SaanSeoi production change. The curation package excludes City Recorder, EU National
Institutes for Culture and SaanSeoi-owned Locations. Confirm whether the 405 City
Recorder and 39 EUNIC Locations already in production should also be removed, including
the intended treatment of their associations and retained history.

After resolving scope, retain the final managed release with its write fence, recheck
production and source drift, apply and verify it, then perform the production-to-dev
mirror and repeat the conservation checks. Private exports, donor contact values,
identity decisions and replay databases remain in the ignored operator directory.
