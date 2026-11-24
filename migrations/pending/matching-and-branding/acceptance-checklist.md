# Breadline post-cutover reconciliation handoff

Work from the Hype repository root. Production is already on the revision-enabled
schema. This is a separate release. The original cutover run is complete.

- [ ] **Establish the current state.** Inspect the active production release and
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
- [ ] **Capture a recoverable target.** Take or validate a fresh consistent local
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
