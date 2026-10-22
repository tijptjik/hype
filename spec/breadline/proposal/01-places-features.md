# Locations, Feature inheritance and SaanSeoi Addresses

Accepted architecture, 20 October 2026. Delivery tracking:
[#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180); location/routing integration
[#213](https://github.com/tijptjik/hype/issues/213). Schedule import remains under
#195/#196. Production application is a separate release step.

## Identity and ownership

A Location is a shared physical entity; a Feature is a Project's interpretation
of it. A bakery is an establishment Location; its Breadline donor role is a
Feature. Multiple Features can share one Location. Deleting a Feature never deletes
its Location. Intangible Features can remain unassociated. Establishments are the
currently supported source kind; buildings and natural features remain unavailable.
SaanSeoi's upstream `places` family retains its source name.

HYPE owns the permanent `location.id`. New Locations have opaque 12-character IDs using
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

Location states:

- `linked`: identified SaanSeoi source, with immutable mirrored revisions.
- `unresolved`: a local baseline awaiting establishment matching.
- `manual`: an intentionally local Location, excluded from ordinary source matching.
- `redirect`: an absorbed identity that resolves to its surviving HYPE Location.

Source availability (`current`, `missing`, `review`) is independent of identity
state. Missing upstream data does not imply business closure, donor inactivity or
deletion. Manual and unresolved baselines have explicit local provenance.

`ownerOrganisationId` grants baseline authority, independently of visibility:

| State | Baseline authority | Visibility | Organisation edits |
| --- | --- | --- | --- |
| `unresolved` | Owning Organisation | Shared across HYPE | Owner advances the baseline; other Organisations keep their own corrections. |
| `manual` | Owning Organisation | Private to that Organisation | Owner advances the baseline. |
| `linked` | SaanSeoi synchronization; owner is null | Shared across HYPE | Each Organisation keeps its own corrections. |

Creation and physical-data correction require Organisation management authority.
Project roles do not grant upward authority. Project policies govern whether baseline
and Organisation correction changes are adopted automatically or held for review.
A shared Location grants no access to another Organisation's Features or private
corrections. Database guards restrict manual associations and Project/Feature moves.
Matching preserves the HYPE ID, clears local ownership, retains Organisation-authored
corrections and keeps subsequent canonical source snapshots free of local content.

## Storage: ten dedicated tables

Drizzle declarations put `createdAt` and the existing update timestamp (`updatedAt`
or `modifiedAt`) last. Migration 0138 also rebuilds these nine tables with timestamps
physically last; it does not reorder unrelated tables. Conditional insert projections
must follow the declared column order.

Migrations 0122–0125 consolidate the original twenty-table implementation. Migration
`0138_location_storage.sql` renames the nine lifecycle tables, columns, indexes and
guards to Location terminology. Migration `0139_organisation_location_corrections.sql`
adds one Organisation correction head per Location, preserving immutable snapshots
in its append-only `history` array. It migrates existing accepted corrections, failing
on conflicting corrections for the same Organisation/Location. No compatibility views
or generic registry are introduced.

| Table | Responsibility |
| --- | --- |
| `location` | Stable HYPE identity, source ID, ownership, availability; absorbed identities retain `redirectTargetId` and the immutable redirect receipt. |
| `locationRevision` | Immutable source/local snapshots, normalized facts, content hash, API/release/snapshot references and provenance. |
| `organisationLocation` | Unique `(organisationId, locationId)` correction head, immutable revision snapshots, actor and timestamps. |
| `featureLocation` | Current association, accepted baseline revisions, `acceptedOverrides` cache, independently accepted Organisation revision tokens and concurrency token. |
| `featureLocationHistory` | Actor-attributed link, reassociation, accepted baseline/correction snapshots and unlink history. |
| `locationIdentityHistory` | Accepted source-identity transitions and their immutable review references. |
| `locationIdentityReview` | Retained establishment comparison, append-only merge impact versions, optional immutable rejection. |
| `locationAdoptionProposal` | Immutable source-change assessment plus independently written `factsDecision` and `locationDecision`. |
| `locationRefresh` | Monthly publication checkpoint, current run, cursor, lease and retry state. |
| `locationRefreshItem` | Existing bounded work queue for source refresh and local baseline/Organisation changes; origin, correction scope, Feature cursor and durable outcomes. |

Existing resources own their settings: `project.locationPolicy` and
`locationPolicyRevision` store Project policy; `feature.localLocationBrands` stores
unlinked brand corrections and their revision/actor. These are not separate
resources. Corrections live in `organisationLocation.overrides`, reusable across sibling
Projects. `featureLocation.acceptedOverrides` is only the accepted snapshot; it is
not an independently editable Feature override layer. The TypeScript property remains
`overrides` internally for resolver compatibility. Facts and position may accept
different correction revisions. Reviews/rejections include the Organisation revision
in their candidate identity, so independent Organisations and later edits do not
share decisions. Migration `0141_organisation_location_scope_guards.sql` fences accepted
correction tokens to their Organisation namespace and rejects cross-Organisation
Feature/Project moves until those corrections are explicitly reconciled. Sibling
Project moves remain valid. Local changes use the existing refresh work queue and adoption
proposal/decision lifecycle rather than a new task table.

A merge comparison can have multiple impact assessments if its association set
changes before acceptance. Their existing IDs, baselines, source revision,
association token, author and timestamp are retained in the owning identity
review's `mergeReviews` array. Prior entries cannot be replaced or removed.
Rejection belongs to that comparison; acceptance remains in identity history.
The absorbed Place retains its redirect ID, old source ID, review, actor, reason
and timestamp. Redirect chains are resolved without widening private ownership.
Merges retain and copy non-overlapping Organisation correction histories to the survivor;
overlapping Organisation scopes require explicit reconciliation before a merge, avoiding
silent selection between two correction heads.

Four publisher-diagnostic tables and their scheduled collector are removed.
Canonical refresh already checks every associated source identity. Historical
publisher pages remain in the pre-migration backup; the standalone read-only
source-change collector remains available for investigation.

## Effective values and editing

Existing Feature columns are effective read projections, preserving public IDs,
URLs, spatial queries and existing consumers. Their authoritative inputs are the
accepted Location baseline and Organisation correction revisions. Mutations use the shared
resolver and atomic association/projection services.

Overrides use `inherit`, `override(value)` and `clear`. Missing override means
inherit. Locale fields resolve independently. Ordered arrays replace whole
collections; an empty array is explicit and never revives a legacy value.
Equivalent values inherit when linking; meaningful preserved differences seed the
Organisation correction row. Later links reuse that row rather than repeating fixes.
Do not freeze every field as an override and thereby prevent future updates.

`phoneNumber` remains the existing universal HYPE property. Scalars migrate to
one-element arrays; validation, editing and presentation support arrays. HK phone
normalization belongs to the HYPE projection. Mirror upstream values unchanged,
and surface invalid-phone omissions rather than silently erasing contacts.

Brands belong to Place facts and preserve source identifiers and localized names.
SaanSeoi currently exposes `identifiers.wikidata.brandId` and `brandName`; normalize
these into a one-element brand array. Organisation corrections can replace that array;
Features consume their accepted Organisation snapshot.
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
The policy editor presents these as four auto-fitting scenario cards under **Upstream Change
Acceptance Policy**, with the distance limit shown only for distance-based
coordinate acceptance. Controls retain scenario-specific accessible names.

The shared mirror advances independently of each Project's accepted data.
`featureLocation` accepts facts and location revisions independently. Two Projects
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
data. Both unmatched local Places and matched Places with an `ssId` can retain locally
authored structured address content. Place identity and canonical Address resolution
are independent.

Match Place identity first. Parse and review the available address in HYPE using
SaanSeoi content fields, and retain that authored content on the HYPE Place even
when its SaanSeoi mirror has no canonical Address. Upstream address reconciliation
and publication follow later; they do not block matching or local address authoring. The supported source-side workflow is in
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
bun --env-file=.dev.vars scripts/locations/collect-source-changes.ts FROM_RELEASE TO_RELEASE RECEIPT_NAME [PAGES_PER_RUN]
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

The shared content/type contract is in SaanSeoi `libs/address/src/content.ts`,
consumed by both repositories through `@saanseoi/address`. HYPE retains compatibility
exports in `src/lib/addresses/localPlaceAddress.ts`. Unit/floor codes and block types are validated;
locale expressions and explicit null/false values survive. The local editor supports
multilingual address components, unit/floor semantics and exact locale expressions.
Shared unit content belongs to the Place; Feature-only corrections and access hints
remain independent. Editing a Place requires its Organisation's management authority.

Edits append immutable `locationRevision` rows with actor, owner and predecessor evidence;
the insert fences both current owner and latest revision. Existing linked Features keep
their accepted revisions. The Feature review command prepares the newer local revision
for explicit adoption through the ordinary review flow, preserving accepted Organisation corrections.
Local-to-local changes do not require fabricated publisher identity evidence; crossing
between local and SaanSeoi source identity still requires the identity review workflow.

Previously stored fallback-only local addresses remain readable and are converted into
structured editor content when opened. No historical revision is rewritten and no new
SQL table or destructive backfill is required. Saving performs the explicit upgrade.
This is local authoring, not an upstream curation/publishing endpoint.

Validation: `bun scripts/locations/verify-address-contract.ts ../saanseoi` compares the
current sibling repository's canonical content keys and all four enum vocabularies.
Focused tests cover multilingual round trips, invalid types/publication claims,
immutable edits, stale-owner/revision fences, local review and accepted Organisation corrections.
Chromium verified saving structured components and unit details, reloading them from
an isolated local database, and rendering the resulting address without page errors.

## Address scope vocabulary

Address scope uses `unit` for separately identified units, including rooms, and
`unit_portion` for a portion of a unit. The unit-type code `R` still means Room;
classification of unit type is independent of address scope. Block descriptors
preserve the source component: `flat`, `unit` and `apartment` are observed source
values, not an assertion that the component describes an entire building.

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
Actions are **Accept update**, **Keep current** and **Edit Organisation correction**.
Place matching additionally offers **Choose another Place** and **No suitable match**.
A decision resolves the task for that candidate/revision; new evidence can create a
new task. Simply opening a task never adopts a revision.

Tasks should be a presentation of existing identity/adoption review state, with
stable keys derived from Feature, review kind and candidate revision. Do not add a
second task lifecycle/table that can disagree with review decisions. Organisation
permissions still control editing a Place; Feature permissions control adoption.
The basic review section now presents pending adoption reviews as **Tasks**, with
a count and an action to prepare the latest locally authored address for review.
The dedicated tab, unified identity tasks and richer component comparisons remain
UI follow-up work; they do not require another persistence model.

## Feature Address presentation

The Address facet keeps the map and action bar fixed above an independently scrolling
results/address region. The four discovery actions share the coordinate control’s quiet
bordered styling and sit beside it in one toolbar row. At narrower content widths,
actions retain accessible names and tooltips while showing their icons. The radius
slider sits at the top right of the map; coverage warnings precede the results.
Read mode shows the linked Place or an explicit
No Place associated state with a struck-through shop icon; editing hides this empty
placeholder to leave room for discovery actions. An unlinked editable
Feature offers Show Nearby Addresses, Show Nearby Places, Find a Place and Create Place.
The Project Places tab configures a default radius (300 m when absent, adjustable from
50–1,000 m); the regular Project form owns saving it. Each discovery can override the
radius without changing Project settings.

Search results appear directly below the map as keyed FLIP rows. Local and canonical
previews share stable row/marker numbers, preferred-language names and display
addresses, and great-circle distance from the Feature pin (not walking distance).
Hovering or keyboard-focusing a result highlights its existing numbered marker without
selecting, importing, moving the camera, or recreating marker elements. Selecting a
marker selects its row. Canonical preview details are read-only; explicit
selection/import and the existing confirmation step still precede association.
Unavailable preview details remain an explicit partial-search error above the results.
Discovery reads latest-source details with exact ID/release checks; these previews are never
canonical import evidence. Import/linking still requires publication-pinned verification.

Create Place geocodes the current display address and replaces the result area with
an editable structured address proposal. A unique resolved response seeds components;
multiple or ambiguous candidates require selection. Existing unit details are retained.
A failed lookup keeps the original text and local parser proposal, with an explicit
error. Creating a local Place and linking it remain separate steps. A dirty Feature
may prepare/create a Place, but must be saved before confirming its association.

Nearby Address discovery uses the reverse geocoder with each Address's actual geometry;
selecting a result does not move the Feature pin or save Feature values. Nearby Place
search covers all intersecting resolution-nine H3 cells, paginates with a bounded budget,
filters exact great-circle distances and resolves ID/release-checked preview facts before display. Scoped
Organisation-local Places are included. Results rank by proximity and multilingual
address agreement, weighting building, street, building number and unit evidence above
freeform text. Missing addresses contribute no penalty. Pagination, the fifty-source-
preview limit and partial failures are explicit; an incomplete search never silently
becomes a verified absence. A changed pin/radius or cancellation invalidates late results.

Create Place first searches nearby Places and the Feature name, then offers up to five
plausible matches. Identity selection remains explicit: a shared building address alone
is not proof of the same shop. With no matches from a complete search, the local creation
form opens directly. Partial/limited searches require an explicit Create without a
verified match action. A selected Address seeds the structured proposal, retaining the
Feature's unit evidence. Choosing an existing Place retains the prepared address as a
Feature draft after association; the normal Feature Save persists that correction.

Local creation requires Create & allow sharing or Create privately. Both preserve
Organisation ownership and the independent manual/unresolved distinction. The default
is unresolved; intentional manual status remains an explicit choice. Sharing consent is
stored in the immutable local-baseline payload (`input.sharingPreference`) with its
author and revision timestamp. It is permission for future reconciliation, not public
visibility or an upstream submission. Older payloads without a preference imply no
sharing permission. No new table or schema migration is required.
Upstream submission and receipt-driven reconciliation remain deferred under #233.

Place settings and Tasks remain secondary disclosures. The next review should settle
shared Place-address editing versus Feature-only corrections/access directions, and
the dedicated Tasks presentation. No new persistence tables are needed for this UI.

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
4. Resolve identities independently of canonical Address availability. Parse and
   review the available text into SaanSeoi content fields locally, retaining the
   authored address on the HYPE Place alongside its `ssId`. Defer upstream
   Address creation/association to the reconciliation workflow in #233.
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


## Matched Places with locally authored addresses

Accepted architecture; reconciliation is tracked in
[#233](https://github.com/tijptjik/hype/issues/233), parent #180.

A matched Place retains its HYPE ID and `ssId` independently of its address source.
An absent SaanSeoi Address does not prevent an identity match or force the Location to
remain unresolved. The address can remain locally authored while the Location is linked.
That authored address lives in the Organisation correction row, separate from immutable
source evidence. Sibling Projects reuse it; other Organisations maintain independent
corrections. There is no additional Feature-authored correction layer. Organisation
managers author corrections using baseline and correction-head concurrency fences.
A linked baseline can only advance through SaanSeoi synchronization.

Until reconciliation succeeds, incomplete or missing source addresses cannot erase
Organisation-authored content. A new source address is a candidate for comparison,
not permission to discard corrections. Effective Feature display resolves its accepted
baseline plus accepted Organisation corrections, preserving explicit clearing.

The shared parser lives in SaanSeoi `libs/address` as `@saanseoi/address`, extracted
from the existing Harbour Place address parser. It exports shared address content
types/validation, parsing and formatting. Keep DB/API
access and publication outside the package; inject optional street/building lookup
dictionaries. Return recognised components, unresolved fragments and diagnostics,
retaining the source text, parser version and review provenance. Preserve the exact
display until a proposed generated display has been accepted. Canonical IDs must
come from matching, not from parsing.

Both repositories consume explicit package versions, with shared multilingual
regression fixtures. Parser improvements become available through dependency
updates; reruns generate reviewable proposals rather than changing accepted content
silently. Extract the existing tested parser instead of starting a second parser in
HYPE. SaanSeoi uses a workspace dependency; HYPE pins the packaged 0.1.0 artifact
in `vendor/`. No registry publication is required or has been performed.

New imports and Feature splits retain original display strings and parse structured
Place content. Parser review in the editor compares the actual before/after display
before accepting components. Unknown building/street text stays unresolved without
lookup dictionaries; conflicting units remain visible in the original display.

Source refresh and identity promotion retain authored address content and its
provenance, keeping incoming canonical address evidence separately in
`payload.sourceAddress`. A new canonical address never automatically retires the
local content. Local edits on matched Places remain eligible for Feature adoption.
The obsolete one-time granularity repair scripts and deployment instructions have
been removed; the corrected `unit`/`unit_portion` vocabulary remains.

Later, an authorised reconciliation finds/reuses an equivalent SaanSeoi Address or
submits HYPE's reviewed components when none exists, then associates that Address
with the matched Place. Store an idempotent receipt tied to the submitted local
revision. Only a subsequent compatible sync confirming the expected association
and content can retire the redundant Place overlay. A newer local edit, changed
unit or differing display returns to review; independent Organisation corrections survive.


Discovery compatibility note (21 October 2026, Refs #233): the deployed SaanSeoi
canonical collection currently ignores `filter[id]`, returning the unfiltered page.
HYPE deliberately rejects this for import/linking. Latest-source preview requests use
`/places/v0.1/{id}` and validate the returned ID and resource release, allowing discovery
to function independently. Canonical exact-ID lookup remains a source-deployment
dependency; it must not be bypassed by persisting preview facts.

Initial import revision IDs now use a versioned opaque twelve-character derivation,
like Place IDs. Old imported identities are retained on replay; exports do not rename
existing local records. A clean import emits opaque Place and baseline IDs.

## Proposal: shared Locations beyond Overture Places

Research date: 21 October 2026 HKT. Refs [#180](https://github.com/tijptjik/hype/issues/180)
and [SaanSeoi #68](https://github.com/tijptjik/saanseoi/issues/68). This section records a
proposal, not an approved schema change or implemented Buildings API.

### Reviewed data and limits

The latest retained SaanSeoi Hong Kong building extract was `2026-09-23.0`. Review
also downloaded the published `2026-09-23.1` building and building-part data from
Overture's public storage, using schema v2.0.0. To compare the same coverage, the latest
building rows were restricted to the retained Hong Kong building IDs; parts were matched
by retained parent ID and geometry. All 204,207 buildings were found with unchanged
content, excluding implicit partition columns. All 2,982 corresponding parts were found,
with none retaining its previous ID. Overture's September patch explicitly repairs
building-part and base UUIDs. A district-union intersection would exclude 27 boundary
buildings from the retained clipSmart scope; the review does not silently change that scope.

The private local research bundle is `.local/research/buildings-20261021/`. Its latest
extract receipt records scope, hashes and comparison results. The bounding-box downloads
also include records outside Hong Kong and must not be counted as Hong Kong inventory.

Measured building coverage in that scope:

| Attribute | Populated records | Share |
| --- | ---: | ---: |
| Name | 35,263 | 17.27% |
| Explicit height | 1,908 | 0.93% |
| Above-ground floor count | 56,650 | 27.74% |
| Broad subtype | 86,185 | 42.20% |
| Detailed class | 85,170 | 41.71% |

Sources are OpenStreetMap (118,834 buildings) and `doi:10.5281/zenodo.8174931`
(85,373). Building parts belong to 1,254 parent buildings. The
[Building schema](https://docs.overturemaps.org/schema/reference/buildings/building/)
provides polygon/multipolygon geometry, names, current-use classifications, vertical
measurements and optional roof/facade properties. The
[BuildingPart schema](https://docs.overturemaps.org/schema/reference/buildings/building_part/)
provides parent IDs and constituent geometry; a part is not a shop or unit inventory.
The reviewed building payload has no structured address or Place-membership field.
See the [patch release notes](https://docs.overturemaps.org/blog/2026/09/23/release-notes/).

The [LandsD Building dataset](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637211194312_35158)
was checked against its live FeatureServer and published schema statistics, revision
21 September 2026. It contains 342,195 active polygon records. These include towers,
podiums, open-sided structures and temporary structures, so the count is not directly
comparable with Overture buildings or proof of an Overture omission rate. It updates monthly.
The schema reports 64,665 English names, 64,220 Traditional Chinese names, 235,946 base
elevations, 237,348 top elevations and 59,308 storey counts. It supplies `BuildingCSUID`
and iB1000 `BuildingID`; `GeoRefNo` is not unique in this release. `OBJECTID` is a service
row identifier. The associated tables supply alternate names, works history, occupation
permit structure links, permit dates/GFA and lot information. The
[field dictionary](https://static.csdi.gov.hk/csdi-webpage/view/common/fcfd7619367e765fed971fbd1dde8ff7cee49d3fda1fdfce56e5b95deaa3ac05)
defines base/top as elevations above Hong Kong Principal Datum, not building heights.
Do not assign `TopHeight` directly to Overture `height`; retain vertical datum and derive
height only from compatible base/top measurements.

Other useful government sources:

- [ALS](https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf): bilingual
  structured frontage addresses, GeoAddress/CSU evidence, and limited floor/unit data.
  One building can have several frontage addresses; address identity remains separate.
- [Buildings Department building information and age records](https://data.gov.hk/en-data/dataset/hk-bd-opendata-building-information):
  annual private-building address/type/use/block and occupation-permit enrichment.
  It is not a territory-wide footprint replacement.
- [3D visualisation and 3D-BIT00](https://www.landsd.gov.hk/en/survey-mapping/mapping/3d-mapping.html):
  richer exterior models for visualisation; do not substitute mesh/tile IDs for entity IDs.
- [3D Indoor Map](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1671437329821_60808)
  and [Indoor Network](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1742809197336_78665):
  selected venues' floors, units, openings/occupants and indoor/outdoor connectivity.
  These can eventually support entrance selection; coverage is not every building.

A bounded screenshot-area check found Overture's New Lucky House footprint at the
current Toho Hotel pin. LandsD's corresponding named tower has 18 storeys and base/top
values 7.5/57.6 m HKPD, but its footprint leaves that pin just outside. This is candidate
evidence, not confirmation that the hotel occupies the building, and demonstrates why
containment/proximity must not establish identity automatically.

LandsD and Overture Buildings remain strictly separate inventories, with separate release
histories, geometry and source identities. Comparison can propose an explicit cross-inventory
relationship; it must never merge the inventories or publish a deduplicated combined inventory.
Preserve vertical datums and the applicable
[source attribution](https://docs.overturemaps.org/attribution/). ALS frontage links remain
separate evidence-backed associations.

The September 2026 comparison covers 342,195 LandsD footprints and 204,207 Overture
footprints in the retained Hong Kong scope. Of LandsD records, 10.27% have more than 99%
of their area covered by an Overture footprint; 3.82% also exceed 99% in the inverse
direction. The remaining 6.46% are partial containment matches. Unique mutual candidates
account for 3.64%; geometry alone does not establish physical identity or assign GERS IDs.
Preparation, preview benchmarks and Harbour review are tracked in
[SaanSeoi #68](https://github.com/saanseoi/saanseoi/issues/68).

### Shared identity and inheritance

Use **Location** in the UI and a shared typed entity internally. Generalize the existing
Place lifecycle/revisions/association machinery instead of introducing a parallel set of
Building tables in HYPE. The existing organisation ownership, local manual/unresolved
states, authored addresses, review history and Project adoption policies remain useful.

- A shared entity has an opaque HYPE ID, an explicit kind (establishment, building,
  natural feature, site or unresolved), geometry and zero or more address references.
  An address is optional; several frontages can belong to the same building.
- Source references are typed: source/provider, resource family and source ID, with
  version/release evidence. An unqualified `ssId` is insufficient once several families
  participate. SaanSeoi owns reviewed relationships between its separate LandsD and
  Overture inventories; HYPE references the selected inventory's identity and retains
  its own ID. A partial footprint relationship is not an identity alias.
- A Feature has one primary entity association governing inheritance, with a real FK.
  Additional contextual relationships must have explicit roles and never compete to
  supply Feature fields. A business can be located in a building; it is not the building.
- Keep address selection separate from entity selection. Selecting an address alone
  updates the address or suggests a verified related entity; it does not manufacture
  an establishment identity. Keep coordinates-only Features valid.
- Entity content needs typed schemas and raw source payloads: shared names/geometry/
  addresses, establishment-specific phones/brands, building-specific details, and
  natural-feature-specific facts. The current point-only `PlaceLocation` is insufficient.
- Preserve a Feature's map/routing anchor separately from the entity polygon. A building
  centroid, roof outline, frontage or nearest boundary is not proof of an entrance.
  MTR routing continues to use the chosen access/pin location. Project adoption policy
  should distinguish anchor changes, boundary changes, address changes and identity changes.
- Locally authored addresses remain until equivalent source content is published and
  accepted, as in the current Place reconciliation design. A Building match alone must
  not discard that content or assume floor/unit inventory from a floor count.

Migration should preserve IDs, histories, revisions and overrides while widening the
model. Existing canonical Place matches can be typed as establishments where supported;
unresolved records must not all be relabelled as businesses. Building parts need explicit
source/parent treatment in SaanSeoi; do not expose every roof segment as a standalone
Location by default. No additional universal relationship/ontology engine is proposed.

### One discovery flow

Replace the separate nearby actions with **Find Nearby**, alongside text search,
**Create Location**, and a **Types** dropdown. Offer Places, Buildings and Addresses
initially, with supported natural features added later. Project settings own defaults;
temporary filters should not silently save Project settings. Unsupported families should
be identified as unavailable instead of appearing as a successful empty search.

Use one result list and map, with a type icon, textual badge and distinct theme-aware
colour. Show building polygons as well as labelled markers. Hover/focus highlights the
whole corresponding geometry. Names, preferred-locale addresses and distance stay in
the list; addresses without a linked entity remain clearly address results.

Rank using compatible evidence across types: text/address agreement, verified links,
footprint containment and distance to geometry. Do not rank buildings by centroid distance
or allow every unnamed footprint/broad natural polygon to displace relevant establishments.
Use bounded per-type retrieval and a calibrated combined ranking. Dedupe source representations
only through established identity mappings; keep business/building/frontage distinctions,
grouping related results where the relationship is known. A containing-building badge is
useful evidence and not an automatic association.

Suggested sequence: agree this model; implement SaanSeoi #68 with LandsD/Overture sources
and address links; generalize HYPE's existing model and adapters; unify discovery; then
extend to supported natural-feature families. A unified discovery endpoint can normalize
presentation while retaining source-specific contracts behind the API.


### First HYPE Location slice (21 October 2026, Refs #194)

The shared concept is now **Location** in the HYPE interface. **Establishment** is
HYPE's label for the currently supported SaanSeoi Places adapter, not a literal
Overture category: Overture's official theme/type remains `places/place`, covering
businesses, facilities, services and amenities. Preserve that vocabulary in source
contracts and attribution.

Migration `0137_location_kinds.sql` adds `kind` to the existing shared identity.
Canonical Places and evidence-backed Breadline donor imports become establishments;
unclassified legacy Feature baselines and drop-points stay `unknown`. New local
creation is explicitly establishment-only; Building/Natural feature input is rejected.
Source ingestion and reviewed identity promotion/merge set the established kind.
Application projections qualify source identity as `{ provider: 'saanseoi',
family: 'places', id }`. IDs, revision history and Feature overrides remain unchanged.

Migration `0138_location_storage.sql` completes the storage rename: `location` and
`featureLocation` replace the old Place table names, local foreign keys use `locationId`,
and routes/services/scripts use Locations. The same nine-table lifecycle is reused,
with no compatibility aliases. Local audit receipts and nested baselines are migrated;
raw upstream payloads and source projections are preserved byte-for-byte. Stable ID
hash namespaces remain unchanged to prevent identity churn. Building and natural adapters, parent entity relationships,
polygon geometry, multi-family source uniqueness and multiple address selection are
still future work. Enabling another family requires implementing those contracts;
unavailable UI choices must not be enabled by changing a flag alone.

Discovery now combines Establishments and Addresses behind **Find Nearby**, with
session-local **Types** checkboxes. Buildings and Natural features are disabled with
an explicit unavailable explanation. The existing Project radius remains the default;
changing search types does not save Project policy. Source results, private local
identities and addresses retain their distinct IDs. Unclassified local baselines remain
reusable and are labelled honestly. Text lookup and new establishment creation remain
available, with pre-creation duplicate suggestions independent of the nearby type filter.

Results and map markers distinguish address candidates with an amber colour; text
badges/icons make the distinction independent of colour. Hover/focus highlights the
matching marker. The existing fixed map/control bar and independently scrolling results
remain. Search reports partial/truncated coverage, including when one selected family
fails. Address-only selection stages the address through the regular Feature form;
it neither creates an establishment, changes the existing association, nor moves the
Feature's map/routing pin. Saving/Canceling remains the parent Feature form's responsibility.

#### Address identity versus retained address content

Do not add a new HYPE address master table for this slice. HYPE already retains canonical
SaanSeoi address identities and publication-pinned structured content in Location
revisions, with locally authored content when a canonical address is unavailable.
Multiple Features share those revisions through their Location association; they do
not need independently editable copies of the same address master.

Addresses are not assumed immutable or reduced to display strings. Corrections, renamed
buildings/streets, multiple frontages, floor/unit identity and different access points
matter to reconciliation and review. Display/formatted addresses are projections;
structured components and source provenance remain necessary. Division filtering uses
`featureDivisionMembership`, maintained independently, and is not an address identity.

Cities are not part of HYPE's address model (Refs #194). Feature and Location
division overrides do not accept `cityId`, matching the shared authored address
contract. Address memberships, locality choices and displayed divisions exclude
the upstream `city` class. Retained SaanSeoi source records and the generic
division mirror may preserve that classification as source evidence; they do not
make it an address field or an editable address role. Districts such as Kowloon
City District remain districts and are unaffected.

The address division display separates administration, locality memberships and
islands (Refs #194). Source paths use the independent
`hierarchies.administrative`, `.locality` and `.landform` ancestry, preserving
alternatives. Full containment supports source connections; levels, shared names
and polygon overlap alone do not establish ancestry. A mirrored island group may
be shown through a fully contained island’s landform ancestry even without its
own polygon. Missing source hierarchy metadata leaves memberships unconnected.

Locality editing selects **one existing neighbourhood**, at any supported
locality level, with one of its supplied source ancestor paths. A unique path
fills automatically. Boundary cases such as Prince Edward prompt for one complete
source branch, retaining a standalone branch when the source explicitly provides
it. The editor cannot add children, combine unrelated parents, choose arbitrary
levels, or create new hierarchy edges. Administration and islands remain marker-derived.

`divisionOverrides.localityPaths` stores at most one selected root-to-leaf source
path; an empty selection omits localities and null returns to marker membership.
The server verifies the complete path against the selected division's mirrored
ancestry, rejecting additional paths, invented parents and skipped ancestors even
when their levels would otherwise fit. The choice travels through Feature/Location
save and immutable revision JSON without changing SaanSeoi taxonomy or geometry.
Read-only display omits locks and editing controls. The marker/locality explanation
is shown in the existing info tooltip at the right of the Divisions title.

When Buildings become available, model `Feature -> Establishment -> Building` as an
explicit association chain, with direct Feature-to-Building association also possible.
Do not let an establishment's street-level building fallback replace its own unit or
chosen frontage. Keep one primary Feature association controlling inheritance, and
retain the Feature's independent access pin. SaanSeoi owns shared canonical Building /
Address relationships; HYPE retains accepted address snapshots and local corrections.
Consider a separate HYPE Address resource only if addresses acquire independent local
editing, ownership or reuse workflows beyond these revision snapshots.

Verification for this slice: 194 focused app/service/discovery/migration tests and six
Breadline importer tests pass; Place refresh Worker TypeScript passes. Primary local
migration yields 311 establishments and 1,224 unclassified Locations, with integrity
`ok`, zero FK violations and identical pre-existing columns across nine identity,
revision, Feature and division-membership tables. No production migration was run.
Chromium checks cover the authenticated Feature editor, mixed live source results,
disabled future types, hover highlighting, fixed toolbar and independent address staging
without coordinate changes. Light/dark token presentation was checked without saving
account preferences. The test transport used SaanSeoi's configured `hype.localhost`
Origin; the raw port-4173 origin is not allowlisted. A pre-existing layer preview 404
remains outside this slice. Full application type-check reports ten unrelated errors
and nineteen warnings; no changed Location file is among those diagnostics.

### Description-derived image capture metadata (21 October 2026)

Refs [#194](https://github.com/tijptjik/hype/issues/194) and existing image-date
issue [#88](https://github.com/tijptjik/hype/issues/88). Capture annotations belong
to per-image R2 metadata documents, independently of Location facts, Feature
lifecycle, upload time and EXIF capture instants. The optional `capture` contract
preserves date/time precision, intervals, approximation and original wording;
full metadata retains source-description revisions and frozen gallery evidence.
No database column or migration is needed. The conservative planner, staged
applier ports, private inventory/rehearsal commands and integration obligations
are documented in [capture extraction](../../../scripts/images/README.md).

Current gallery intent/creation-time ordering is not evidence of historical
ordinal references. Unverified order, missing metadata and contradictory shared
image assertions remain unresolved. Description cleanup requires verified
metadata writes, successful invalidation and a fenced transaction across every
affected locale of the Feature. The concrete shipped adapter rehearses JSON
copies only; reviewed environment-specific D1/R2 activation, active-writer fencing
and application/restore acceptance remain integration dependencies. No remote
rollout is implied and broad issue acceptance remains open.

The Feature viewer mounts a Bits UI attribution popover on its shared image rail,
so full and description-free cards use the same control. Photograph credit and
capture date are separate from Feature contributor/creation date and image upload
date. Unknown capture dates stay unknown; upload time is never a capture fallback.
Authored capture ranges and approximate dates retain their supplied precision.
The public basic metadata projection supplies camera and dimensions when available;
full source annotations are not exposed by this UI. Requests are lazy and share
the gallery's metadata cache, with stale contributor responses discarded when the
selected image or Feature changes.

ELN venue names are corrected independently of literary Feature titles. The
[review catalogue and local-only runner](../../../scripts/eln/venue-names.md)
document the exact scope, first-party Traditional Chinese names and guarded
name-only application. Existing accepted Feature revisions are retained for the
ordinary adoption flow; a venue name correction does not rename a book or move an
event to a successor tenant.

### Minimal operating state and retained history (Refs #194)

Location facts use SaanSeoi/Overture's `operatingStatus` directly: `open`,
`temporarily_closed`, or `permanently_closed`. Missing/null means unknown; missing
upstream inventory never implies closure. Buildings use a separate `buildingStatus`
(`standing` or `demolished`) because physical condition is not business operation.
These optional facts live in existing immutable revision JSON and Organisation
corrections, with the usual baseline/correction revision fences. No additional SQL
migration, evidence assertion table, confidence field or verification-date system is
needed. Raw source payloads remain untouched. Status changes require explicit
Feature adoption review, including when ordinary adoption policy is automatic.

The Feature's `isIntangible` and `isVisitable` remain independent of its Location:
a removed sign can be intangible while its business is open; `isVisitable=false`
means the Feature cannot currently be visited and does not prove that its business
is permanently closed. The persisted field is `isVisitable`, not `isAccessible`.
A temporary business closure belongs in `operatingStatus`; changing visitability is
a separate author decision. No separate sign lifecycle model is introduced.

Prior names and addresses stay dated by their existing immutable revisions instead
of being copied to a second history system. One optional `successorLocationId`
links a relocated branch or successor explicitly, without moving old geometry,
merging identities or rewriting associated Features. It must name a visible,
non-redirect Location and cannot name itself. Shared records cannot link to private
successors. Removing the relation sets it to
null through the same revisioned save flow. Research source URLs remain in local
review material; researched names must still be supported before application.

## Versioned Location facts and building preparation (21 October 2026)

Refs [#194](https://github.com/tijptjik/hype/issues/194); source research:
[SaanSeoi LandsD Buildings](https://github.com/saanseoi/saanseoi/blob/preview/docs/datasets/sources/hkgov-landsd/building.md)
and [separate building inventories](https://github.com/saanseoi/saanseoi/blob/preview/docs/datasets/families/buildings.md).
The Buildings/Natural source adapters remain disabled. This prepares HYPE's selected
Location snapshots; it does not import either complete upstream building inventory.

`locationRevision.facts` stores a strict `LocationFactsSnapshot` envelope:

```ts
{
  schemaVersion: 1,
  kind: 'establishment' | 'building' | 'natural' | 'address' | 'unknown',
  common: { names, footprint?, location: { geometry, address? }, phoneNumber?, successorLocationId? },
  details: /* validated according to kind */
}
```

`kind` is captured in each immutable revision, so later identity reclassification cannot
reinterpret an accepted historical snapshot. Shared fields keep the current map anchor
and SaanSeoi-shaped address; addresses may be absent. Phones remain optional common
contact data because HYPE's phone property is universal. Establishment details contain
brands and operating status. Building details have their own strict schema. Natural
details retain a classification scheme/category without inventing a source adapter.
Unclassified legacy details preserve known brands/lifecycle until classification is reviewed.
Unsupported explicit JSON versions and mismatched fields fail validation.

`LocationFacts` remains the normalized display projection used by Feature consumers.
The Drizzle facts codec and raw-write helpers validate/serialize the storage envelope;
building/natural-specific details round-trip through `entity` in that projection.
Existing display fields, spatial projections and Organisation corrections remain in
place. SQL readers use version-aware fixed JSON paths for names, geometry, brands
and lifecycle rather than scanning whole revision histories. Building details participate
in the current facts adoption policy. Organisation edits cannot silently drop typed details.

### Minimal spatial facts (22 October 2026)

HYPE retains only the optional physical footprint from additional building source data.
The prior LandsD-specific projector and duplicated source/structure/storey/elevation/
height fields have been removed. Source identifiers remain in the SaanSeoi response's
`identifiers` and retained evidence; HYPE does not maintain a second publisher identity
schema. Address content already models blocks, portions and floors. Storey counts are
not floor identifiers and are deliberately outside HYPE's core facts. Permit/works,
lot, alternate-name and other detailed source attributes can be reingested from
SaanSeoi later if a concrete HYPE need arises.

The optional shared field is `common.footprint`, not a building-specific detail:

```ts
footprint?:
  | { mode: 'inline'; geometry: Polygon | MultiPolygon }
  | { mode: 'reference'; ssId: string; releaseId: string; geometryRevisionId: string }
  | null
```

Both buildings and establishments may have an extent; natural/unclassified Locations
can use the same field. Existing establishment sources do not supply footprints, so
absence remains normal. Rings must be closed and coordinates valid WGS84. The point
in `common.location.geometry` remains the existing map anchor. `details` remains
strictly typed; buildings currently need only optional authored lifecycle status.

Immutable references reserve a future SaanSeoi geometry association and carry only
reference pins, not duplicate LandsD/Overture identifiers. Dynamic `latest`/`current`
aliases and download URL fields are rejected. No source geometry downloader, full
building inventory import or new D1 footprint table is enabled. Building and natural
source choices remain visible but disabled in discovery.

Manual and unmatched authoring is independent of source availability: a local building,
establishment or natural feature can be created with inline geometry now, without an
`ssId`. Local authoring cannot invent an upstream geometry-publication reference.
The existing local save API accepts inline footprint edits and explicit clearing;
omitting the field preserves it. Ownership and Organisation correction rules apply to
footprints too, including accepted Feature snapshots and Project facts adoption policy.
No polygon-drawing UI is added by this schema preparation.

Primary local was checked read-only: none of its 1,581 revisions contain the removed
building-only fields. The optional shared field is compatible with all existing v1
snapshots, so no database rewrite or new migration is necessary for this simplification.

### Conversion and verification

Migration `0142_location_facts_snapshots.sql` wraps existing normalized facts, preserving
revision IDs, sequences, raw publisher payloads, source content hashes and Feature
projections. Historical kinds come from retained creation/import/type-change provenance;
unrecoverable classifications remain unknown rather than using a later identity kind.
It restores the immutable revision guard and rejects new unversioned revision writes.
Application validators enforce the complete subtype contract. Legacy decoding remains
available for retained audit envelopes and pre-migration rehearsal fixtures.

Rehearse with a fresh private output directory:

```sh
bun scripts/locations/rehearse-facts-snapshots.ts INPUT.sqlite .local/locations/NEW-facts-rehearsal
```

The populated rehearsal validated 1,581 snapshots, preserved all effective values and
source evidence, and verified 75 unrelated tables, integrity and foreign keys. Source
and primary input databases are read-only during rehearsal. Regression coverage includes
wrong subtype/version rejection, addressless buildings, typed-detail retention on edits,
optional geometry, immutable reference pins, source replay and import SQL.

### Development discovery latency (22 October 2026, Refs #194)

Development address and Place discovery use `http://api.atlas.localhost`; production
uses the hosted SaanSeoi API. The new-Feature search publishes each provider's results
independently, appends later results without renumbering existing rows, and cancels
obsolete address requests. Local preview requests use a development credential.

Coverage lives in `src/tests/draft-feature-location-search.test.ts`,
`src/tests/draft-location.remote.test.ts`, `src/tests/geocoding.test.ts` and
`src/tests/location-source-endpoint.test.ts`. Chrome verification of the real component
with controlled responses displayed addresses in 785 ms while Places remained pending
for four seconds; selection survived the late response. Authenticated end-to-end
verification remains outstanding. Local Central searches measured approximately
3.5 seconds for addresses and 3.4 seconds for Places before preview hydration.
Indexed address lookup and fewer Place preview round trips remain optimisation
opportunities; backend streaming has not been introduced.


### Locations directory index (22 October 2026, Refs #194)

`/admin/locations` uses the shared header search, control-bar filter primitives,
`ResourceIndex` virtual list and row shell. The dedicated `LocationRow` presents
localized names/address evidence, kind, lifecycle and ownership/source state.
Organisation, kind and lifecycle are server-filtered before cursor pagination;
selecting an Organisation narrows the directory to owned Locations and current
Feature associations in that Organisation. Detail reads retain their existing
authorized shared/private scope. Kind subsets the lifecycle choices and changing
kind clears any incompatible lifecycle selection;
changing search, scope or account clears stale rows and invalidates in-flight reads.
The index automatically loads subsequent pages as the user scrolls, with loading
skeletons inside the virtual list and no separate load-more footer. Header search is route-owned and cleared on departure. Browser acceptance
with an authenticated account remains pending; the local browser redirects to sign-in.


### New Feature naming entry (22 October 2026, Refs #194)

New Features begin with “Find an existing Place” (primary) or “Add your own”
(secondary), with icons and a short explanation. The Profile form expands and
fades in, and visiting Location permanently dismisses this chooser for that draft.
The unplaced map starts over Hong Kong at a harbour-wide zoom without a marker. Location
follows Profile in navigation. Draft discovery searches read-only Places previews
and building/address geocoding without requiring a Feature ID; selecting a result
copies its marker/address and fills empty localized titles while remaining on Location.
Search results animate in flow beneath the search control, with five visible rows
before scrolling. Numbered map previews fit all results and highlight on hover or
keyboard focus. New drafts have no accepted pin until a result is selected or
Drop Pin places one at the current map centre. Divisions appear after placement;
address fields appear only after an address result is selected.
Titles remain editable and independent; this is neither a canonical Location link
nor a new name-following policy. Existing authored titles are retained.
The Photos facet and image pane are omitted until the Feature has a saved ID.
Draft search reports partial provider failures and discards superseded responses.
