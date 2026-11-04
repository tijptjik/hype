# Handoff: rematch Open to Sync Locations after source publication

The bounded establishment rematching workflow is implemented locally in
`/home/io/code/hype` (29 October 2026). See the Background Open to Sync rematching
section of the technical design for implementation, operations and remaining coverage
boundaries. Authenticated admin acceptance and Building/premises provider support remain
outstanding. The original implementation requirements below remain the acceptance
contract. Tracking: https://github.com/tijptjik/hype/issues/194, parent #180. Design:
`spec/breadline/proposal/01-places-features.md`.

## User intent

A custom Location marked **Open to Sync** should be reconsidered when relevant source
data is published. Plausible matches should produce review tasks so a user can link an
existing custom Location to the correct upstream identity. **Not Synced** is an explicit
opt-out and must remain untouched. Do not silently merge Locations, move Feature pins,
replace corrected address components, or adopt source names.

Vocabulary: Synced / Open to Sync / Not Synced map to association modes `linked` /
`unlinked` / `manual`. Lookup outcomes are separate: not-checked, checking, matched,
no-match, ambiguous, failed, deferred. A local Location ID alone is not proof of an
upstream link. Feature name inheritance is also independent.

## Inspect before designing

Read AGENTS.md and the component/domain guidelines. This is a heavily dirty shared
checkout: inspect current code and Git status, preserve unrelated changes, and do not
commit, push, deploy, or reset a database without authorization.

Starting points (verify current paths/contracts):

- `src/lib/locations/association.ts`, `associationSync.ts`, `associationSearch.ts`, and
  `associationMatch.ts` for current intent, matching and semantic comparison.
- `src/lib/db/services/locationAssociationCandidates.ts` and
  `src/lib/api/locationAssociation.remote.ts` for accessible local candidates.
- `workers/location-refresh/`, `src/lib/db/services/locationRefreshProcess.ts`,
  `locationRefreshAdoption.ts`, `locationLocalRefresh.ts` for publication jobs.
- `src/lib/db/services/locationIdentityReview.ts`, `locationAdoptionReview.ts`,
  `taskQueue.ts`, and the current Location task schema/UI for reusable review paths.
- Existing Location refresh, identity, adoption, task and lifecycle tests.

The existing refresh path primarily handles already source-linked identities; do not
assume persisted `deferred` means a rematch job was enqueued. Determine where opt-in
intent is durably stored and how it relates to shared Locations and individual Feature
associations before selecting eligible records. One Feature opting out must not
accidentally opt out other users, and shared-record review must not change an opted-out
Feature's independent values.

## Required implementation

1. Trigger bounded, resumable scans on relevant new source publications, plus a retry
   path for deferred/failed lookups. Use durable cursors, generation/lease fencing,
   retry/backoff, and idempotent receipts. Do not load the whole catalogue.
2. Include only eligible Open to Sync records; exclude manual opt-outs, deleted or
   inaccessible records, and already resolved work. Recheck eligibility immediately
   before creating a review and again when accepting it.
3. Reconcile by kind, normalized localized names and spatial evidence (the current
   interactive flow uses 100 m). Rank meaningful address agreement above distance;
   distinguish number ranges/entrances and premises from buildings. Equal display
   strings alone are not identity proof. Preserve ambiguity, provider failure, coverage
   limits and missing coordinates instead of recording false no-match.
4. Reuse or extend durable review tasks with candidate identities, source release,
   evidence/score, proposed changes and provenance. Deduplicate retries and repeated
   publications; invalidate stale proposals when either identity or authored intent
   changes. Do not create duplicate Locations while scanning.
5. Acceptance must use existing guarded linking/adoption services, authorization,
   optimistic concurrency and audit history. Retain custom Location identity where
   supported, Feature overrides, selected address components, pin, and name mode.
   Rejection/dismissal must have documented suppression/reconsideration semantics.
6. Preserve explicitly Not Synced intent through all job, review and retry paths. A
   missing premises provider is unavailable coverage, not proof of no match.
7. Expose useful review status/retry controls through existing task surfaces rather than
   adding a separate queue. Document operational observability and recovery.

## Acceptance evidence

Test publication -> eligible custom record -> candidate proposal -> authorized review
acceptance -> correct existing identity/source association. Include duplicate runs,
duplicate publications, multiple candidates, ranges versus entrances, provider
outage/partial coverage, interrupted jobs, stale review, concurrent edits, opt-out
during scan and before acceptance, repeated rejection, inaccessible sources, no
coordinates, and retained independent Feature fields/name mode. Verify paging and query
limits with realistic batches; follow the SQL batching skill where applicable.

Use local integration evidence and the user's authenticated browser session for review
UI/save/reopen verification. Clearly separate fixture tests from live admin acceptance.
No production publication is required. Update #194 and parent #180 with scoped
evidence/blockers and accurate acceptance checkboxes; keep the technical spec current.
Do not claim background rematching works merely because lookup state was persisted or
the worker process is running.
