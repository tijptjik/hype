# Places, Feature inheritance and SaanSeoi Addresses

Accepted architecture, 20 October 2026. Delivery tracking:
[#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180); location/routing integration
[#213](https://github.com/tijptjik/hype/issues/213). Schedule import remains under
#195/#196. Production application is a separate release step.

## Identity and ownership

A Place is an identifiable, spatially fixed entity. A Feature is a Project's
interpretation of that Place: a bakery is a Place; its Breadline donor role is a
Feature. Multiple Features can share one Place. Deleting a Feature never deletes
its Place. Intangible and other non-place Features can remain unassociated.

HYPE owns the permanent `place.id`. New Places have opaque 12-character IDs using
HYPE's NanoID alphabet. Manual creation uses `nanoid(12)`; repeatable Breadline imports,
existing-Feature splits and initial source mirroring use the fixed versioned
SHA-256/base64url derivation in `id.server.ts`. Source namespaces are hash inputs,
never visible prefixes. Replaying against existing records retains their IDs,
including legacy prefixed IDs; a fresh import produces the new format. Accepted
source identity changes never recompute an existing HYPE ID.

Nullable `ssId` identifies the canonical
SaanSeoi Place; do not assume this always equals an Overture publisher ID. Source
ID disappearance, proximity and matching brand alone never justify rebinding an
establishment. Accepted identity changes preserve the HYPE ID and associations.

Place states:

- `linked`: identified SaanSeoi source, with immutable mirrored revisions.
- `unresolved`: a local baseline awaiting establishment matching.
- `manual`: an intentionally local Place, excluded from ordinary source matching.
- `redirect`: an absorbed identity that resolves to its surviving HYPE Place.

Source availability (`current`, `missing`, `review`) is independent of identity
state. Missing upstream data does not imply business closure, donor inactivity or
deletion. Manual and unresolved baselines have explicit local provenance.

Local Places belong to an owning Organisation (`ownerOrganisationId`). Null ownership
means a shared canonical Place, administered by core administrators. Sibling Projects
can discover and associate the Organisation's private Places through their authorized
Feature workflows. Creation, private catalogue access and identity administration
require Organisation-level authority; Project roles do not grant upward authority.
Merges authorize both persisted owners independently. Project users retain control of
Feature overrides and per-Project adoption policies. Feature visibility never grants
access to another Project's Features or private review evidence. Database guards block
Feature or Project moves that would cross a private Place's Organisation boundary.

## Storage: nine dedicated tables

Drizzle declarations put `createdAt` and the existing update timestamp (`updatedAt`
or `modifiedAt`) last. Declaration reordering does not migrate SQLite's physical
column order; that change is deferred to the final schema migration. Conditional
insert projections must follow the declared column order.

Migrations 0122–0125 consolidate the original twenty-table implementation. No
compatibility views or replacement generic registry are introduced.

| Table | Responsibility |
| --- | --- |
| `place` | Stable HYPE identity, source ID, ownership, availability; absorbed identities retain `redirectTargetId` and the immutable redirect receipt. |
| `placeRevision` | Immutable source/local snapshots, normalized facts, content hash, API/release/snapshot references and provenance. |
| `featurePlace` | Current association, accepted facts/location revisions, explicit overrides and concurrency token. |
| `featurePlaceHistory` | Actor-attributed link, reassociation, override and unlink history. |
| `placeIdentityHistory` | Accepted source-identity transitions and their immutable review references. |
| `placeIdentityReview` | Retained establishment comparison, append-only merge impact versions, optional immutable rejection. |
| `placeAdoptionProposal` | Immutable source-change assessment plus independently written `factsDecision` and `locationDecision`. |
| `placeRefresh` | Monthly publication checkpoint, current run, cursor, lease and retry state. |
| `placeRefreshItem` | Captured source identity, pinned evidence, processing cursor and outcomes keyed by Feature ID. |

Existing resources own their settings: `project.placePolicy` and
`placePolicyRevision` store Project policy; `feature.localPlaceBrands` stores
unlinked brand corrections and their revision/actor. These are not separate
resources. Source-backed Feature corrections remain in `featurePlace.overrides`.

A merge comparison can have multiple impact assessments if its association set
changes before acceptance. Their existing IDs, baselines, source revision,
association token, author and timestamp are retained in the owning identity
review's `mergeReviews` array. Prior entries cannot be replaced or removed.
Rejection belongs to that comparison; acceptance remains in identity history.
The absorbed Place retains its redirect ID, old source ID, review, actor, reason
and timestamp. Redirect chains are resolved without widening private ownership.

Four publisher-diagnostic tables and their scheduled collector are removed.
Canonical refresh already checks every associated source identity. Historical
publisher pages remain in the pre-migration backup; the standalone read-only
source-change collector remains available for investigation.

## Effective values and editing

Existing Feature columns are effective read projections, preserving public IDs,
URLs, spatial queries and existing consumers. Their authoritative inputs are the
accepted Place revisions and explicit Feature overrides. Mutations use the shared
resolver and atomic association/projection services.

Overrides use `inherit`, `override(value)` and `clear`. Missing override means
inherit. Locale fields resolve independently. Ordered arrays replace whole
collections; an empty array is explicit and never revives a legacy value.
Equivalent values inherit when linking; meaningful differences become overrides.
Do not freeze every field as an override and thereby prevent future updates.

`phoneNumber` remains the existing universal HYPE property. Scalars migrate to
one-element arrays; validation, editing and presentation support arrays. HK phone
normalization belongs to the HYPE projection. Mirror upstream values unchanged,
and surface invalid-phone omissions rather than silently erasing contacts.

Brands belong to Place facts and preserve source identifiers and localized names.
SaanSeoi currently exposes `identifiers.wikidata.brandId` and `brandName`; normalize
these into a one-element brand array. Features inherit or override that array.
Existing classifier values survive as migration evidence/corrections, not as a
second source of truth or an Organisation ownership relationship.

Names, phones, brands and the atomic location group can be reset to inheritance.
Location comprises geometry and SaanSeoi address/unit references. Materialization
updates spatial membership and enqueues MTR recalculation only when geometry
actually changes; facts-only updates do not enqueue routing.

Unlinking retains effective columns and ordered brands, advances the Feature
revision and appends actor-attributed history in one batch. Detached brands save
through the regular Feature form with a revision guard. Relinking captures those
values before clearing the detached copy. Empty arrays remain meaningful.
Initial linking, reassociation, regular saves and draft publication are serialized
against current Feature and association tokens; late failures roll back relations,
projections, history and derived jobs together.

## Project policy and source adoption

The **Places** tab follows **Fields** and saves with the regular Project form.
Policy and Project fields update in one statement, guarded by both revisions.
Defaults require review for location and establishment changes. Each Project can
configure coordinate adoption (automatic, all reviewed, or a displacement limit
in metres), address identity, shop/unit and establishment evidence changes.

The shared mirror advances independently of each Project's accepted data.
`featurePlace` accepts facts and location revisions independently. Two Projects
can therefore accept different snapshots without duplicating Place identities.
Geometry and address/unit references always advance together.

Proposals retain the policy/version, Feature timestamp, association token, source
before/candidate values, effective values and comparison evidence. Publication
metadata and unrelated unit rows are excluded from premises-change decisions.
Missing identity evidence holds adoption; unresolved Address dependencies hold
location even under an automatic policy. Invalid contacts cannot silently clear
inherited numbers. Explicit overrides survive every source update.

Each facts/location group has one final actor/reason decision across assessments
of the same Feature/Place/candidate. Repeated refresh reuses retained evidence.
Explicit pending re-evaluation appends an assessment without reopening accepted
or rejected groups. Evidence and completed decisions cannot be overwritten or
deleted. Older assessments remain readable within current authorized scope.

Automatic application requires the retained adopt outcome and unchanged policy.
Reviewed acceptance cannot bypass unavailable source evidence. Writes recheck
current ancestry, tokens, source availability/identity and latest assessment.
Association/history, effective fields, locales, phone values and the decision
commit atomically. An unrelated edit between group decisions requires reassessment.
Evidence survives Feature deletion but is not exposed without current scope.

The Feature editor provides bounded review discovery, source/effective comparisons,
separate facts/location decisions, required reasons and pending re-evaluation.
Dirty forms prevent acceptance. The panel survives first-group adoption so the
second group can still be decided. Client input cannot choose an authenticated
actor, trusted source payload or automatic-adoption mode.

## Addresses

SaanSeoi Addresses replace HYPE's structured address system. Mirror/reference
canonical Address identities and selected 2D/3D/unit snapshots and use the shared
structured formatter. Place, Address and Division dependencies must refer to
compatible publications. Do not reconstruct the retired HYPE address model.

Old freeform/structured values remain migration or curation evidence. A fallback
display string is not a resolved canonical Address. Feature address corrections
select Address/unit records; access notes and pickup instructions remain Project
data. Manual Places can retain unresolved local address evidence.

Identify the relevant Places, curate missing Addresses in SaanSeoi, associate and
publish them there, then refresh HYPE. The supported source-side workflow is in
[the Address curation hand-off](places-address-curation.md). HYPE edits never
silently write upstream; a HYPE submission API is a separate extension.

## Monthly refresh

The Place refresh Worker follows the monthly DivisionSync pattern with bounded
steps, pinned publication evidence, exclusive leases, retries and fenced writes.
New runs capture source-linked Places with associated Features and request each
ID through the acknowledged, publication-pinned canonical `filter[id]` collection
contract. Historical in-flight catalogue runs retain their mode and cursor.

Publication comparison uses catalogue timestamps, cohort/revision and canonical
release identity; local ingestion sequence is not proof of source chronology.
Same-cohort forward curation can advance. Older or conflicting publications require
review. Transport pagination links are excluded from canonical content hashes.
Pinned Address hydration is retained with each source revision.

Each item ingests forward evidence, then assesses associated Features in stable
order. Its Feature outcome and cursor commit in one fenced update. Existing
outcomes survive replay. Publication completion requires applied or durable review
outcomes for all work; it never means every Feature accepted the new revision.
Missing IDs retain accepted Feature values. Idle replay makes no writes.

Only the canonical pipeline runs on the scheduler. Publisher-source comparisons
are an optional read-only diagnostic, not an additional adoption dependency:

```sh
bun --env-file=.dev.vars scripts/places/collect-source-changes.ts FROM_RELEASE TO_RELEASE RECEIPT_NAME [PAGES_PER_RUN]
```

This follows `/places/v0.1/sources/changes` pins and cursors, retaining private pages
and hashes under `.local/places/`. Publisher changes do not cover all canonical
reconciliation, translation, Address or curation changes and cannot replace the
pinned canonical refresh. Worker deployment/secrets are a separate release action.

## Existing Features and Breadline

Preserve Feature identities, media, permissions, histories and relationships.
Match establishments using multilingual names, coordinates, contacts and unit
identity; nearby buildings or matching brands alone are insufficient. Retain
rejected candidates, and require deliberate review to accept an identity or merge.
Unmatched Features become unresolved Places with provenance-marked local baselines.
Intentional manual status is reserved for deliberate decisions.

Breadline import eligibility is **recorded runs**, not current schedules: the
reviewed export contains 311 eligible donors and 19 dropoffs, with 155 donors
excluded. Schedules constrained MTR review only. Donor `active` describes
participation, not establishment operating status. Pickup windows/runs belong to
Features/events, never invented business opening hours.

Preserve all 64 reviewed MTR choices as Feature access decisions; collection access
can differ from a Place's nearest general entrance. #558 and #727 retain their
accepted exit labels without invented entrance mappings. Donor #4's reviewed
Fitfort identity preserves its HYPE Place ID and redirects the absorbed mirror.

Use the [migration runbook](places-migration-runbook.md) for export-to-import
rehearsal, guarded split execution, source mirroring, identity review and monthly
refresh. Forward schema migrations preserve data; historical migrations remain
unchanged. The simplification rehearsal checks every retained column, every moved
record, foreign keys, integrity and the absence of compatibility views before
local application. Populated fixtures also cover pending/applied/rejected reviews,
multiple merge assessments, detached empty arrays and in-flight refresh outcomes.

Source identity/Address curation, schedule import and production rollout remain
explicit delivery work in GitHub. This document defines behavior and architecture;
GitHub issues contain current acceptance and release evidence.

## Locally authored structured addresses

Local Place creation and address editing use the SaanSeoi address **content** contract:
`address2d` component names, granularity and relationships; `address2dI18n` component
values; and `Address3dUnit` / `Address3dUnitI18n` semantics. HYPE stores these under
`PlaceFacts.location.address.authored`. Geometry at the Place level remains its
location; optional authored address geometry can describe the premises separately.
Address content is distinct from publication envelopes: HYPE does not invent
SaanSeoi address IDs, inventory IDs, snapshot IDs, dataset codes or publisher metadata.
A local Place remains manual/unresolved even when its address is fully structured.

The component/type contract is in `src/lib/addresses/localPlaceAddress.ts`, based on
SaanSeoi `libs/db/src/schema/shared.ts`, `addressGranularity.ts`, `address3d.ts` and
Atlas's Address/Identifiers API schemas. Unit/floor codes and block types are validated;
locale expressions and explicit null/false values survive. The local editor supports
multilingual address components, unit/floor semantics and exact locale expressions.
Shared unit content belongs to the Place; Feature-only corrections and access hints
remain independent. Editing a Place requires its Organisation's management authority.

Edits append immutable `placeRevision` rows with actor, owner and predecessor evidence;
the insert fences both current owner and latest revision. Existing linked Features keep
their accepted revisions. The Feature review command prepares the newer local revision
for explicit adoption through the ordinary review flow, preserving Feature overrides.
Local-to-local changes do not require fabricated publisher identity evidence; crossing
between local and SaanSeoi source identity still requires the identity review workflow.

Previously stored fallback-only local addresses remain readable and are converted into
structured editor content when opened. No historical revision is rewritten and no new
SQL table or destructive backfill is required. Saving performs the explicit upgrade.
This is local authoring, not an upstream curation/publishing endpoint.

Validation: `bun scripts/places/verify-address-contract.ts ../saanseoi` compares the
current sibling repository's canonical content keys and all four enum vocabularies.
Focused tests cover multilingual round trips, invalid types/publication claims,
immutable edits, stale-owner/revision fences, local review and Feature overrides.
Chromium verified saving structured components and unit details, reloading them from
an isolated local database, and rendering the resulting address without page errors.

## Address scope vocabulary and data repair

Address scope uses `unit` for separately identified units, including rooms, and
`unit_portion` for a portion of a unit. The unit-type code `R` still means Room;
classification of unit type is independent of address scope. Block descriptors
preserve the source component: `flat`, `unit` and `apartment` are observed source
values, not an assertion that the component describes an entire building.

The data repair in `scripts/address-granularity/` maps `room` to `unit` and
`room_part` to `unit_portion` only at JSON `granularity` keys. It covers Place
revisions, Feature overrides/history, review evidence, refresh projections and
Feature address metadata. It preserves display strings and identifiers, recomputes
revision hashes using the original writer's convention, and updates referenced
content hashes in the same transaction. Unknown hash conventions fail closed.
Immutable triggers are restored in that same transaction; stale input rolls it back.
The SaanSeoi companion repairs CURRENT and every HISTORY shard, including inactive
scopes, and recomputes canonical history hashes without changing snapshot ancestry.
No schema DDL is needed: both Drizzle generators report no physical schema change.
Deployment must run these data repairs after schema migrations and before the new
application is released. They are explicit deployment commands, not request-time
compatibility code. Workflow activation is pending approval.

## Proposed Feature Tasks presentation

A Feature's **Tasks** tab shows a count of actionable items. Its initial tasks are:

- **Resolve Place match**: an unresolved local Place has candidate identities.
- **Review updated Place address**: a newer local or SaanSeoi revision needs adoption.
- **Complete structured address**: the selected Place lacks usable canonical address
  content or required floor/unit information.

Each task opens a current/proposed comparison using the actual Feature display
formatter, with language switching, map positions, source/revision provenance and
an expandable component difference. The review explicitly calls out removed unit
information, blank translations, coordinate displacement and retained overrides.
Actions are **Accept update**, **Keep current** and **Edit Feature override**.
Place matching additionally offers **Choose another Place** and **No suitable match**.
A decision resolves the task for that candidate/revision; new evidence can create a
new task. Simply opening a task never adopts a revision.

Tasks should be a presentation of existing identity/adoption review state, with
stable keys derived from Feature, review kind and candidate revision. Do not add a
second task lifecycle/table that can disagree with review decisions. Organisation
permissions still control editing a Place; Feature permissions control adoption.
This is the proposed flow; the current review UI has not been replaced yet.

## Display-first address migration plan

1. Rehearse against sealed HYPE/Breadline exports, retain import exclusions and
   accepted MTR decisions, and preserve the original multilingual display strings.
2. Produce a per-Feature/per-language preview: existing display, structured-local
   display, candidate Place, candidate canonical address, coordinate distance and
   missing floor/unit/translation warnings. `preview-address-migration.ts` uses the
   same formatter as the app; candidate 2D labels remain unaccepted evidence.
3. Compare names, location, branch/unit and contact evidence against one pinned
   SaanSeoi publication. Proximity and chain-name matches alone cannot accept an
   identity. Keep unresolved Places where evidence is insufficient.
4. Resolve identities first, then curate missing address components/units in SaanSeoi
   and associate those canonical addresses with the accepted Places. Upstream
   publication remains a separate explicit operation.
5. Review the resulting **effective Feature display**, including retained overrides,
   before adopting each canonical address. Missing source translations never silently
   erase existing Feature text; a missing unit must be preserved or explicitly resolved.
6. For unmatched Places, append a local revision using the same authored content
   schema, initially retaining the exact display under localized `formattedAddress`.
   Mark these unresolved, not intentionally manual. Convert active Feature address
   state to that schema after preview acceptance; retain original data as historical
   provenance, not as a second editable address system.
7. Verify every accepted display and coordinate change, preserve explicit clearing
   and Feature overrides, and replay the migration to prove idempotence. Retire
   active legacy reads only after no active Feature depends on them.

Structured-local conversion is a schema upgrade, not proof that a freeform address
has been parsed or verified. Candidate matching and the preview do not authorize
mass canonical adoption or manufacture missing structured components.
