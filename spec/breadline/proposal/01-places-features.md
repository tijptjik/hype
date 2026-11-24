Premises map references (15 November 2026, Refs #194): `locationOperator.referenceCode`
stores the operator-scoped premises code, with uniqueness within each operator.
`locationPremisesMap` stores an optional explicit registry ID independently of operator
identity. Migration `0254_location_premises_map.sql` backfills all imported MTR station
codes by exact source key and links KET to `kennedy-town-mtr` and HOK to
`hong-kong-mtr`. The maintained registry resolves these IDs to existing asset
directories; only enabled, ready entries expose a detail-map action. No availability
boolean is stored in the database. All station routes use descriptive
`<station-name>-mtr` slugs, including stations with PDF references only. Code-based
`mtr-XXX` URLs are not accepted or redirected. Station imports retain codes and map
references.

Location operators (15 November 2026, Refs #194, parent #180): an operating body is a
separate `operator` entity with localized `operatorI18n` names and shared logo and
website. It need not be a company or catalogue group: public departments and other
organisations are valid operators. `locationOperator` records the explicitly assigned
current operator and assigning actor. It does not confer access, ownership, brand
affiliation, or an operator on contained units or occupants. This initial contract
supports one current operator per Location; joint operation needs an explicit future
extension.

Migration `0253_location_operator.sql` seeds MTR Corporation using the existing
attributed MTR symbol. The local `scripts/indoor/apply-mtr-operators.ts` backfill
matches the complete station cohort by `locationCanonicalDraft.sourceKey`, requires
shared unpublished premises, and atomically assigns MTR and changes only English working
titles to `<station name> MTR`. It retains a database backup, source evidence, other
locales, physical units, relationships and Location IDs. Replays are idempotent;
conflicting operator assignments require review. New station imports use the same naming
rule and explicit operator assignment. Directory rows display the operator logo with the
existing kind icon as fallback; record details name the operator. Operator
administration and production rollout are separate follow-up work.

Mutable upstream drafts (15 November 2026, Refs #194, parent #180): the Locations index
exposes Published/Draft publication filtering to SuperAdmins only. Published selects
records with an upstream ID; Draft selects ownerless unresolved canonical drafts, not
Organisation-owned unmatched records. Ordinary directory users cannot browse canonical
drafts or open their standalone editor.

Draft profile saves validate the existing field choices, then replace the single working
baseline and its locale rows through migration `0252_location_mutable_drafts.sql`. They
do not append shared corrections or Feature history. An expected content hash fences
concurrent draft edits and publication; the stable baseline ID alone is insufficient.
Raw import evidence and source correlation remain intact. Once a real upstream
publication is accepted, both the retained working baseline and the published snapshot
are immutable. Publication does not fabricate an upstream identity or upload receipt. UI
metadata omits draft revision numbers and explains that history begins at publication.

Establishment onboarding must use reviewed source identities for the selected
convenience-store/bakery brands. MTR tenancy requires an identified physical unit and
its station membership; names or approximate station coordinates are insufficient.
Non-MTR containment remains unset until reviewed. Import the complete relevant
parent-company branch inventories as draft establishment records and draft Locations,
then match Breadline Features to those records. Do not seed establishments from the
eight unmatched Breadline donor Features.

Canonical indoor drafts (15 November 2026, Refs #194, parent #180): MTR stations are
built/premises Locations; physical units are built/building_part members of their
station, and establishments occupy those units through reviewed `locationOccupancy`
assertions. Shared unpublished records retain normal Hype IDs, NULL `ssId`, unresolved
state and NULL owner, with immutable correlation in `locationCanonicalDraft`. They
remain distinct from organisation-owned unmatched and private manual Locations. Source
revisions remain local until a real upstream publication is accepted through an exact
submission mapping; publication retains the Hype identity and relationship/history
references. No upstream release IDs are synthesized. Unit source IDs, original names,
floors and paid/unpaid section metadata remain independent of occupants. See
[the indoor onboarding contract](../../../docs/maps/indoor-handoff.md#location-onboarding-contract-15-november-2026-refs-194)
for source ambiguities, migration, importer and verification boundaries.

Kowloon Tong onboarding (Refs #194) preserves all 40 source occupants and six distinct
7-Eleven units. The [shop index](../../../docs/maps/kowloon-tong-shops.md) records exact
unit identities and reused local establishments. Reviewed occupancies do not rewrite
Feature acceptance; the Breadline G1/KOT113 association remains pending review.

Feature naming review (14 November 2026, Refs #194, parent #180): template creation is a
separate modal step with fixed selectable expression blocks and persistent component
options. Saving a template publishes its reusable definition and opens the application
review directly. The parent resource form remains the persistence owner for its naming
default and reviewed Feature changes. Review choices independently preserve/reset
descendant naming rules and preserve/reset custom title overrides. Only selected feature
types are affected. Before/after names and descendant rule resets are fenced by the
reviewed choices, accepted Feature revisions, hierarchy membership and policy versions;
all changes and attributed history commit together. Unrelated type rules and authored
base-name inputs are preserved. Empty descendant scopes are included when resetting
rules. No production data changes are implied by editing or testing this workflow.

Naming preview examples (Refs #194): previews select real accepted Features within the
authorized scope, using each record's own accepted linked-Location inputs and marking
missing values explicitly. A bounded 64-record scan prefers a populated example and a
distinct incomplete example; it never combines inputs from different Features.

Discovery result sources and map resizing (Refs #194, parent #180): existing Hype
Locations and external SaanSeoi candidates display their respective source marks.
Pending Place discovery names SaanSeoi beneath the available results. Resizing the
map/results divider refits the visible discovery markers after the layout settles;
explicit pin editing retains its camera. Interaction evidence is exercised by
`scripts/visual-checks/discovery-resize-check.ts` through remote Chrome.

Profile curation (12 November 2026, Refs #194, parent #180): Brands exposes an inline
reset-to-inheritance action. Establishment Communications contains Phone, Websites and
Socials independently of configured Feature properties; each has its own Community /
Internal assignment. `locationProfileEdit` carries a typed patch and the original
association revision through the main Feature Save. Phone edits also update any existing
universal phone property atomically. Mobility access is community-only and uses that
same Save and ordinary shared-curation revision, field pin and propagation paths.
Location record editing likewise stages mobility and communications with its normal
Save. New mobility writes do not append `locationAccessibility` rows; retained
observations remain read-only fallback/history. Placement evidence lives in the shared
correction entry so relocation and tenancy changes still flag stale venue reports.
Coverage: `feature-location-form-correction.test.ts`,
`location-accessibility.services.test.ts`, `location-accessibility.remote.test.ts`, and
`scripts/visual-checks/linked-fields-check.ts`.

Linked-field editing (12 November 2026, Refs #194, parent #180): the Feature Location
editor exposes a Linked fields mode beside Multilingual. Community (Hype mark with a
heart) and Internal (lock) independently filter fields; inline icon buttons stage each
assignment through the existing `locationFieldModes` save contract. Internal means an
organisation-owned value, not a privacy setting. Filtering never unmounts draft inputs.
Manual Locations cannot select Community. The supported assignment groups remain Names,
Phone, Brands and the atomic Address; individual address parts share that Address
assignment. The existing universal Phone and Brand editors are available for linked
establishments. Accessibility controls are hidden for address-only Locations without
clearing retained values. Browser coverage:
`scripts/visual-checks/linked-fields-check.ts`.

Coordinate ownership (11 November 2026, Refs #194, parent #180): Feature geometry owns
the user marker. Address coordinates retain the provider address point; reverse lookup
must not substitute the requested pin. Location materialization, adoption and reset read
that point from retained address evidence, using null when no source point exists.
Address formatting receives marker geometry separately for Plus Codes and HKGeocodes.
Legacy `address.markerCoordinates` is accepted on read and omitted from new writes;
immutable historical revisions are not rewritten. Canonical relocation clears the former
address point rather than assigning the new marker to it.

# Locations, Feature inheritance and SaanSeoi Addresses

Draft review entry and canonical contacts (11 November 2026, Refs #194): the selected
Location/establishment name itself links to `/admin/locations/new` when no persisted
identity is available. Its click handler captures the owning Feature checkpoint before
navigation; existing identities retain their record links. The canonical Place adapter
accepts nullable publisher websites/socials and social URL arrays, retaining original
source evidence and distinct same-site accounts while validating public HTTP(S) URLs.
The exact Bakeology source lookup was verified read-only against local Atlas;
authenticated association persistence remains a separate acceptance check.

Draft Location review (11 November 2026, Refs #194, parent #180): a new Feature can open
`/admin/locations/new` before either record exists. The admin-layout handoff retains the
Feature form, setup stage, search progress and Location edits across navigation.
Returning applies reviewed names and address values; Feature Save uses those values in
the existing creation/link pipeline. Location Save creates or imports the identity
first, retains it for retries, and returns to the unsaved Feature, whose Save links that
identity. Provider baselines remain immutable; reviewed changes use Organisation
corrections with revision checks. Independent provider import requires Organisation
management; completion from a saved Feature retains the existing Feature authorization
path. Account changes, reset and successful Feature creation clear the handoff. This
handoff is in-memory; refreshing the Location review page does not restore it. Tests
cover creation, correction retries and authorization; the isolated browser fixture
checks the rendered editor. Authenticated admin checks against a private local database
snapshot verified both save orders, repeated draft navigation, Feature edits and
consecutive independent Location saves with refreshed revision tokens. The repeatable
real-API flow is `scripts/visual-checks/location-save-e2e.ts`; it requires an isolated
admin-persona server and an explicit private-state flag. The import payload whitelists
source identifiers, excluding draft naming metadata rejected by strict API validation.
Checkpoints retain Feature type, target context and the saved Location identity. Address
corrections without provider coordinates retain the pinned Location point rather than
using a Feature marker. Explicit complete address labels are retained separately from
structured content and restored into the editor across shared, Organisation and draft
Location saves. Post-save Feature refresh fetches the committed revision and settles the
form write token before another edit can begin. The real-API browser check passed both
save orders with two consecutive saves per Feature and Location, including reload
verification. Type-picker loading and retry preserve the selected definition; resolved
options alone may invalidate an unavailable type. Older checkpoints recover their type
from the retained field ID before submission, and failed submissions retain the draft.
The browser check includes an older checkpoint and one deliberately failed transport
request followed by a successful real save. These checks do not establish production
acceptance.

Feature setup presentation and navigation (Refs #194, parent #180): the map picker uses
one card with a compact progress header, organisation thumbnails with layer-icon
fallbacks, and inset keyboard focus. Card height changes animate for 200 ms unless
reduced motion is requested. Resolve feature-type options before leaving the picker;
mount only stages that need input, and pass resolved options to the type chooser. Failed
policy requests retain the picker for retry, and only the latest selection may commit.
The setup browser check covers direct stage skips, delayed requests, retries, stale
responses, image fallback and reduced motion in Chromium and Firefox.

Feature creation setup (Refs #194, parent #180): new Features select their Layer,
Feature type and Location kind before entering Location search. Single-option stages
advance automatically; accepting a Location opens the Profile. Organisation, Project and
Layer feature tabs provide a scoped New action that preserves the parent hierarchy. The
setup uses the existing authorized creation catalogue and retains explicit choices when
multiple options remain. Browser coverage lives in
`scripts/visual-checks/feature-setup-check.ts`.

Staff Location propagation (11 November 2026, Refs #194, parent #180): authorized shared
corrections from the Location or Feature editor update linked Features and accepted
history in the same transaction as Save. Copied discovery-address metadata does not
freeze a linked marker; explicit manual placement and accepted occupancy/address
bindings remain separate. Source/system refreshes retain Project review policy and task
queue behavior. Pending staff corrections can replay only against their exact shared
head and source revision. Regression coverage:
`src/tests/location-staff-propagation.test.ts`.

Location discovery setup (11 November 2026, Refs #194, parent #180): the search-stage
progress bar labels its completed choices as Layer, Feature kind and Location kind,
including automatically determined choices. Establishment discovery starts with only
establishments enabled. “Can’t find what you’re looking for?” opens a centered guide
that offers building search, then address search, as starting points for the intended
custom establishment. Custom creation remains available at each fallback stage; choosing
a starting point does not change the intended Location kind. The setup bar's measured
height contributes to the search panel offset so the map resize handle stays on the map
boundary. The local-result truncation notice is omitted from this flow. Legacy saved
discovery states migrate their old all-provider defaults; new explicit provider choices
survive restoration. Activating a result keeps its scroll position, and group headings
remain outside row highlights. An exact establishment choice skips further specificity
review and offers only the existing-location action. The footer continuation has 32px
additional bottom clearance and moves to the viewport center at the end of a fully
loaded result list. Place defaults inherit the chosen Location name; legacy generated
Plus Code titles are repaired when a named Location is available.

Breadline field reset seed (Refs #194, parent #180): migration
`0223_breadline_mtr_paid_area.sql` preserves the project-owned `mtrPaidArea` internal
toggle, its existing English label and project ordering. The field is active on Donors
and ignored on Dropoff Points; neither layer permits user contributions to this field.
This seeds configuration only, without assigning values to Features.

Feature transfers (Refs #194, parent #180) preserve accepted Location customisations.
Cross-organisation moves copy accepted organisation corrections and scoped placement
evidence with provenance; source-owned local Locations receive independent destination
copies. Destination organisation management is required for these definitions. Conflicts
reject without overwrite; the copies, Feature move and revision commit atomically. See
[authorization roles](../../../docs/auth/Roles.md) and
[transfer authorization](../../../docs/specs/Design-Spec-Authorization.md#feature-transfers-and-organisation-location-definitions).

Visibility selector presentation (Refs #194, parent #180): use the shared Bits Select
menu with **Shared** / **Organisation-only** labels and bold labels in its help tooltip.
The stored values remain `shared` / `exclusive`; this presentation change does not
change access rules or defaults.

Accepted architecture, 20 October 2026. Delivery tracking:
[#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180); location/routing integration
[#213](https://github.com/tijptjik/hype/issues/213). Schedule import remains under
#195/#196. Production application is a separate release step.

Feature revision integration must preserve these Location ownership/adoption rules. The
[Feature write-boundary contract](../../../docs/refactor-guides/Feature-Revisions-Write-Boundaries.md)
identifies accepted references, shared Organisation corrections and the requirement that
pending Feature proposals cannot mutate Location projections. Source refresh, Feature
adoption and Location identity changes remain distinct operations. The user confirmed
that policy-approved automatic adoption continues with attributed accepted Feature
revisions. Shared Location corrections save immediately for Organisation managers;
Feature-only editors require separate Organisation review. Enrolled Features now capture
those changes through the attributed revision boundary. Live Feature enrollment remains
disabled pending the full legacy-media cutover rehearsal.

Feature editor loading (29 October 2026, Refs #194, parent #180):

A known Feature mounts as soon as its own authorized read completes. Admin bootstrap
does not await the Feature collection, and Project/Layer/Organisation cards hydrate
independently through the shared resource cache. The single-record read projects only
the effective description and Location-name policy flags needed before parents arrive;
the persisted parents remain authoritative. Parent hydration must not reseed edited form
values. Profile locale defaults reuse cached parent settings. Location and Photos defer
their component requests until first visit and retain drafts across tab switches.

The index and remote search read 50 records per page. Previous/Next uses bounded
authorized ID pages (maximum 250) and stops once the requested neighbour is known.
Content/property filters use bounded card pages with the existing predicates; text
search uses the index's server search. Complete retained index sequences preserve their
exact order. Scope changes discard stale responses, concurrent scroll requests are
deduplicated, and native first-page overrides preserve appended pages. A filtered empty
page continues while more pages remain; failed pages retain results and offer retry.
Whole-collection completion statistics wait until every matching page is known.

Implementation: `AdminCtx`, the admin Feature index/detail routes, `getFeatureIds`, and
the ID-only `listFeatures` projection. Regression coverage lives in
`admin-feature-pagination.test.ts`, `admin-feature-navigation.test.ts`,
`feature-index-search-loading.test.ts`, `feature-profile-navigation.test.ts`,
`feature.remote.test.ts`, `feature-query.services.test.ts` and
`feature-presentation-policy.test.ts`. This change requires no migration. Authenticated
browser acceptance and post-change timing remain pending explicit approval to reuse the
existing local Hype session. Broader migration acceptance remains open on the linked
issue.

Category-only discovery (29 October 2026, Refs #194, parent #180): a selected basic,
primary or parent taxonomy category permits empty/whitespace search text. Operating
status alone does not. Applying a category searches automatically; Clear removes results
while retaining the category and enabling Search/Enter. Building/address providers still
require text. `sourceClient.ts` uses the filtered Places collection for category-only
requests because Atlas FTS requires text; parent categories include descendants through
exact primary-category requests. Each page consumes at most four sequential collection
reads under a shared 30-second deadline and hydrates up to 20 candidates. Continuations
retain the category position and publication pin. Preview category/status verification
remains in place, including continuation through empty filtered pages. Regression
evidence is in `draft-feature-location-search.test.ts`, `location-source-client.test.ts`
and `draft-location.remote.test.ts`. Local Atlas returned 20 Bakery and 20 Japanese
Restaurant candidates with verified previews; Chromium/Firefox component checks passed
with those previews at desktop and 390px. Authenticated admin acceptance remains
unverified because browser access exposed no session. This does not complete the broader
migration acceptance TODOs.

Per-kind lazy discovery (29 October 2026, Refs #194, parent #180): Search-mode Places,
Buildings and Addresses load the next page when their own result boundary comes within
160 px of the viewport. Places hydrate 20 candidates per request; Buildings fetch
details for ten matching buildings and keep each building's address alternatives
together; Addresses retain their existing 20-result pages. Appending deduplicates stable
identities and preserves provider order, focus and scroll position. Pending pages show
one skeleton row matching the result layout, with an accessible loading label and
reduced-motion support. Hidden kinds and selected/grouped views do not request pages.
Empty kinds have no count/footer; the shared empty state appears only when all requested
kinds have finished with no results and no remaining continuation. Failures keep
existing rows and offer retry; changed query/publication cursors require Search again.
Nearby Map pin discovery with empty text retains its bounded contract.

Nearby text discovery (11 November 2026, Refs #194, parent #180): typing in Map pin mode
refreshes providers after 300 ms and immediately invalidates older responses. Places and
Addresses send the selected circle to SaanSeoi using `nearLat`, `nearLng` and
`maxDistance`; distance constraints apply before result pages and bind cursor identity.
Buildings search the published name catalogue and resolve matching details with bounded
concurrency before excluding buildings outside the radius. Clear returns to bounded
nearby discovery; changing the radius refreshes the query. These Hype and SaanSeoi API
changes must ship together. Coverage includes matches beyond the original result cap,
changed-circle cursors, stale responses and headless Chromium/Firefox search/clear
interaction at 390 px in `nearby-text-search-check.ts`. That browser check uses mocked
providers and does not establish authenticated admin or production acceptance.

Text Places discovery uses SaanSeoi's `paginate=true` and opaque `meta.nextCursor`
contract, with name/brand hits before contextual hits across pages and HTTP 410 for
changed search/publication identity. Hype and SaanSeoi API changes must ship together.
The create-a-map hand-over reference and coverage matrix document the upstream contract.
Focused source/API/building and component tests cover continued, empty, failed and stale
pages. Chromium and Firefox component checks verified Places 20→40 using live local
SaanSeoi data, Buildings 10→20 and Addresses 20→40 using fixture providers, distinct
candidate marker IDs and no 390 px overflow. This evidence does not establish
authenticated admin acceptance.

A
[revised draft for Location identity, address scope and relocation](drafts/location-address-occupancy.md)
separates continuing establishment identity from Feature placement, proposes shared
address references and explicit occupancy/membership history, and describes the
building/premises query model. An A–Z scenario catalogue links each case to the
participating tables and their field effects. The table-by-table walkthrough specifies
Project relocation defaults, inheriting Layer overrides and `fixed | review | follow`
behavior, with `review` as the unspecified default. Relationship storage, placement
decisions and canonical address reconciliation are implemented locally; the complete A–Z
workflow and production rollout remain unaccepted. The draft now separates
replacement/merge/split lineage from duplicate-identity redirects, uses target
`version`/`rawSource` revision names, keeps sign condition in the existing Feature
property system, and retains address `premisesType` only as raw source evidence. It also
replaces the proposed Organisation correction history array with immutable
`organisationLocation` rows linked by `previousRevisionId`; accepted correction tokens
reference row IDs. Migrations 0149 and 0154 implement the guarded correction-row
conversion and naming changes. Operational checks use the normal development database
through `scripts/locations/accept-placement-local.ts` and
`scripts/locations/accept-address-local.ts`; see the
[rollout guide](../../../docs/refactor-guides/Location-Lifecycle-Rollout.md) for
prerequisites and the distinction between fixture navigation and accepted decisions.
Identity split and arbitrary local-building deduplication remain separate unfinished
execution paths. The application deploy helper now includes both database refresh
consumers; migrations and exact dataset plans must still be verified before rollout.

## Establishment substring discovery

Refs #194 (parent #180), with upstream SaanSeoi Places search. Discovery matches literal
fragments inside words (`axim`, `cake`, or `axim ca` find `Maxim's Cakes`). Names and
brands take precedence over address/category matches. Terms of at least three characters
use the trigram index; shorter fragments use a bounded scan. The existing 300 ms
debounce remains, with up to 20 previews per page. A broad query such as `a` can match a
business on a later page; exact upstream category filters narrow the candidate set
before each page limit. The continuation determines whether more candidates remain; the
page size does not imply an exact total.

SaanSeoi's `placesSearch.test.ts` covers fragments, short/CJK queries, punctuation,
filtering, parameter bounds, publication guards and atomic index upgrades. Local live
API checks find Maxim's Cakes for `ax`, `axim`, `cake`, and `axim ca`. Authenticated
admin-page acceptance remains unchecked because browser session access is unavailable.
Production requires the upstream trigram-index upgrade and API deployment.

## Historical presentation layers — local implementation

Refs #194. `project.flags.showHistoricalLayers` now controls persistent derived Layers.
Migration `0147_historical_layers.sql` gives each derivative a unique source Layer; new
IDs use `history:<sourceLayerId>`. Membership follows the Feature's explicit
`isIntangible` flag and never changes canonical operating/building status. The public
query excludes historical Features unless their derivative is enabled and both source
and derivative are published and unarchived. Feature publication, archive and privacy
rules still apply. Turning the toggle off retains the derivative's configuration.

Derived Layers retain editable translations, field configuration and map/marker styles.
Their parent and membership are system-managed, and manual deletion is rejected.
Source-layer archive restoration applies saved Feature archive state before the source
update can provision a historical derivative and route intangible Features. Both
operations share one guarded transaction, so failed/skipped source updates roll back
restoration too. `src/tests/archive-transaction.services.test.ts` exercises this
ordering with the real `0147_historical_layers.sql` triggers (Refs #194).

Migration `0152_historical_layer_descriptions.sql` persists English, Traditional Chinese
and Simplified Chinese descriptions for Ghost Signs Historic, Neon Dismantled and
Bookstores Permanently Closed. It requires the configured derivatives and translations
to exist, distinguishes sign removal from business closure, and leaves names and
source-layer descriptions unchanged. The Black/White marker desaturates only the
displayed photograph. Physical condition continues to use the existing Feature property
system.

The guarded local setup script is `scripts/locations/setup-historical-layers.py`; it
defaults to rehearsal and requires `--apply` for the named local SQLite database. It
preserves Neon's existing Dismantled ID and captures before-images, exact-ID changes,
counts, replay checks, foreign-key checks and retained history/media hashes. Local
application produced Neon 405 Current / 198 Dismantled, Ghost Signs 503 Current / 14
Historic, and Bookstores 86 Open / 42 Permanently Closed (including existing drafts and
archives in these inventory counts). These are not public-visible count claims.

SQLite routing runs in the write transaction. Form services read back the committed
layer assignment after routing, and the existing resource refresh updates the admin
prism. Browser QA in an isolated database verified Project toggle saves, retained
settings, managed-layer controls and linked Feature historical/current round trips. The
QA copy also required the existing address-contract migrations 0145/0146; those broader
migrations remain unapplied to the primary local database by this task. Production
rollout remains unexecuted. Correction-row redesign, placement access-hint storage and
simplified accepted membership references remain proposal changes.

## Identity and ownership

A Location is a shared physical entity; a Feature is a Project's interpretation of it. A
bakery is an establishment Location; its Breadline donor role is a Feature. Multiple
Features can share one Location. Deleting a Feature never deletes its Location.
Intangible Features can remain unassociated. Establishments are the currently supported
canonical source kind. Building exports support verified catalogue association with
retained provenance; building refresh and natural-feature source adapters remain
unavailable. Local authoring supports unknown, establishment, building, address and
natural types. SaanSeoi's upstream `places` family retains its source name.

Location presentation uses the accepted association's `kind`: establishments use a shop
icon, buildings a building, and natural features a mountain. Discovery rows and type
filters share `LocationIcon`; address previews use a house pin and unclassified or
absent identities use a plain pin. The icon component also accepts `street` for road
presentation; this does not enable street storage, authoring or discovery, which still
require a domain kind and source adapter (Refs #194).

### Partial street discovery and building association (28 October 2026, Refs #194, parent #180)

Text discovery matches partial structured street names against Address records; streets
are not a separate result type. SaanSeoi's forward address scorer includes `streetName`
alongside formatted address, building name and premises name. Queries containing a
street number retain the existing number/range/parity checks.

Building search alternatives collapse only when their normalized building name and both
coordinates are identical. Different coordinates remain separate even within 100 metres.
Expansion retains the real individual Address alternatives. Address-result premises
grouping keeps its existing street and proximity rules.

**Use as Building** first resolves the Address's exact building name against cached
Building results. If unavailable there, a dedicated exact-name lookup considers only
published building points within 100 metres of the Address marker, including records
listed under another street/address. Building-name editor blur performs this lookup in
the background; changing the name or marker invalidates stale responses. Equally near
distinct building identities require review rather than an arbitrary association.
Premises-only addresses never establish a building match.

The target remains separate from the accepted draft until the explicit Building action.
If the point changes, the map focuses the target and a warning requests **Move marker
and link building** confirmation. Cancel leaves the existing choice intact. Cached
building targets retain their result number, including while viewing an expanded Address
group; targets absent from discovery use a blue building icon.

The deferred save intent retains the actual building ID, export release and selected
spatial Address ID, independently of Places `ssId`. Organisation-authorised import
verifies those exports server-side, records immutable `building-export-baseline`
provenance, and reuses an import-owned shared Location identity for that building ID.
Exclusive identities are scoped to the owning Organisation. Retries retain the returned
Location/revision before linking. Reviewed entity-name edits use the existing
Organisation correction writer without replacing the verified export baseline. These
catalogue-backed baselines retain existing Shared/Exclusive state semantics; this does
not enable Places refresh for building exports or claim an Address ID as a building
identity. Unmatched buildings still support local authoring. No database migration or
historical rewrite is required.

Focused evidence: `building-match.test.ts`, `building-search.test.ts`,
`draft-search-groups.test.ts`, `draft-feature-location-search.test.ts`,
`building-location.remote.test.ts`, `location-building.services.test.ts` and
`link-draft-local-location.test.ts`. The sibling SaanSeoi regression cases live in
`apps/atlas-api/src/services/addressParsing.test.ts`; indexed recall is checked by
`db/geocoding.test.ts` and `db/geocodingText.test.ts`. Browser evidence uses the real
building/address exports and `BuildingDiscoveryFixture.svelte`; establishment and
division remotes are isolated. Authenticated admin save/reload acceptance remains
outstanding, as do upstream refresh/reconciliation workflows.

### Local identity from address discovery (26 October 2026, Refs #194)

**Address association correction (28 October 2026, Refs #194, parent #180):** In a new
Feature draft, **Use location only** now schedules creation and association of an
`address`-kind Location after the Feature saves. It uses the existing
Organisation-authorized local creation and Feature association APIs, with the chosen
Shared/Exclusive visibility. The effective localized address supplies the Location
label; no separate venue name is required and the Feature title stays independent.
Unlink cancels the pending association while retaining the address; relink restores it.
The retained creation intent reuses the same Location when association needs a retry.
Back to results still undoes the draft choice.

The baseline contains authored address content without claiming an unverified upstream
identity. The accepted Feature placement retains its selected canonical Address ID,
snapshot, raw evidence, local corrections and pin through the existing link preservation
path. This does not infer a Building identity, add canonical Address import/refresh, or
deduplicate independently created local Locations by address text. Existing saved
Feature address staging and explicit reassociation remain separate workflows.

Evidence: `address-identity.test.ts`, `draft-feature-location-search.test.ts`,
`link-draft-local-location.test.ts`, and the address-kind initial-link case in
`location-services.test.ts`. The six-file run passes 212 of 214 tests; the two existing
Location-service failures (rejection race fixture parameter count and explicit empty
display clearing) reproduce with the pre-change identity helper. Svelte check reports
zero errors and 19 existing warnings. The Chromium address fixture verifies acceptance,
unlink/relink, no separate name field, and 390px layout without horizontal overflow or
browser errors (`output/playwright/address-location-{linked,mobile}.png`). No
authenticated session was exposed by the browser connector; actual admin save/reload
acceptance remains open.

An Address result also supplies address evidence independently of building or
establishment identity. Named building components offer **Use as Building**;
**Establishment here** creates a separately named local establishment even when
discovery finds no matching Place. Premises/estate names alone do not imply a building.
The draft shows editable localized entity names. Creating from the Feature draft uses
the selected Shared/Exclusive visibility and existing Organisation-authorized local
creation and Feature association APIs after the Feature has an ID. A successful local
creation is retained before association so association retries reuse that Location. The
existing saved-Feature discovery flow offers the same choices through its local creation
form.

The inline entity Name edits the local Location creation draft, independently of the
Feature's Profile title and name-inheritance policy. Its toolbar label follows the
edited locale. Address-only selections show their pending association control and
building/establishment creation actions instead of a separate entity-name input,
including addresses carrying building-name evidence. The canonical address reference is
retained, but does not establish a Building or Establishment identity. Type menus close
on outside click, Escape, or choosing an option. The standalone shared Location page
edits community facts only, with no edit-destination selector or fallback to an
Organisation override. Organisation overrides of linked Location fields belong in the
Feature's Location editor; unlinked Feature fields remain directly authored Feature
content. Opening a Location with Organisation context does not make its displayed facts
or edits Organisation overrides. Private visibility and Feature association are
independent: a private manual Location can still have linked Features.

The Feature facet and generated navigation links use `location` (`#location`); legacy
`#address` bookmarks resolve to Location. Link glyphs display current state. Inline
local Name fields replace the draft pencil action. Shared/Exclusive appears beside
Multilingual: Shared creates `unresolved`, Exclusive creates `manual`. This is
independent of `sharingPreference`, which remains private consent by default.
Organisation Advanced stores `defaultLocationVisibility` (migration 0156); existing
organisations default to Shared. The default only seeds new drafts, never changes
existing Location visibility, and a deliberate draft selection wins over late fetches.
Reset returns to cached search results and clears the visibility override. Without a
selected organisation, Shared is immediately available; loading an existing organisation
default temporarily disables the selector rather than showing a generic resource-loading
message. The information trigger sits outside the selector. Localized draft names use
locale, kind icon, and input rows. Empty draft names and formatted address overrides
offer the existing Translate-from controls; pending translations must preserve user
edits and cannot apply to another selected identity.

The selected Feature address retains its address publication/reference. The local entity
baseline copies effective structured components without claiming an upstream entity or
Address identity. Catalogue building association uses the independently verified export
match described above; address IDs are never used as building ssIDs.

A building's supporting display address omits its building-name and unit components,
retaining street number, street, estate/premises, phase/block and locality context.
Establishment addresses retain building and unit guidance. Complete address evidence and
explicit custom display text remain intact; omission is component-based and never a
substring deletion from a name or freeform address.

### Shared address presentation and editing (Refs #194)

The Feature association review presents the original Address on the left and the
Location record on the right. Components run from street and number through complex,
phase, building, block, level, unit and access hints. Corrections edit the selected cell
in place and remain Feature-owned; switching sides discards that correction. English UI
labels use **Complex**, while the stored `premises` kind and source keys stay stable.
Reselection uses an accessible icon button with a tooltip. A separate marker row repeats
the discovery map's marker numbers/colours with the same direction switch and distance
between positions; it defaults to the candidate pin when available, with an explicit
choice to keep the original coordinates. Hover/focus on each compact marker card
highlights its map marker. The map retains at least 128 usable pixels while the review
scrolls independently. Review sizing uses intrinsic content height: long comparisons can
shrink the map, while compact proposals return spare body space to it, capped at 65% of
the viewport. Manual resizing remains authoritative until the content requirements
change. Change triggers a fresh layout calculation, reserving a bounded
candidate-results area rather than letting streaming result counts repeatedly resize the
map. Comparison framing includes only these two markers, with 20% margins plus the
marker radius, and refits after resize. The unnumbered blue marker uses a location-pin
icon. This avoids creating two extra map canvases for the comparison.

The specificity selector fills a recessed strip flush beneath the header. Its content is
vertically centered with expansion and ring-legend buttons at the far right; the
collapsed view retains only titles and the compact track. Selecting a record collapses
it. The legend explains address evidence, available matches, the selected level and
lookup state. The outer green ring pulses during lookup, then shows the strongest
candidate's evidence strength as an arc once it reaches 60/100. An exact match or the
original published record fills the ring. This is a heuristic score, not a probability:
exact names contribute 55, distinctive contained names 45, distance contributes up to
25, street and number agreement 10 each, and overlapping contradictions subtract 15
each. Missing components are unknown, not contradictions. Partial scores cap at 95 and
never trigger automatic selection. Exact inference retains the name, street, number,
proximity and complete address agreement gate. The nearby theatre example scores 70/100;
proximity alone cannot reach the threshold. Establishment discovery also runs for an
initial Building so those candidates can draw attention before the user switches kinds.
The ring does not encode selection. Keyboard focus outlines only the notch. Reselecting
the active level preserves its comparison and unsaved corrections. Switching levels and
returning restores the selected record and review for that level. Notches have opaque
backgrounds and a single solid centre dot for the selected level only. Evidence is
encoded by the rings. Hovering an unselected notch previews the choice with a semiopaque
primary dot; leaving removes it. Hover never scales the notch. Search begins the
following section.

When comparing different records, the original selection and candidate each have a
column header with their own kind icon and full name. The candidate header retains the
name editor and reselection action. It is highlighted as the selected identity, while
the original is visually unselected; a fixed, noninteractive arrow points right. The
address component rows remain independently selectable and aligned under both
identities. Populated candidate fields are the default, with original values filling
missing fields; explicit normalized clears remain deliberate. Additional details expand
and collapse with reduced-motion-aware transitions. Map-position descriptors are
centered in their respective columns. Multilingual shares the comparison heading row,
allowing the title to wrap within its column.

A single-record proposal uses an emphasized card with a kind icon, record name,
kind/sync metadata and any supporting address (without repeating a Building's name). The
primary Use action includes a checkmark; the secondary Change action includes the
reselection icon. An inline pencil edits the establishment name. This proposal does not
offer address-part editing; component disambiguation remains in the two-record
comparison. Acceptance controls live on the proposal instead of being duplicated in the
footer. There is no Cancel button in association review; the header back action supplies
navigation. Back from the accepted editor first reopens the proposal, preserving the
accepted identity and reviewed address. Its header restores the association heading and
hides address/sync/visibility form controls until Use returns to the editor; a further
back action returns to discovery results.

The selected identity and establishment-name editor share one field card. Corrections
return to clickable text on blur, retaining their primary-colour override dots; Wrapped
names edit in an autosizing textarea whose minimum height matches the displayed name;
component labels retain their space during editing. Reset is offered only for a real
value difference (including unconfirmed street text), and restores the chosen source
value and Edit action. Outside pointer clicks finish before the field switches
presentation, so wrapped text cannot move an action away from the pointer. Multilingual
adds native locale prefixes beside the other languages; the active user's language has
no label, and each field opens independently. Street numbers, levels and flat/unit
identifiers are shared and have no translation rows. Level and Flat / Unit corrections
use the regular address editor's type vocabulary, reference parsers and semantic
setters, keeping type and reference separate. The Map pin title, distance and switch
stack in the centre column between the marker cards. Street corrections require an
explicit selection from the shared street catalogue and retain that street ID; building
names offer the known catalogue and allow custom text. Catalogue selections apply their
available language variants together. Name edits belong to the accepted draft, retaining
the selected Location identity and immutable source evidence; they do not rename the
source record.

The standalone Location detail puts the marker map above the record. Its left column
contains identity, owner, state, contacts and public revision/publication metadata; its
right column uses the same `AddressDetails` and `AddressDivisions` components as the
Feature address form. Building number ranges, blocks, phases, floor and unit expressions
are combined inputs; their parsed components and language-specific ordering stay out of
the field list. Translated fields are shown on request. A partial component correction
must retain any display text that has not yet been structured; lookup choices and parser
proposals require explicit selection before they replace the draft.

The detail uses the standard `Main.Root`/`Main.Facet`/`FormSurface` resource workspace.
`FormFeatureAddress` owns the full-width map, resize handle, Location toolbar and
coordinate/copy controls. The resource header owns the record title, Locations
breadcrumb and Edit/Cancel/Save actions. Section gutters provide the content inset; the
map meets the header and sidebar edges.

The same header Edit/Cancel/Save flow owns localized Location names. Existing language
variants appear in the metadata column when viewing. Editing places type and names above
the address in the main column, with full-width name controls; each name can be edited
or assigned to an unused language, and Add language creates a translation only on
request. Removing a language explicitly clears it, while at least one non-empty name
must remain. Names and address changes save atomically behind both revision fences.
Name-only saves retain the entire address and canonical publication evidence.
Source-linked names become Organisation corrections; owner-controlled manual records
advance their immutable baseline. Linked Features are not rewritten.

The owner displays the Organisation's localized short name. Created/revision timestamps
are formatted in Hong Kong time. Baseline sequence, Location revision ID and
Organisation correction revision ID have distinct labels; opaque tokens and publication
IDs are grouped under Record identifiers. The correction revision token versions
Organisation-specific corrections and is not an Organisation ID.

The owner can change an unmatched/manual Location's type through the same atomic Save
flow, with stale revision/type rejection and immutable type-change provenance.
Source-linked records cannot be reclassified this way. Migration
`0140_location_address_kind.sql` extends the type constraint by replacing only the kind
column; it preserves the lifecycle tables, foreign keys, records and triggers. It is
rehearsed against populated associations and applied locally; remote rollout remains
outstanding.

Discovery follows the intended type: unknown/establishment requests Places, Buildings
and Addresses; building requests Buildings and Addresses; address requests Addresses
only. Both text and nearby discovery use this policy. Missing providers are explicit
incomplete coverage while successful previews remain selectable. Nearby discovery
reports its 20-preview cap and upstream pagination limits separately from incomplete
coverage (Refs #194). The UI offers a narrower-search hint for limits, a retry for
incomplete results, and an unavailable warning only for a failed request. Nearby
category and operating-status filters run on the cell response before the nearest-50
candidate and 20-preview caps. Unrelated closer places must not crowd out matching
establishments; detail previews recheck the selected filters. The current SaanSeoi
integration has no Buildings adapter, so Buildings results remain blocked; this does not
infer a building identity from an address point. Standalone Place previews can supply
details without asserting canonical identity; source-identity acceptance remains a
separate reviewed operation.

Selecting an address for an establishment asks for the establishment's localized names
and exposes floor/unit authoring. Feature creation uses the same name and address
components. Building editors hide every 3D option, including source unit inventory;
local building writes remove authored unit/floor details. Address editors retain 3D
controls to specify a more precise location. Focused acceptance tests cover type
routing, metadata, migration preservation, atomic type/fact saves and stale guards.
Browser evidence in `.local/locations/type-editor-20261021/` covers the real Location
shell and local persistence, with intercepted search fixtures rather than live upstream
search acceptance.

The reverse lookup lists current `featureLocation` associations with localized Feature,
Project and Layer names and publication/archive state. Each row passes
`authorizeFeatureAdminReadForProbe` independently of Location ownership. Internal scans
are bounded; accessible results are paginated after authorization and all pages
reauthorize. Only current links appear, including drafts or archives when permitted. No
selected sidebar prism narrows this reverse lookup.

Address divisions are resolved from the current marker against mirrored SaanSeoi
membership polygons, rather than copied from a nearby address. Missing geography and
failed lookups remain explicit. Administrative and landform memberships are read-only.
Hood and locality choices use stable, class-validated IDs, explicit omission, or a
dynamic `{ mode: 'marker' }` reset. Cities remain excluded under the existing
address-division rules. No editable country, area, district or island keys are accepted
in the override contract; authored factual IDs are removed at the Location write
boundary. These display choices do not rewrite canonical publication evidence or the
Feature's spatial membership index.

The Location save submits marker, authored content and subjective selections together
through its existing Organisation-authorized correction flow, with both the baseline and
Organisation revision captured when editing begins. Feature forms retain their own save
and adoption flow. Focused acceptance coverage lives in
`address-division-editor.test.ts`, `address-division-context.test.ts`,
`address-divisions-ui.test.ts` and the structured editor write case in
`location-services.test.ts`.

The Location record follows resource header navigation (Refs #194): **Profile** contains
record details, Address and Divisions; **Relationships** contains physical membership,
operating locations, address choices and lineage. The header's **Features** marker opens
a read-only standard Feature index. Its icon-only relationship selector defaults to
**Associated features**, with **Features placed here** and **Past accepted placements**
as alternatives; tooltips explain the three sets. These icons sit in the top-right
resource header immediately left of the filter toggle, without a separate relationship
bar. The community curation lock control sits beside Edit in the resource header and
remains SuperAdmin-only. Standard Feature search, filters, sorting and rows operate
within the selected relationship set on the server, including counts and pagination.
Private Location access and ordinary Feature authorization both apply. Relationship
counts bypass Feature-only revision caches so relationship changes cannot leave stale
totals. Profile and Relationships share the record editor and map; the Features view
owns its independent list controls. Known operating or building status appears after the
record type without a Lifecycle label; unknown status is omitted and `open` displays as
**Open**. Status remains editable in Profile. The multilingual control precedes the
coordinate widget. These presentation changes retain Location facts, relationship
history and Feature adoption semantics (Refs #194). Branch, Format and brand names use
the shared inline locale rows and follow the Profile's selected/visible languages and
multilingual expansion. Editing one language retains hidden translations and additional
source languages. Location kind, class, brand source and status selects use neutral
surfaces, with the same field and section hierarchy as the Address editor.

HYPE owns the permanent `location.id`. New Locations have opaque 12-character IDs using
HYPE's NanoID alphabet. Manual creation uses `nanoid(12)`; repeatable Breadline imports,
existing-Feature splits and initial source mirroring use the fixed versioned
SHA-256/base64url derivation in `id.server.ts`. Source namespaces are hash inputs, never
visible prefixes. Replaying against existing records retains their IDs, including legacy
prefixed IDs; a fresh import produces the new format. Accepted source identity changes
never recompute an existing HYPE ID.

Nullable `ssId` identifies the canonical SaanSeoi Place; do not assume this always
equals an Overture publisher ID. Source ID disappearance, proximity and matching brand
alone never justify rebinding an establishment. Accepted identity changes preserve the
HYPE ID and associations.

Location states:

- `linked`: identified SaanSeoi source, with immutable mirrored revisions.
- `unresolved`: a local baseline awaiting establishment matching.
- `manual`: an intentionally local Location, excluded from ordinary source matching.
- `redirect`: an absorbed identity that resolves to its surviving HYPE Location.

Source availability (`current`, `missing`, `review`) is independent of identity state.
Missing upstream data does not imply business closure, donor inactivity or deletion.
Manual and unresolved baselines have explicit local provenance.

`ownerOrganisationId` grants baseline authority, independently of visibility:

| State        | Baseline authority                      | Visibility                   | Organisation edits                                                           |
| ------------ | --------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `unresolved` | Owning Organisation                     | Shared across HYPE           | Owner advances the baseline; other Organisations keep their own corrections. |
| `manual`     | Owning Organisation                     | Private to that Organisation | Owner advances the baseline.                                                 |
| `linked`     | SaanSeoi synchronization; owner is null | Shared across HYPE           | Each Organisation keeps its own corrections.                                 |

Creation and physical-data correction require Organisation management authority. Project
roles do not grant upward authority. Project policies govern whether baseline and
Organisation correction changes are adopted automatically or held for review. A shared
Location grants no access to another Organisation's Features or private corrections.
Database guards restrict manual associations and Project/Feature moves. Matching
preserves the HYPE ID, clears local ownership, retains Organisation-authored corrections
and keeps subsequent canonical source snapshots free of local content.

## Storage: ten dedicated tables

Drizzle declarations put `createdAt` and the existing update timestamp (`updatedAt` or
`modifiedAt`) last. Migration 0138 also rebuilds these nine tables with timestamps
physically last; it does not reorder unrelated tables. Conditional insert projections
must follow the declared column order.

Migrations 0122–0125 consolidate the original twenty-table implementation. Migration
`0138_location_storage.sql` renames the nine lifecycle tables, columns, indexes and
guards to Location terminology. Migration `0139_organisation_location_corrections.sql`
adds one Organisation correction head per Location, preserving immutable snapshots in
its append-only `history` array. It migrates existing accepted corrections, failing on
conflicting corrections for the same Organisation/Location. No compatibility views or
generic registry are introduced.

| Table                      | Responsibility                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `location`                 | Stable HYPE identity, source ID, ownership, availability; absorbed identities retain `redirectTargetId` and the immutable redirect receipt.             |
| `locationRevision`         | Immutable source/local snapshots, normalized facts, content hash, API/release/snapshot references and provenance.                                       |
| `organisationLocation`     | Unique `(organisationId, locationId)` correction head, immutable revision snapshots, actor and timestamps.                                              |
| `featureLocation`          | Current association, accepted baseline revisions, `acceptedOverrides` cache, independently accepted Organisation revision tokens and concurrency token. |
| `featureLocationHistory`   | Actor-attributed link, reassociation, accepted baseline/correction snapshots and unlink history.                                                        |
| `locationIdentityHistory`  | Accepted source-identity transitions and their immutable review references.                                                                             |
| `locationIdentityReview`   | Retained establishment comparison, append-only merge impact versions, optional immutable rejection.                                                     |
| `locationAdoptionProposal` | Immutable source-change assessment plus independently written `factsDecision` and `locationDecision`.                                                   |
| `locationRefresh`          | Monthly publication checkpoint, current run, cursor, lease and retry state.                                                                             |
| `locationRefreshItem`      | Existing bounded work queue for source refresh and local baseline/Organisation changes; origin, correction scope, Feature cursor and durable outcomes.  |

Existing resources own their settings: `project.locationPolicy` and
`locationPolicyRevision` store Project policy; `feature.localLocationBrands` stores
unlinked brand corrections and their revision/actor. These are not separate resources.
Corrections live in `organisationLocation.overrides`, reusable across sibling Projects.
`featureLocation.acceptedOverrides` is only the accepted snapshot; it is not an
independently editable Feature override layer. The TypeScript property remains
`overrides` internally for resolver compatibility. Facts and position may accept
different correction revisions. Reviews/rejections include the Organisation revision in
their candidate identity, so independent Organisations and later edits do not share
decisions. Migration `0141_organisation_location_scope_guards.sql` fences accepted
correction tokens to their Organisation namespace and rejects cross-Organisation
Feature/Project moves until those corrections are explicitly reconciled. Sibling Project
moves remain valid. Local changes use the existing refresh work queue and adoption
proposal/decision lifecycle rather than a new task table.

A merge comparison can have multiple impact assessments if its association set changes
before acceptance. Their existing IDs, baselines, source revision, association token,
author and timestamp are retained in the owning identity review's `mergeReviews` array.
Prior entries cannot be replaced or removed. Rejection belongs to that comparison;
acceptance remains in identity history. The absorbed Place retains its redirect ID, old
source ID, review, actor, reason and timestamp. Redirect chains are resolved without
widening private ownership. Merges retain and copy non-overlapping Organisation
correction histories to the survivor; overlapping Organisation scopes require explicit
reconciliation before a merge, avoiding silent selection between two correction heads.

Four publisher-diagnostic tables and their scheduled collector are removed. Canonical
refresh already checks every associated source identity. Historical publisher pages
remain in the pre-migration backup; the standalone read-only source-change collector
remains available for investigation.

## Effective values and editing

Existing Feature columns are effective read projections, preserving public IDs, URLs,
spatial queries and existing consumers. Their authoritative inputs are the accepted
Location baseline and Organisation correction revisions. Mutations use the shared
resolver and atomic association/projection services.

Overrides use `inherit`, `override(value)` and `clear`. Missing override means inherit.
Locale fields resolve independently. Ordered arrays replace whole collections; an empty
array is explicit and never revives a legacy value. Equivalent values inherit when
linking; meaningful preserved differences seed the Organisation correction row. Later
links reuse that row rather than repeating fixes. Do not freeze every field as an
override and thereby prevent future updates.

Effective address baselines retain explicit complete labels in optional
`displayOverrides` keyed by content locale (Refs #194, parent #180). An empty string
suppresses display; absent keys retain normal structured composition. This preserves
explicit clears through linking and JSON round trips without erasing authored components
or canonical evidence. New Feature field corrections take precedence, and a reset
restores the retained baseline label.

`phoneNumber` remains the existing universal HYPE property. Scalars migrate to
one-element arrays; validation, editing and presentation support arrays. HK phone
normalization belongs to the HYPE projection. Mirror upstream values unchanged, and
surface invalid-phone omissions rather than silently erasing contacts.

Brands belong to Place facts and preserve source identifiers and localized names.
SaanSeoi currently exposes `identifiers.wikidata.brandId` and `brandName`; normalize
these into a one-element brand array. Organisation corrections can replace that array;
Features consume their accepted Organisation snapshot. Existing classifier values
survive as migration evidence/corrections, not as a second source of truth or an
Organisation ownership relationship.

Names, phones, brands and the atomic location group can be reset to inheritance.
Location comprises geometry and SaanSeoi address/unit references. Materialization
updates spatial membership and enqueues MTR recalculation only when geometry actually
changes; facts-only updates do not enqueue routing.

Unlinking retains effective columns and ordered brands, advances the Feature revision
and appends actor-attributed history in one batch. Detached brands save through the
regular Feature form with a revision guard. Relinking captures those values before
clearing the detached copy. Empty arrays remain meaningful. Initial linking,
reassociation, regular saves and draft publication are serialized against current
Feature and association tokens; late failures roll back relations, projections, history
and derived jobs together.

## Project policy and source adoption

`locationAdoptionProposal.evidence` retains the complete immutable assessment: `policy`,
`plan`, and optional `candidateOverrides`. Within the plan, `comparison` contains the
before/after positions and address/unit/establishment change flags. Historical plans
using the inner `evidence` key are normalized to `comparison` on review reads without
rewriting stored assessments. Decisions remain separate in `factsDecision` and
`locationDecision` (Refs #194).

Project **Advanced → Location Policies** saves with the regular Project form. Policy and
Project fields update atomically, guarded by both revisions. Six cards cover relocation,
coordinates, address, unit, establishment evidence and discovery radius. Radius is a
50–1,000 m slider in 50 m steps, displayed last. Loading renders six matching skeleton
cards. The distance limit appears only for distance-based coordinate acceptance.
Controls retain scenario-specific accessible names.

### Pre-release policy v1 and relocation settings (22 October 2026, Refs #194)

Canonical `project.locationPolicy` reads/writes use `version: 1`. Coordinate, address,
unit and establishment adoption use `follow` instead of `automatic`; coordinate
`review`/`withinDistance` behavior is unchanged. This feature set has not reached
production; revise the initial contract in place and carry any data conversion in the
current migration plan. No v2 contract or compatibility reader for superseded
unpublished vocabulary is required. The new `relocation` rule defaults to `review`,
including for absent/null policies. JSON `version` identifies the contract;
`locationPolicyRevision` remains the write fence.

Project **Advanced → Location Policies** groups relocation and upstream acceptance cards
with the discovery radius. The separate Project Locations tab is removed. It stores
`relocation: fixed | review | follow` in that same JSON. Layer **Advanced** stores a
nullable `relocationPolicy` override and independent `relocationPolicyRevision`; null
inherits the Project setting. Read settings through persisted ancestry and existing
Project/Layer management authorization. Project policy sections merge into one draft
without erasing each other's edits or rebasing stale heads. The regular Layer form
commits core fields and policy/counter in one guarded update. Saving/clearing a policy
does not replay Feature adoption or rejected candidates.

The additive SQL is numbered `migrations/0143_layer_relocation_policy.sql` in the
current migration plan. It must be installed before code reads the new Layer columns. No
primary or remote database is migrated by this implementation. The read-only-source
rehearsal is `scripts/locations/rehearse-location-policy.py`; it retains exact-ID plans,
before-images, all-table preservation hashes, integrity/FK results and no-op replay
receipts in an explicitly selected ignored local directory.

The setting contract and editors are implemented locally. The proposed occupancy,
address mirror and relocation adoption workflow remain separate work. The editor omits
the implementation-status notice; this does not activate relocation handling. Existing
ordinary adoption still uses its current evidence checks, independent groups and
rejection rules with the current v1 contract. Named dataset policies are not
bulk-applied by this settings change.

The v1 adjustment passes 280 focused Vitest cases across 11 files, 16 Bun Location
tests, the Location refresh Worker typecheck and scoped Biome checks. Prior Chromium
acceptance exercised the real Project/Layer controls on an isolated migrated copy: save,
reset/cancel, Layer inheritance/override/clear, Advanced deep links and combined Project
policy drafts. Light and dark panels were inspected; the acceptance run had no page
errors and left Features, Location revisions/corrections and binding history unchanged.
The read-only-source migration rehearsal preserved all existing values across 76 tables
and 12 Layers, with zero conflicts/FK violations, valid integrity and no-op replay. Full
application checking retains 10 unrelated errors and 19 warnings; no policy-path
diagnostics remain. The implementation is local and uncommitted.

The shared mirror advances independently of each Project's accepted data.
`featureLocation` accepts facts and location revisions independently. Two Projects can
therefore accept different snapshots without duplicating Place identities. Geometry and
address/unit references always advance together.

Proposals retain the policy/version, Feature timestamp, association token, source
before/candidate values, effective values and comparison evidence. Publication metadata
and unrelated unit rows are excluded from premises-change decisions. Missing identity
evidence holds adoption; unresolved Address dependencies hold location even under an
automatic policy. Invalid contacts cannot silently clear inherited numbers. Explicit
overrides survive every source update.

Each facts/location group has one final actor/reason decision across assessments of the
same Feature/Place/candidate. Repeated refresh reuses retained evidence. Explicit
pending re-evaluation appends an assessment without reopening accepted or rejected
groups. Evidence and completed decisions cannot be overwritten or deleted. Older
assessments remain readable within current authorized scope.

Automatic application requires the retained adopt outcome and unchanged policy. Reviewed
acceptance cannot bypass unavailable source evidence. Writes recheck current ancestry,
tokens, source availability/identity and latest assessment. Association/history,
effective fields, locales, phone values and the decision commit atomically. An unrelated
edit between group decisions requires reassessment. Evidence survives Feature deletion
but is not exposed without current scope.

The Feature editor provides bounded review discovery, source/effective comparisons,
separate facts/location decisions, required reasons and pending re-evaluation. Dirty
forms prevent acceptance. The panel survives first-group adoption so the second group
can still be decided. Client input cannot choose an authenticated actor, trusted source
payload or automatic-adoption mode.

## Addresses

SaanSeoi Addresses replace HYPE's structured address system. Mirror/reference canonical
Address identities and selected 2D/3D/unit snapshots and use the shared structured
formatter. Place, Address and Division dependencies must refer to compatible
publications. Do not reconstruct the retired HYPE address model.

Old freeform/structured values remain migration or curation evidence. A fallback display
string is not a resolved canonical Address. Feature address corrections select
Address/unit records; access notes and pickup instructions remain Project data. Both
unmatched local Places and matched Places with an `ssId` can retain locally authored
structured address content. Place identity and canonical Address resolution are
independent.

Match Place identity first. Parse and review the available address in HYPE using
SaanSeoi content fields, and retain that authored content on the HYPE Place even when
its SaanSeoi mirror has no canonical Address. Upstream address reconciliation and
publication follow later; they do not block matching or local address authoring. The
supported source-side workflow is in
[the Address curation hand-off](places-address-curation.md). HYPE edits never silently
write upstream; a HYPE submission API is a separate extension.

## Monthly refresh

The Place refresh Worker follows the monthly DivisionSync pattern with bounded steps,
pinned publication evidence, exclusive leases, retries and fenced writes. New runs
capture source-linked Places with associated Features and request each ID through the
acknowledged, publication-pinned canonical `filter[id]` collection contract. Historical
in-flight catalogue runs retain their mode and cursor.

Publication comparison uses catalogue timestamps, cohort/revision and canonical release
identity; local ingestion sequence is not proof of source chronology. Same-cohort
forward curation can advance. Older or conflicting publications require review.
Transport pagination links are excluded from canonical content hashes. Pinned Address
hydration is retained with each source revision.

Each item ingests forward evidence, then assesses associated Features in stable order.
Its Feature outcome and cursor commit in one fenced update. Existing outcomes survive
replay. Publication completion requires applied or durable review outcomes for all work;
it never means every Feature accepted the new revision. Missing IDs retain accepted
Feature values. Idle replay makes no writes.

Only the canonical pipeline runs on the scheduler. Publisher-source comparisons are an
optional read-only diagnostic, not an additional adoption dependency:

```sh
bun --env-file=.dev.vars scripts/locations/collect-source-changes.ts FROM_RELEASE TO_RELEASE RECEIPT_NAME [PAGES_PER_RUN]
```

This follows `/places/v0.1/sources/changes` pins and cursors, retaining private pages
and hashes under `.local/places/`. Publisher changes do not cover all canonical
reconciliation, translation, Address or curation changes and cannot replace the pinned
canonical refresh. Worker deployment/secrets are a separate release action.

## Existing Features and Breadline

Preserve Feature identities, media, permissions, histories and relationships. Match
establishments using multilingual names, coordinates, contacts and unit identity; nearby
buildings or matching brands alone are insufficient. Retain rejected candidates, and
require deliberate review to accept an identity or merge. Unmatched Features become
unresolved Places with provenance-marked local baselines. Intentional manual status is
reserved for deliberate decisions.

Breadline import eligibility is **recorded runs**, not current schedules: the reviewed
export contains 311 eligible donors and 19 dropoffs, with 155 donors excluded. Schedules
constrained MTR review only. Donor `active` describes participation, not establishment
operating status. Pickup windows/runs belong to Features/events, never invented business
opening hours.

Preserve all 64 reviewed MTR choices as Feature access decisions; collection access can
differ from a Place's nearest general entrance. #558 and #727 retain their accepted exit
labels without invented entrance mappings. Donor #4's reviewed Fitfort identity
preserves its HYPE Place ID and redirects the absorbed mirror.

Use the [migration runbook](places-migration-runbook.md) for export-to-import rehearsal,
guarded split execution, source mirroring, identity review and monthly refresh. Forward
schema migrations preserve data; historical migrations remain unchanged. The
simplification rehearsal checks every retained column, every moved record, foreign keys,
integrity and the absence of compatibility views before local application. Populated
fixtures also cover pending/applied/rejected reviews, multiple merge assessments,
detached empty arrays and in-flight refresh outcomes.

Source identity/Address curation, schedule import and production rollout remain explicit
delivery work in GitHub. This document defines behavior and architecture; GitHub issues
contain current acceptance and release evidence.

## Locally authored structured addresses

Local Place creation and address editing use the SaanSeoi address **content** contract:
`address2d` component names, granularity and relationships; `address2dI18n` component
values; and `Address3dUnit` / `Address3dUnitI18n` semantics. HYPE stores these under
`PlaceFacts.location.address.authored`. Geometry at the Place level remains its
location; optional authored address geometry can describe the premises separately.
Address content is distinct from publication envelopes: HYPE does not invent SaanSeoi
address IDs, inventory IDs, snapshot IDs, dataset codes or publisher metadata. A local
Place remains manual/unresolved even when its address is fully structured.

The shared content/type contract is in SaanSeoi `libs/address/src/content.ts`, consumed
by both repositories through `@saanseoi/address`. HYPE retains compatibility exports in
`src/lib/addresses/localPlaceAddress.ts`. Unit/floor codes and block types are
validated; locale expressions and explicit null/false values survive. The local editor
supports multilingual address components, unit/floor semantics and exact locale
expressions. Shared unit content belongs to the Place; Feature-only corrections and
access hints remain independent. Editing a Place requires its Organisation's management
authority.

Edits append immutable `locationRevision` rows with actor, owner and predecessor
evidence; the insert fences both current owner and latest revision. Existing linked
Features keep their accepted revisions. The Feature review command prepares the newer
local revision for explicit adoption through the ordinary review flow, preserving
accepted Organisation corrections. Local-to-local changes do not require fabricated
publisher identity evidence; crossing between local and SaanSeoi source identity still
requires the identity review workflow.

Previously stored fallback-only local addresses remain readable and are converted into
structured editor content when opened. No historical revision is rewritten and no new
SQL table or destructive backfill is required. Saving performs the explicit upgrade.
This is local authoring, not an upstream curation/publishing endpoint.

Validation: `bun scripts/locations/verify-address-contract.ts ../saanseoi` compares the
current sibling repository's canonical content keys and all four enum vocabularies.
Focused tests cover multilingual round trips, invalid types/publication claims,
immutable edits, stale-owner/revision fences, local review and accepted Organisation
corrections. Chromium verified saving structured components and unit details, reloading
them from an isolated local database, and rendering the resulting address without page
errors.

## Address scope vocabulary

Address scope uses `unit` for separately identified units, including rooms, and
`unit_portion` for a portion of a unit. The unit-type code `R` still means Room;
classification of unit type is independent of address scope. Block descriptors preserve
the source component: `flat`, `unit` and `apartment` are observed source values, not an
assertion that the component describes an entire building.

## Proposed Feature Tasks presentation

A Feature's **Tasks** tab shows a count of actionable items. Its initial tasks are:

- **Resolve Place match**: an unresolved local Place has candidate identities.
- **Review updated Place address**: a newer local or SaanSeoi revision needs adoption.
- **Complete structured address**: the selected Place lacks usable canonical address
  content or required floor/unit information.

Each task opens a current/proposed comparison using the actual Feature display
formatter, with language switching, map positions, source/revision provenance and an
expandable component difference. The review explicitly calls out removed unit
information, blank translations, coordinate displacement and retained overrides. Actions
are **Accept update**, **Keep current** and **Edit Organisation correction**. Place
matching additionally offers **Choose another Place** and **No suitable match**. A
decision resolves the task for that candidate/revision; new evidence can create a new
task. Simply opening a task never adopts a revision.

Tasks should be a presentation of existing identity/adoption review state, with stable
keys derived from Feature, review kind and candidate revision. Do not add a second task
lifecycle/table that can disagree with review decisions. Organisation permissions still
control editing a Place; Feature permissions control adoption. The Feature Updates tab
and Review Queue share source-backed task rows for adoption, identity and merge reviews,
with counts and an explicit latest-local review action in Updates (see the 29 October
separation below). Richer component comparisons remain UI follow-up work; they do not
require another persistence model.

### Location tasks in the shared Review Queue (22 October 2026, Refs #194)

The Feature facet is labelled **Location**; existing `address` navigation keys and deep
links remain stable. The Tasks disclosure (moved to Updates on 29 October) and the
existing Review Queue now consume the same `getTasks` API and `TaskRow` component. An
empty Location task list produces no disclosure. Identity search and explicit
preparation of a latest-local review now live in Updates, as described below.

The shared queue includes `locationFacts`, `locationPosition`, `locationIdentity` and
`locationMerge` alongside contribution tasks. A read-only SQL projection derives pending
rows from retained adoption/identity evidence and current associations. Group decisions,
accepted snapshots, rejection, current identity baselines and source occupancy determine
relevance; there is no second persisted task lifecycle. Adoption task IDs survive
reassessment. Repeated identity captures with identical baseline and source evidence
expose only the latest retained review, including its rejection; different candidates
and new evidence remain separate. Existing permission/prism filters, counts, sorting and
pagination apply to the combined set before bounded relation hydration. Identity and
merge rows additionally require Location ownership/core authority.

Location rows use ordinary `/admin/tasks/[task]` detail routes. Facts and position
reviews open their exact proposal and field group; identity and merge tasks open the
retained identity comparison/merge impact. Existing source review APIs enforce notes,
authority and concurrency. Contribution review commands reject Location task IDs. Source
decisions invalidate the queue and remove resolved pending entries.

Development-only `locationTaskPreview=all&previewFeatureId=<featureId>` adds four
clearly marked mock rows through this same API, row, filter and detail machinery. The
Feature Location editor can request the same fixtures with `locationTaskPreview`. Mock
decisions require a note but remain browser-only; no task/proposal/source record is
inserted. The production source-review projection does not depend on this fixture flag.
Structured-address completion remains a separate future task design.

## Feature Address presentation

The Address facet keeps the map and action bar fixed above an independently scrolling
results/address region. The four discovery actions share the coordinate control’s quiet
bordered styling and sit beside it in one toolbar row. At narrower content widths,
actions retain accessible names and tooltips while showing their icons. The radius
slider sits at the top right of the map; coverage warnings precede the results. Read
mode shows the linked Place or an explicit No Place associated state with a
struck-through shop icon; editing hides this empty placeholder to leave room for
discovery actions. An unlinked editable Feature offers Show Nearby Addresses, Show
Nearby Places, Find a Place and Create Place. The Project Places tab configures a
default radius (300 m when absent, adjustable from 50–1,000 m); the regular Project form
owns saving it. Each discovery can override the radius without changing Project
settings.

Search results appear directly below the map as keyed FLIP rows. Local and canonical
previews share stable row/marker numbers, preferred-language names and display
addresses, and great-circle distance from the Feature pin (not walking distance).
Hovering or keyboard-focusing a result highlights its existing numbered marker without
selecting, importing, moving the camera, or recreating marker elements. Selecting a
marker selects its row. Canonical preview details are read-only; explicit
selection/import and the existing confirmation step still precede association.
Unavailable preview details remain an explicit partial-search error above the results.
Discovery reads latest-source details with exact ID/release checks; these previews are
never canonical import evidence. Import/linking still requires publication-pinned
verification.

Create Place geocodes the current display address and replaces the result area with an
editable structured address proposal. A unique resolved response seeds components;
multiple or ambiguous candidates require selection. Existing unit details are retained.
A failed lookup keeps the original text and local parser proposal, with an explicit
error. Creating a local Place and linking it remain separate steps. A dirty Feature may
prepare/create a Place, but must be saved before confirming its association.

Nearby Address discovery uses the reverse geocoder with each Address's actual geometry;
selecting a result does not move the Feature pin or save Feature values. Nearby Place
search covers all intersecting resolution-nine H3 cells, paginates with a bounded
budget, filters exact great-circle distances and resolves ID/release-checked preview
facts before display. Scoped Organisation-local Places are included. Results rank by
proximity and multilingual address agreement, weighting building, street, building
number and unit evidence above freeform text. Missing addresses contribute no penalty.
Pagination, the fifty-source- preview limit and partial failures are explicit; an
incomplete search never silently becomes a verified absence. A changed pin/radius or
cancellation invalidates late results.

Create Place first searches nearby Places and the Feature name, then offers up to five
plausible matches. Identity selection remains explicit: a shared building address alone
is not proof of the same shop. With no matches from a complete search, the local
creation form opens directly. Partial/limited searches require an explicit Create
without a verified match action. A selected Address seeds the structured proposal,
retaining the Feature's unit evidence. Choosing an existing Place retains the prepared
address as a Feature draft after association; the normal Feature Save persists that
correction.

After successful Feature creation, hydrate the saved record and replace
`/admin/features/new` with its persisted ID through shallow navigation. Retain the
current facet, query parameters, focus and scroll without adding a history entry or
resetting the editor. Clear the draft discovery undo marker; subsequent saves update the
persisted Feature. Shared save confirmations begin their toast lifetime after post-save
linking, refresh and navigation, retaining the original confirmation time. Regression
coverage: `src/tests/feature-create-navigation.test.ts` and
`src/tests/feature-profile-navigation.test.ts`. An authenticated creation check remains
separate from the browser fixture for shallow navigation and toast persistence.

Local creation requires Create & allow sharing or Create privately. Both preserve
Organisation ownership and the independent manual/unresolved distinction. The default is
unresolved; intentional manual status remains an explicit choice. Sharing consent is
stored in the immutable local-baseline payload (`input.sharingPreference`) with its
author and revision timestamp. It is permission for future reconciliation, not public
visibility or an upstream submission. Older payloads without a preference imply no
sharing permission. No new table or schema migration is required. Upstream submission
and receipt-driven reconciliation remain deferred under #233.

Place settings and Tasks remain secondary disclosures. The next review should settle
shared Place-address editing versus Feature-only corrections/access directions, and the
dedicated Tasks presentation. No new persistence tables are needed for this UI.

## Display-first address migration plan

1. Rehearse against sealed HYPE/Breadline exports, retain import exclusions and accepted
   MTR decisions, and preserve the original multilingual display strings.
2. Produce a per-Feature/per-language preview: existing display, structured-local
   display, candidate Place, candidate canonical address, coordinate distance and
   missing floor/unit/translation warnings. `preview-address-migration.ts` uses the same
   formatter as the app; candidate 2D labels remain unaccepted evidence.
3. Compare names, location, branch/unit and contact evidence against one pinned SaanSeoi
   publication. Proximity and chain-name matches alone cannot accept an identity. Keep
   unresolved Places where evidence is insufficient.
4. Resolve identities independently of canonical Address availability. Parse and review
   the available text into SaanSeoi content fields locally, retaining the authored
   address on the HYPE Place alongside its `ssId`. Defer upstream Address
   creation/association to the reconciliation workflow in #233.
5. Review the resulting **effective Feature display**, including retained overrides,
   before adopting each canonical address. Missing source translations never silently
   erase existing Feature text; a missing unit must be preserved or explicitly resolved.
6. For unmatched Places, append a local revision using the same authored content schema,
   initially retaining the exact display under localized `formattedAddress`. Mark these
   unresolved, not intentionally manual. Convert active Feature address state to that
   schema after preview acceptance; retain original data as historical provenance, not
   as a second editable address system.
7. Verify every accepted display and coordinate change, preserve explicit clearing and
   Feature overrides, and replay the migration to prove idempotence. Retire active
   legacy reads only after no active Feature depends on them.

Structured-local conversion is a schema upgrade, not proof that a freeform address has
been parsed or verified. Candidate matching and the preview do not authorize mass
canonical adoption or manufacture missing structured components.

## Matched Places with locally authored addresses

Accepted architecture; reconciliation is tracked in
[#233](https://github.com/tijptjik/hype/issues/233), parent #180.

A matched Place retains its HYPE ID and `ssId` independently of its address source. An
absent SaanSeoi Address does not prevent an identity match or force the Location to
remain unresolved. The address can remain locally authored while the Location is linked.
That authored address lives in the Organisation correction row, separate from immutable
source evidence. Sibling Projects reuse it; other Organisations maintain independent
corrections. There is no additional Feature-authored correction layer. Organisation
managers author corrections using baseline and correction-head concurrency fences. A
linked baseline can only advance through SaanSeoi synchronization.

Until reconciliation succeeds, incomplete or missing source addresses cannot erase
Organisation-authored content. A new source address is a candidate for comparison, not
permission to discard corrections. Effective Feature display resolves its accepted
baseline plus accepted Organisation corrections, preserving explicit clearing.

The shared parser lives in SaanSeoi `libs/address` as `@saanseoi/address`, extracted
from the existing Harbour Place address parser. It exports shared address content
types/validation, parsing and formatting. Keep DB/API access and publication outside the
package; inject optional street/building lookup dictionaries. Return recognised
components, unresolved fragments and diagnostics, retaining the source text, parser
version and review provenance. Preserve the exact display until a proposed generated
display has been accepted. Canonical IDs must come from matching, not from parsing.

Both repositories consume explicit package versions, with shared multilingual regression
fixtures. Parser improvements become available through dependency updates; reruns
generate reviewable proposals rather than changing accepted content silently. Extract
the existing tested parser instead of starting a second parser in HYPE. SaanSeoi uses a
workspace dependency; HYPE pins the packaged 0.1.0 artifact in `vendor/`. No registry
publication is required or has been performed.

New imports and Feature splits retain original display strings and parse structured
Place content. Parser review in the editor compares the actual before/after display
before accepting components. Unknown building/street text stays unresolved without
lookup dictionaries; conflicting units remain visible in the original display.

Source refresh and identity promotion retain authored address content and its
provenance, keeping incoming canonical address evidence separately in
`payload.sourceAddress`. A new canonical address never automatically retires the local
content. Local edits on matched Places remain eligible for Feature adoption. The
obsolete one-time granularity repair scripts and deployment instructions have been
removed; the corrected `unit`/`unit_portion` vocabulary remains.

Later, an authorised reconciliation finds/reuses an equivalent SaanSeoi Address or
submits HYPE's reviewed components when none exists, then associates that Address with
the matched Place. Store an idempotent receipt tied to the submitted local revision.
Only a subsequent compatible sync confirming the expected association and content can
retire the redundant Place overlay. A newer local edit, changed unit or differing
display returns to review; independent Organisation corrections survive.

Discovery compatibility note (21 October 2026, Refs #233): the deployed SaanSeoi
canonical collection currently ignores `filter[id]`, returning the unfiltered page. HYPE
deliberately rejects this for import/linking. Latest-source preview requests use
`/places/v0.1/{id}` and validate the returned ID and resource release, allowing
discovery to function independently. Canonical exact-ID lookup remains a
source-deployment dependency; it must not be bypassed by persisting preview facts.

Initial import revision IDs now use a versioned opaque twelve-character derivation, like
Place IDs. Old imported identities are retained on replay; exports do not rename
existing local records. A clean import emits opaque Place and baseline IDs.

## Proposal: shared Locations beyond Overture Places

Research date: 21 October 2026 HKT. Refs
[#180](https://github.com/tijptjik/hype/issues/180) and
[SaanSeoi #68](https://github.com/tijptjik/saanseoi/issues/68). This section records a
proposal, not an approved schema change or implemented Buildings API.

### Reviewed data and limits

The latest retained SaanSeoi Hong Kong building extract was `2026-09-23.0`. Review also
downloaded the published `2026-09-23.1` building and building-part data from Overture's
public storage, using schema v2.0.0. To compare the same coverage, the latest building
rows were restricted to the retained Hong Kong building IDs; parts were matched by
retained parent ID and geometry. All 204,207 buildings were found with unchanged
content, excluding implicit partition columns. All 2,982 corresponding parts were found,
with none retaining its previous ID. Overture's September patch explicitly repairs
building-part and base UUIDs. A district-union intersection would exclude 27 boundary
buildings from the retained clipSmart scope; the review does not silently change that
scope.

The private local research bundle is `.local/research/buildings-20261021/`. Its latest
extract receipt records scope, hashes and comparison results. The bounding-box downloads
also include records outside Hong Kong and must not be counted as Hong Kong inventory.

Measured building coverage in that scope:

| Attribute                | Populated records |  Share |
| ------------------------ | ----------------: | -----: |
| Name                     |            35,263 | 17.27% |
| Explicit height          |             1,908 |  0.93% |
| Above-ground floor count |            56,650 | 27.74% |
| Broad subtype            |            86,185 | 42.20% |
| Detailed class           |            85,170 | 41.71% |

Sources are OpenStreetMap (118,834 buildings) and `doi:10.5281/zenodo.8174931` (85,373).
Building parts belong to 1,254 parent buildings. The
[Building schema](https://docs.overturemaps.org/schema/reference/buildings/building/)
provides polygon/multipolygon geometry, names, current-use classifications, vertical
measurements and optional roof/facade properties. The
[BuildingPart schema](https://docs.overturemaps.org/schema/reference/buildings/building_part/)
provides parent IDs and constituent geometry; a part is not a shop or unit inventory.
The reviewed building payload has no structured address or Place-membership field. See
the [patch release notes](https://docs.overturemaps.org/blog/2026/09/23/release-notes/).

The
[LandsD Building dataset](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1637211194312_35158)
was checked against its live FeatureServer and published schema statistics, revision 21
September 2026. It contains 342,195 active polygon records. These include towers,
podiums, open-sided structures and temporary structures, so the count is not directly
comparable with Overture buildings or proof of an Overture omission rate. It updates
monthly. The schema reports 64,665 English names, 64,220 Traditional Chinese names,
235,946 base elevations, 237,348 top elevations and 59,308 storey counts. It supplies
`BuildingCSUID` and iB1000 `BuildingID`; `GeoRefNo` is not unique in this release.
`OBJECTID` is a service row identifier. The associated tables supply alternate names,
works history, occupation permit structure links, permit dates/GFA and lot information.
The
[field dictionary](https://static.csdi.gov.hk/csdi-webpage/view/common/fcfd7619367e765fed971fbd1dde8ff7cee49d3fda1fdfce56e5b95deaa3ac05)
defines base/top as elevations above Hong Kong Principal Datum, not building heights. Do
not assign `TopHeight` directly to Overture `height`; retain vertical datum and derive
height only from compatible base/top measurements.

Other useful government sources:

- [ALS](https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf): bilingual
  structured frontage addresses, GeoAddress/CSU evidence, and limited floor/unit data.
  One building can have several frontage addresses; address identity remains separate.
- [Buildings Department building information and age records](https://data.gov.hk/en-data/dataset/hk-bd-opendata-building-information):
  annual private-building address/type/use/block and occupation-permit enrichment. It is
  not a territory-wide footprint replacement.
- [3D visualisation and 3D-BIT00](https://www.landsd.gov.hk/en/survey-mapping/mapping/3d-mapping.html):
  richer exterior models for visualisation; do not substitute mesh/tile IDs for entity
  IDs.
- [3D Indoor Map](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1671437329821_60808)
  and
  [Indoor Network](https://portal.csdi.gov.hk/csdi-webpage/dataset/landsd_rcd_1742809197336_78665):
  selected venues' floors, units, openings/occupants and indoor/outdoor connectivity.
  These can eventually support entrance selection; coverage is not every building.

A bounded screenshot-area check found Overture's New Lucky House footprint at the
current Toho Hotel pin. LandsD's corresponding named tower has 18 storeys and base/top
values 7.5/57.6 m HKPD, but its footprint leaves that pin just outside. This is
candidate evidence, not confirmation that the hotel occupies the building, and
demonstrates why containment/proximity must not establish identity automatically.

LandsD and Overture Buildings remain strictly separate inventories, with separate
release histories, geometry and source identities. Comparison can propose an explicit
cross-inventory relationship; it must never merge the inventories or publish a
deduplicated combined inventory. Preserve vertical datums and the applicable
[source attribution](https://docs.overturemaps.org/attribution/). ALS frontage links
remain separate evidence-backed associations.

The September 2026 comparison covers 342,195 LandsD footprints and 204,207 Overture
footprints in the retained Hong Kong scope. Of LandsD records, 10.27% have more than 99%
of their area covered by an Overture footprint; 3.82% also exceed 99% in the inverse
direction. The remaining 6.46% are partial containment matches. Unique mutual candidates
account for 3.64%; geometry alone does not establish physical identity or assign GERS
IDs. Preparation, preview benchmarks and Harbour review are tracked in
[SaanSeoi #68](https://github.com/saanseoi/saanseoi/issues/68).

### Shared identity and inheritance

Use **Location** in the UI and a shared typed entity internally. Generalize the existing
Place lifecycle/revisions/association machinery instead of introducing a parallel set of
Building tables in HYPE. The existing organisation ownership, local manual/unresolved
states, authored addresses, review history and Project adoption policies remain useful.

- A shared entity has an opaque HYPE ID, an explicit kind (establishment, building,
  natural feature, site or unresolved), geometry and zero or more address references. An
  address is optional; several frontages can belong to the same building.
- Source references are typed: source/provider, resource family and source ID, with
  version/release evidence. An unqualified `ssId` is insufficient once several families
  participate. SaanSeoi owns reviewed relationships between its separate LandsD and
  Overture inventories; HYPE references the selected inventory's identity and retains
  its own ID. A partial footprint relationship is not an identity alias.
- A Feature has one primary entity association governing inheritance, with a real FK.
  Additional contextual relationships must have explicit roles and never compete to
  supply Feature fields. A business can be located in a building; it is not the
  building.
- Keep address selection separate from entity selection. Selecting an address alone
  updates the address or suggests a verified related entity; it does not manufacture an
  establishment identity. Keep coordinates-only Features valid.
- Entity content needs typed schemas and raw source payloads: shared names/geometry/
  addresses, establishment-specific phones/brands, building-specific details, and
  natural-feature-specific facts. The current point-only `PlaceLocation` is
  insufficient.
- Preserve a Feature's map/routing anchor separately from the entity polygon. A building
  centroid, roof outline, frontage or nearest boundary is not proof of an entrance. MTR
  routing continues to use the chosen access/pin location. Project adoption policy
  should distinguish anchor changes, boundary changes, address changes and identity
  changes.
- Locally authored addresses remain until equivalent source content is published and
  accepted, as in the current Place reconciliation design. A Building match alone must
  not discard that content or assume floor/unit inventory from a floor count.

Migration should preserve IDs, histories, revisions and overrides while widening the
model. Existing canonical Place matches can be typed as establishments where supported;
unresolved records must not all be relabelled as businesses. Building parts need
explicit source/parent treatment in SaanSeoi; do not expose every roof segment as a
standalone Location by default. No additional universal relationship/ontology engine is
proposed.

### One discovery flow

Replace the separate nearby actions with **Find Nearby**, alongside text search,
**Create Location**, and a **Types** dropdown. Offer Places, Buildings and Addresses
initially, with supported natural features added later. Project settings own defaults;
temporary filters should not silently save Project settings. Unsupported families should
be identified as unavailable instead of appearing as a successful empty search.

Use one result list and map, with a type icon, textual badge and distinct theme-aware
colour. Show building polygons as well as labelled markers. Hover/focus highlights the
whole corresponding geometry. Names, preferred-locale addresses and distance stay in the
list; addresses without a linked entity remain clearly address results.

Rank using compatible evidence across types: text/address agreement, verified links,
footprint containment and distance to geometry. Do not rank buildings by centroid
distance or allow every unnamed footprint/broad natural polygon to displace relevant
establishments. Use bounded per-type retrieval and a calibrated combined ranking. Dedupe
source representations only through established identity mappings; keep
business/building/frontage distinctions, grouping related results where the relationship
is known. A containing-building badge is useful evidence and not an automatic
association.

Suggested sequence: agree this model; implement SaanSeoi #68 with LandsD/Overture
sources and address links; generalize HYPE's existing model and adapters; unify
discovery; then extend to supported natural-feature families. A unified discovery
endpoint can normalize presentation while retaining source-specific contracts behind the
API.

### First HYPE Location slice (21 October 2026, Refs #194)

The shared concept is now **Location** in the HYPE interface. **Establishment** is
HYPE's label for the currently supported SaanSeoi Places adapter, not a literal Overture
category: Overture's official theme/type remains `places/place`, covering businesses,
facilities, services and amenities. Preserve that vocabulary in source contracts and
attribution.

Migration `0137_location_kinds.sql` adds `kind` to the existing shared identity.
Canonical Places and evidence-backed Breadline donor imports become establishments;
unclassified legacy Feature baselines and drop-points stay `unknown`. New local creation
is explicitly establishment-only; Building/Natural feature input is rejected. Source
ingestion and reviewed identity promotion/merge set the established kind. Application
projections qualify source identity as `{ provider: 'saanseoi', family: 'places', id }`.
IDs, revision history and Feature overrides remain unchanged.

Migration `0138_location_storage.sql` completes the storage rename: `location` and
`featureLocation` replace the old Place table names, local foreign keys use
`locationId`, and routes/services/scripts use Locations. The same nine-table lifecycle
is reused, with no compatibility aliases. Local audit receipts and nested baselines are
migrated; raw upstream payloads and source projections are preserved byte-for-byte.
Stable ID hash namespaces remain unchanged to prevent identity churn. Building and
natural adapters, parent entity relationships, polygon geometry, multi-family source
uniqueness and multiple address selection are still future work. Enabling another family
requires implementing those contracts; unavailable UI choices must not be enabled by
changing a flag alone.

Discovery now combines Establishments and Addresses behind **Find Nearby**, with
session-local **Types** checkboxes. Buildings and Natural features are disabled with an
explicit unavailable explanation. The existing Project radius remains the default;
changing search types does not save Project policy. Source results, private local
identities and addresses retain their distinct IDs. Unclassified local baselines remain
reusable and are labelled honestly. Text lookup and new establishment creation remain
available, with pre-creation duplicate suggestions independent of the nearby type
filter.

Results and map markers distinguish address candidates with an amber colour; text
badges/icons make the distinction independent of colour. Hover/focus highlights the
matching marker. The existing fixed map/control bar and independently scrolling results
remain. Search reports partial/truncated coverage, including when one selected family
fails. For an existing saved Feature, address-only selection stages the address through
the regular Feature form; it neither creates an establishment, changes the existing
association, nor moves the Feature's map/routing pin. New Feature drafts additionally
schedule the address-kind association described above. Saving/Canceling remains the
parent Feature form's responsibility.

#### Address identity versus retained address content

Do not add a new HYPE address master table for this slice. HYPE already retains
canonical SaanSeoi address identities and publication-pinned structured content in
Location revisions, with locally authored content when a canonical address is
unavailable. Multiple Features share those revisions through their Location association;
they do not need independently editable copies of the same address master.

Addresses are not assumed immutable or reduced to display strings. Corrections, renamed
buildings/streets, multiple frontages, floor/unit identity and different access points
matter to reconciliation and review. Display/formatted addresses are projections;
structured components and source provenance remain necessary. Division filtering uses
`featureDivisionMembership`, maintained independently, and is not an address identity.

Cities are not part of HYPE's address model (Refs #194). Feature and Location division
overrides do not accept `cityId`, matching the shared authored address contract. Address
memberships, locality choices and displayed divisions exclude the upstream `city` class.
Retained SaanSeoi source records and the generic division mirror may preserve that
classification as source evidence; they do not make it an address field or an editable
address role. Districts such as Kowloon City District remain districts and are
unaffected.

The address division display separates administration, locality memberships and islands
(Refs #194). Source paths use the independent `hierarchies.administrative`, `.locality`
and `.landform` ancestry, preserving alternatives. Full containment supports source
connections; levels, shared names and polygon overlap alone do not establish ancestry. A
mirrored island group may be shown through a fully contained island’s landform ancestry
even without its own polygon. Missing source hierarchy metadata leaves memberships
unconnected.

Locality editing selects **one existing neighbourhood**, at any supported locality
level, with one of its supplied source ancestor paths. A unique path fills
automatically. Boundary cases such as Prince Edward prompt for one complete source
branch, retaining a standalone branch when the source explicitly provides it. The editor
cannot add children, combine unrelated parents, choose arbitrary levels, or create new
hierarchy edges. Administration and islands remain marker-derived.

`divisionOverrides.localityPaths` stores at most one selected root-to-leaf source path;
an empty selection omits localities and null returns to marker membership. The server
verifies the complete path against the selected division's mirrored ancestry, rejecting
additional paths, invented parents and skipped ancestors even when their levels would
otherwise fit. The choice travels through Feature/Location save and immutable revision
JSON without changing SaanSeoi taxonomy or geometry. Read-only display omits locks and
editing controls. The marker/locality explanation is shown in the existing info tooltip
at the right of the Divisions title.

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
remains outside this slice. Full application type-check reports ten unrelated errors and
nineteen warnings; no changed Location file is among those diagnostics.

### Deterministic Location kind seed

Refs [#194](https://github.com/tijptjik/hype/issues/194). The
[guarded dataset kind seed](../../../scripts/locations/seed-location-kinds.md) resolves
persisted ancestry for Ghost Signs buildings, ELN venue establishments, Independent
Bookstores and Breadline donors. It inventories archives, shared identities and
unassociated Features, excludes Neon/dropoffs, and authors only unknown owner-controlled
local kinds using immutable type-change provenance. Contradictory/source-linked
identities and mixed dataset requirements require review; accepted Feature projections
and Organisation corrections are preserved.

The populated local-copy rehearsal covers 995 Features and 913 associated Locations: 601
eligible changes, 312 already-correct kinds and 82 unassociated Features retained as
unresolved assertions. Exact-plan replay, stale rejection, source/shared conflicts,
foreign keys and compensating rollback were verified. Normal baseline triggers retain
their refresh queue evidence. Agent 7 assigns the unnumbered data plan after contract
integration; regenerate against the final schema and target snapshot. No primary-local
or remote application is implied.

### Description-derived image capture metadata (21 October 2026)

Refs [#194](https://github.com/tijptjik/hype/issues/194) and existing image-date issue
[#88](https://github.com/tijptjik/hype/issues/88). Capture annotations belong to
per-image R2 metadata documents, independently of Location facts, Feature lifecycle,
upload time and EXIF capture instants. The optional `capture` contract preserves
date/time precision, intervals, approximation and original wording; full metadata
retains source-description revisions and frozen gallery evidence. No database column or
migration is needed. The conservative planner, staged applier ports, private
inventory/rehearsal commands and integration obligations are documented in
[capture extraction](../../../scripts/images/README.md).

Current gallery intent/creation-time ordering is not evidence of historical ordinal
references. Unverified order, missing metadata and contradictory shared image assertions
remain unresolved. Description cleanup requires verified metadata writes, successful
invalidation and a fenced transaction across every affected locale of the Feature. The
concrete shipped adapter rehearses JSON copies only; reviewed environment-specific D1/R2
activation, active-writer fencing and application/restore acceptance remain integration
dependencies. No remote rollout is implied and broad issue acceptance remains open.

The Feature viewer mounts a Bits UI attribution popover on its shared image rail, so
full and description-free cards use the same control. Photograph credit and capture date
are separate from Feature contributor/creation date and image upload date. Unknown
capture dates stay unknown; upload time is never a capture fallback. Authored capture
ranges and approximate dates retain their supplied precision. The public basic metadata
projection supplies camera and dimensions when available; full source annotations are
not exposed by this UI. Requests are lazy and share the gallery's metadata cache, with
stale contributor responses discarded when the selected image or Feature changes.

ELN venue names are corrected independently of literary Feature titles. The
[review catalogue and local-only runner](../../../scripts/eln/venue-names.md) document
the exact scope, first-party Traditional Chinese names and guarded name-only
application. Existing accepted Feature revisions are retained for the ordinary adoption
flow; a venue name correction does not rename a book or move an event to a successor
tenant.

### Minimal operating state and retained history (Refs #194)

Location facts use SaanSeoi/Overture's `operatingStatus` directly: `open`,
`temporarily_closed`, or `permanently_closed`. Missing/null means unknown; missing
upstream inventory never implies closure. Buildings use a separate `buildingStatus`
(`standing` or `demolished`) because physical condition is not business operation. These
optional facts live in existing immutable revision JSON and Organisation corrections,
with the usual baseline/correction revision fences. No additional SQL migration,
evidence assertion table, confidence field or verification-date system is needed. Raw
source payloads remain untouched. Status changes require explicit Feature adoption
review, including when ordinary adoption policy is automatic.

The Feature's `isIntangible` and `isVisitable` remain independent of its Location: a
removed sign can be intangible while its business is open; `isVisitable=false` means the
Feature cannot currently be visited and does not prove that its business is permanently
closed. The persisted field is `isVisitable`, not `isAccessible`. A temporary business
closure belongs in `operatingStatus`; changing visitability is a separate author
decision. No separate sign lifecycle model is introduced.

Prior names and addresses stay dated by their existing immutable revisions instead of
being copied to a second history system. One optional `successorLocationId` links a
relocated branch or successor explicitly, without moving old geometry, merging
identities or rewriting associated Features. It must name a visible, non-redirect
Location and cannot name itself. Shared records cannot link to private successors.
Removing the relation sets it to null through the same revisioned save flow. Research
source URLs remain in local review material; researched names must still be supported
before application.

Successor visibility is checked again inside creation/correction transactions. If a
successor becomes private or unavailable after validation, the save creates no new
identity, baseline or correction. Omitted status fields stay absent, so saving an
unchanged status does not append a revision. Accepted Feature projections carry their
correction revision tokens alongside the accepted baseline tokens.

[The operating-state rehearsal](../../../scripts/locations/rehearse-operating-status.ts)
checks a disposable populated `rehearsal.sqlite` next to its `before.sqlite` backup
under `.local/locations/`: immutable history, unchanged Feature associations before
adoption, explicit reviewed adoption, stale/no-change replay and public projection. Its
synthetic manifest is acceptance evidence only and must never be applied as a researched
closure claim.

The seed's
[offline review tool](../../../scripts/locations/seed-location-kinds.md#offline-review-tool)
shows each missing association with the original split exclusion and saved Feature
evidence. All 82 exclusions are verified against that receipt: 56 intangible records and
26 drafts were skipped before matching. Reviews export expected revisions and
recommendations as JSONL; they do not mutate flags or associations. Nearby saved
Locations are investigation leads, without an identity match claim.

## Versioned Location facts and building preparation (21 October 2026)

Refs [#194](https://github.com/tijptjik/hype/issues/194); source research:
[SaanSeoi LandsD Buildings](https://github.com/saanseoi/saanseoi/blob/preview/docs/datasets/sources/hkgov-landsd/building.md)
and
[separate building inventories](https://github.com/saanseoi/saanseoi/blob/preview/docs/datasets/families/buildings.md).
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
Unclassified legacy details preserve known brands/lifecycle until classification is
reviewed. Unsupported explicit JSON versions and mismatched fields fail validation.

`LocationFacts` remains the normalized display projection used by Feature consumers. The
Drizzle facts codec and raw-write helpers validate/serialize the storage envelope;
building/natural-specific details round-trip through `entity` in that projection.
Existing display fields, spatial projections and Organisation corrections remain in
place. SQL readers use version-aware fixed JSON paths for names, geometry, brands and
lifecycle rather than scanning whole revision histories. Building details participate in
the current facts adoption policy. Organisation edits cannot silently drop typed
details.

### Minimal spatial facts (22 October 2026)

HYPE retains only the optional physical footprint from additional building source data.
The prior LandsD-specific projector and duplicated source/structure/storey/elevation/
height fields have been removed. Source identifiers remain in the SaanSeoi response's
`identifiers` and retained evidence; HYPE does not maintain a second publisher identity
schema. Address content already models blocks, portions and floors. Storey counts are
not floor identifiers and are deliberately outside HYPE's core facts. Permit/works, lot,
alternate-name and other detailed source attributes can be reingested from SaanSeoi
later if a concrete HYPE need arises.

The optional shared field is `common.footprint`, not a building-specific detail:

```ts
footprint?:
  | { mode: 'inline'; geometry: Polygon | MultiPolygon }
  | { mode: 'reference'; ssId: string; releaseId: string; geometryRevisionId: string }
  | null
```

Both buildings and establishments may have an extent; natural/unclassified Locations can
use the same field. Existing establishment sources do not supply footprints, so absence
remains normal. Rings must be closed and coordinates valid WGS84. The point in
`common.location.geometry` remains the existing map anchor. `details` remains strictly
typed; buildings currently need only optional authored lifecycle status.

Immutable references reserve a future SaanSeoi geometry association and carry only
reference pins, not duplicate LandsD/Overture identifiers. Dynamic `latest`/`current`
aliases and download URL fields are rejected. No source geometry downloader, full
building inventory import or new D1 footprint table is enabled. Building and natural
source choices remain visible but disabled in discovery.

Manual and unmatched authoring is independent of source availability: a local building,
establishment or natural feature can be created with inline geometry now, without an
`ssId`. Local authoring cannot invent an upstream geometry-publication reference. The
existing local save API accepts inline footprint edits and explicit clearing; omitting
the field preserves it. Ownership and Organisation correction rules apply to footprints
too, including accepted Feature snapshots and Project facts adoption policy. No
polygon-drawing UI is added by this schema preparation.

Building Interior also supports **Choose from map** beside the PDF/image upload controls
(Refs #194). The editor loads nearby Lands Department footprints around the saved
building position. A user explicitly selects an outline (and a part for multipart
geometry) and names the floor before preparing a review draft. The server re-fetches the
selected source and checks its hash and the building revision before retaining the
original geometry, source identifier, actor and diagram. Selecting a footprint does not
change the Location's identity or address.

The footprint supplies an editable floor boundary with its courtyard holes preserved. It
does not supply interior rooms, circulation, floor counts or a verified shape for other
floors. Source diagrams use north-up, proportionate image coordinates, with their
approximate metre scale retained as provenance. Saving uses the existing unpublished
interior draft and version guard; reopening restores the source and reviewed geometry.
Uploads remain available, and replacing an existing review requires an explicit choice.

Primary local was checked read-only: none of its 1,581 revisions contain the removed
building-only fields. The optional shared field is compatible with all existing v1
snapshots, so no database rewrite or new migration is necessary for this simplification.

### Conversion and verification

Migration `0142_location_facts_snapshots.sql` wraps existing normalized facts,
preserving revision IDs, sequences, raw publisher payloads, source content hashes and
Feature projections. Historical kinds come from retained creation/import/type-change
provenance; unrecoverable classifications remain unknown rather than using a later
identity kind. It restores the immutable revision guard and rejects new unversioned
revision writes. Application validators enforce the complete subtype contract. Legacy
decoding remains available for retained audit envelopes and pre-migration rehearsal
fixtures.

Rehearse with a fresh private output directory:

```sh
bun scripts/locations/rehearse-facts-snapshots.ts INPUT.sqlite .local/locations/NEW-facts-rehearsal
```

The populated rehearsal validated 1,581 snapshots, preserved all effective values and
source evidence, and verified 75 unrelated tables, integrity and foreign keys. Source
and primary input databases are read-only during rehearsal. Regression coverage includes
wrong subtype/version rejection, addressless buildings, typed-detail retention on edits,
optional geometry, immutable reference pins, source replay and import SQL.

### Policy coherence with occupancy history (22 October 2026, Refs #194)

`locationPlacement` now assesses and executes occupancy-only targets independently of
the ordinary facts evaluator. Project/Layer `fixed`, `review`, and `follow` policies
control relocation. A `fixed` Feature produces no routine move proposal; review
candidates enter the existing Task Queue; eligible verified `follow` candidates commit
their accepted placement atomically. Missing destination addresses, unverified or
planned occupancies, competing current occupancies, local pin/address corrections, unit
details and access directions prevent automatic movement.

The executor classifies each candidate as a correction to the same accepted placement or
a changed occupancy. It uses resolved Project/Layer relocation consent for the latter,
captures exact occupancy/address/membership versions, and appends accepted placement
history. The address, unit and coordinate policies must not bypass `fixed` or a pending
relocation review. A renamed building or corrected address is not itself a move; a
coordinate distance threshold is not move consent. Name/brand changes assess identity
evidence, never automatically reassociate a Feature. Search radius affects discovery
only. Local overrides, access directions, ambiguous identities and incompatible address
groups retain their review gates. Canonical address correction/rebase review remains
distinct from Feature placement acceptance, even when both involve the same address
revision.

Local lifecycle storage and migration rehearsal are described in the
[Location lifecycle rollout guide](../../../docs/refactor-guides/Location-Lifecycle-Rollout.md),
Refs #194. Migration 0151 captures accepted geometry, policy and proposal receipts with
immutable binding history. Curated address imports require the expected canonical
predecessor; Organisation editors cannot author canonical content. Address review
accepts canonical values or reasserts sparse differences against the reviewed version;
equal differences retire automatically under eligible follow policy. Access directions
remain on the accepted binding and in its immutable history, with a Feature envelope
projection for existing readers. Task Queue actions are Move, Keep here and Review
later. Bounded reconciliation returns a continuation cursor that ingestion callers must
exhaust. The focused relocation/address/queue workflow is locally verified; complete A–Z
identity merge/split execution and production activation are separate work. Breadline
import follow-up is documented there.

### Locations directory index (22 October 2026, Refs #194)

`/admin/locations` uses the shared header search, control-bar filter primitives,
`ResourceIndex` virtual list and row shell. The dedicated `LocationRow` presents
localized names/address evidence, kind, lifecycle and ownership/source state.
Organisation, kind and lifecycle are server-filtered before cursor pagination; selecting
an Organisation narrows the directory to owned Locations and current Feature
associations in that Organisation. Detail reads retain their existing authorized
shared/private scope. Kind subsets the lifecycle choices and changing kind clears any
incompatible lifecycle selection; changing search, scope or account clears stale rows
and invalidates in-flight reads. The index automatically loads subsequent pages as the
user scrolls, with loading skeletons inside the virtual list and no separate load-more
footer. Header search is route-owned and cleared on departure. Browser acceptance with
an authenticated account remains pending; the local browser redirects to sign-in.

### New Feature naming entry (22 October 2026, Refs #194)

New Features begin with “Find an existing Place” (primary) or “Add your own”
(secondary), with icons and a short explanation. The Profile form expands and fades in,
and visiting Location permanently dismisses this chooser for that draft. The unplaced
map starts over Hong Kong at a harbour-wide zoom without a marker. Profile and Location
share one mounted map and its resize state, initially half the viewport height. Only the
form panes fade and slide when switching tabs; reduced-motion preferences disable that
animation. Location follows Profile in navigation. Draft discovery searches read-only
Places previews and building/address geocoding without requiring a Feature ID; selecting
a result copies its marker/address and fills empty localized titles while remaining on
Location. Search results animate in flow beneath the search control, with five visible
rows before scrolling. Numbered map previews fit all results and highlight on hover or
keyboard focus. New drafts have no accepted pin until a result is selected or Drop Pin
places one at the current map centre. Divisions appear after placement; address fields
appear only after an address result is selected. Titles remain editable and independent;
this is neither a canonical Location link nor a new name-following policy. Existing
authored titles are retained. The Photos facet and image pane are omitted until the
Feature has a saved ID. Draft search reports partial provider failures and discards
superseded responses. A building move requires an explicit primary-colour confirmation;
Save remains blocked during the requested lookup and until the move is confirmed or
cancelled. Accepted markers retain the building result number, or the originating row
number for a building resolved outside the result list. Returning to results exits
nested street-address alternatives to the grouped overview. The current building export
contains footprint-matched address alternatives, without a designated whole-building
address or division memberships; these must not be inferred from a numeric span. Refs
#194.

Migration 0153 extends reviewed identity consolidation with dependency snapshots,
immutable relationship alias resolution and explicit lineage; it adds atomic address
ordering receipts and removes address coverage. Migration 0154 applies the v1
`version`/`rawSource` naming without rewriting retained content hashes. The Location
editor offers paginated relationships, immutable history and evidenced lineage events.
See the rollout guide for exact verification and remaining identity-variant acceptance;
no remote activation is implied. Refs #194.

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
verification remains outstanding. Local Central searches measured approximately 3.5
seconds for addresses and 3.4 seconds for Places before preview hydration. Indexed
address lookup and fewer Place preview round trips remain optimisation opportunities;
backend streaming has not been introduced.

Development setup follows
[the normal database rebuild](../../../docs/refactor-guides/Development-Database-Rebuild.md):
fresh HYPE and Breadline exports, migrations and reviewed conversions, then
development-only mocks. Refs #194.

Draft-discovery recovery and presentation (22 October 2026, Refs #194): result rows
expose the source type with an icon and label, use the map's numbered badge colours, and
separate the primary name from the address without repeating it. Back to results
restores the previous query and result order, undoes only the selected Location fields,
and preserves titles edited after selection. Discovery requests retain cancellation and
use a bounded 30-second timeout.

A local LEGO regression returned five Places only after 17.7 seconds because the address
fallback hydrated non-matching records and blocked the shared local API. SaanSeoi now
scans scorer fields first and hydrates matching identities only, retaining publication
filters, normalization and complete ranking. Concurrent local requests measured 5.8
seconds after the change; further indexed address lookup remains desirable. Places with
preview details alone measured 684 ms.

### Feature discovery interaction acceptance (22 October 2026, Refs #194)

Profile and Location retain the same map canvas and height, initially half the viewport.
Form panes fade and slide with reduced-motion support. Location hides the attribution
and navigation overlays and focuses search when entered through the chooser. Parent
search prefetch stays closed until interaction.

Result titles fall back across locales and source brand labels. Hover highlights the
numbered preview; selection flies to the accepted marker and shows the establishment's
supplied address. The next action is Set Profile. Division clear, reset and lock
controls appear on hover or keyboard focus, using the shared Location detail components.

Authenticated local browser checks cover canvas identity, constant height, search focus,
overlay visibility, title fallback, hover outlines and the actual Times Square
establishment address. Focused search and division tests pass.

Draft search type controls (Refs #194): the labelled Include group enables Shop and
Address discovery independently. Building is visible but disabled pending a building
discovery provider. Disabled types issue no requests; changing types invalidates stale
responses and cancels pending address requests. The magnifier inside the input submits
immediately and remains distinct from Drop Pin. Empty type selection prompts the user to
enable a type. Desktop and 390px-wide Chrome checks and ten focused component tests
verify the controls and request selection.

Location queue presentation and seed coverage (Refs #194): queue rows retain the linked
Feature title and fall back to the Location's localized names when no visible authored
title is available. The review action appears beneath the name, and badges wrap within
their grid column. The local rebuild seeds all seven task types on separate unpublished
Features; Location tasks use persisted adoption or identity evidence and the normal
queue/editor routes. Replaying the seed must preserve decisions rather than reopen
completed reviews.

### Draft discovery presentation and nearby search (23 October 2026, Refs #194)

Draft results use primary-theme numbered markers and matching row badges. Selection
retains the same marker elements, flies to the chosen result and fades the others; Back
restores them. Selected markers remain draggable. Search Tab navigation goes directly
into results, with Shift+Tab returning to search and the preceding type controls.

Address rows show source component blocks, keeping street number and street together.
Locality labels use cached public lookups of explicit source division IDs;
administrative areas are omitted. Free-form evidence remains intact rather than being
guessed into structured components. Drop Pin requests current device geolocation, with
an explicit error when unavailable. Search Nearby uses the selected types and a 50–1000m
radius control in the map's upper-right corner. Public Place discovery is account-gated,
bounded and read-only; it does not create a canonical association.

Verification: 23 focused tests passed. Authenticated browser checks against an isolated
local database confirmed six retained markers, fading/restoration, theme colours,
structured street/locality blocks, keyboard navigation, and device coordinates with a
500m nearby radius. Basemap tile rendering remains unverified on the local test origin.
The whole-app check retains its existing 10 errors and 19 warnings outside this scope.

Location review Profile presentation (Refs #194): Location tasks reuse the Feature
visual section with the linked Feature photo and a camera-synchronized OLD/NEW movement
overlay. The distance is straight-line displacement, not a route. Map source failures
remain explicit while the movement evidence stays visible. Reviews use the shared
seven-level address blocks (unit/floor, section/building, block/phase/premises,
number/street, administration, locality and islands), hiding unchanged blocks until Show
all. Feature Location and Location detail reuse the same renderer. Retained source
content remains authoritative; an absent section name is not inferred from a building or
block.

Location review detail uses the same FormSurface and SectionHeader components as
Organisation and Feature admin details: full-width tinted icon headings, flat comparison
bodies and divided field columns. Task labels and Feature breadcrumbs appear only in the
page toolbar; nested comparison cards are not used.

Task header actions retain the existing reason, stale-evidence, dependency and
permission guards. History is collapsed and refresh explains that it checks newer
evidence without reopening decisions. Demo seeds reuse mirrored Feature photos and
append richer address snapshots only for untouched synthetic review examples;
accepted/rejected examples and existing source snapshots remain intact.

Local verification covers all four Location task editors, both shared address views,
changed/all expansion and movement overlays. The local basemap request returned HTTP
401; geographic overlays and photos were verified without claiming successful basemap
delivery.

### Temporary Street catalogue transport (Refs #194)

Hype's temporary catalogue is served at `/mocks/saanseoi/streets/names/manifest.json`.
`loadStreetCatalogue` in `src/lib/addresses/streetCatalogue.ts` accepts an absolute
manifest URL and an injected fetch implementation. It fetches the JSON array
representation and verifies chunk hashes, byte lengths, counts and unique canonical IDs
before returning the complete inventory. The mock is a transport fixture; address form
selection and automatic translation adoption are not connected to it yet.

Regenerate with `bun scripts/addresses/generate-street-catalogue-mock.ts` using the
sibling SaanSeoi checkout. The fixture contains the reviewed LandsD baseline's 4,053
canonical identities, English and Traditional Chinese names, and `divisionCodes`
resolved to the SaanSeoi geographic district code registry. Combined publisher district
labels expand to multiple codes. Simplified Chinese is absent pending an authoritative
translation policy. The manifest records the baseline evidence hash and division-code
registry hash, declares `mock: true` and leaves `apiReleaseSetId` null. It does not
claim to represent a currently published API release or include subsequent lifecycle
changes.

Proposed upstream discovery convention, subject to SaanSeoi's API design:
`/{family}/{version}/exports/{domain}/{variant}/{projection}/manifest.json?region=hk`.
For example, `/divisions/v0.2/exports/geographic/saanseoi/names/manifest.json`. The
manifest lists available format/envelope combinations and exact immutable file URLs,
including chunks when needed. JSON arrays, NDJSON records and Parquet rows are
representations of the same logical projection. The mock implements only JSON arrays.
Format is independent of envelope; clients negotiate using manifest metadata, rather
than inferring semantics from file extensions alone.

Production manifests must pin a published API release set, region, schema and
projection, define active membership and locale policy, and identify the exact Divisions
release used for code references. Optional `release` selection resolves an exact
historical release; omitted selection resolves latest once. Required artefacts must be
built and verified before publication exposes their manifest. Immutable release
manifests and files receive long-lived caching; latest discovery revalidates. File
hashes describe decoded representation bytes. Public object serving needs appropriate
CORS, HTTP range support for Parquet, and licensing and attribution metadata. These
upstream publication requirements are not implemented by this Hype fixture.

### Draft discovery and address entry controls (Refs #194)

Discovery rows show publisher taxonomy until explicitly previewed. Preview focuses that
candidate while retaining all map markers; only the selected row exposes link or address
acceptance actions. Accepted establishments keep their source name and Unlink action in
the toolbar, independently of whether the Feature inherits the name. Unlink removes the
pending association and venue identity while keeping the current address, marker and
edits as an accepted manual entry. Add Manual Entry is offered only during discovery,
never after accepting or unlinking a record. Linking and Use Address actions have
explicit offset keyboard-focus rings. The last result's forward Tab reaches Add Manual
Entry; reverse Tab retains footer navigation. Manual entry is centered before results
and moves to the footer once results are available, respecting reduced motion.

The shared editor separates editable address details from marker-derived divisions. Only
locality membership is editable. Display text is generated from structured components
unless explicitly unlocked for a complete locale-specific label. Portion descriptions
are locale-specific corrections; floor/unit identifiers remain shared. Block type,
reference and type/reference ordering are explicit. English named floor levels (UG, LG,
B, M, C, P, R) do not receive an automatic /F suffix. Source floor counts or ranges must
not be represented as verified on-site floor-label inventories.

Street selection uses the reviewed names manifest and data fixture at
`/mocks/saanseoi/streets/names/`; illustrative building choices use the same names
projection at `/mocks/saanseoi/buildings/names/`. Building fixture IDs are never
persisted as canonical building or address identities. Public catalogue endpoints remain
pending. Unassociated Place text is retained as evidence and can be locally structured;
the English number-plus-street fallback requires an exact controlled street-name match.
Unknown text remains visible rather than being guessed.

Validation: `address-name-catalogue.test.ts`, `address-editor-controls.test.ts`,
`address3d.test.ts` and `draft-feature-location-search.test.ts` cover parsing,
translation boundaries, complete display overrides, preview/acceptance and keyboard
handoff. `scripts/visual-checks/address-editor-check.ts` checks the shared editor's
desktop columns, mobile overflow, display lock and real street catalogue selection. This
fixture is not authenticated admin acceptance evidence.

The new Feature discovery empty state offers name/address search, map-pin nearby search,
and manual entry (Refs #194). Search is the default mode; map mode replaces text input
with nearby search and coordinates while retaining inclusion and taxonomy filters. Entry
actions focus the search input or highlight the draft pin, respecting reduced motion.
Manual entry keeps the editable address workflow and resolves divisions from its pin.

### Linked draft address toolbar (Refs #233, parent #180)

The accepted draft toolbar keeps the place name visible, followed by Unlink and the
editable display address with its lock on the right. Missing establishment/building
names use explicit kind-specific nameless labels; address records retain their address
label. The toolbar always displays only the user's locale; Languages expands the
component editor without adding display-address rows or changing toolbar height. Address
and Divisions share the same heading level and size. Example text appears only as
placeholders, and shared numeric fields omit a redundant language label. The accepted
toolbar keeps marker lookup in the coordinate control; it has no secondary
forward-search field. The marker, display text and lock align to the right, leaving
spare space between Unlink and the marker. Back to results uses the primary button
treatment. In a constrained toolbar, coordinates progressively show fewer decimal places
before Unlink becomes icon-only; focus and copy retain the full stored precision.
Coordinate labels and copy use tighter gaps. Escape clears discovery input, results and
pending responses. Result keyboard focus and pointer hover share one background tint and
marker highlight. Keyboard focus takes precedence while a result or its action buttons
have focus, so hovering another row cannot produce a second highlighted result. When
streamed results reorder the list, the highlighted result stays centred by its stable ID
after the reorder animation, preserving keyboard focus. Pending centring is cancelled if
the query changes or the highlight moves elsewhere. Enter in the populated search
selects and previews the first visible result; Enter on an already-selected
establishment confirms Link and use Name. Repeated keydown events do not accept a
result. Acceptance buttons use a 1px solid accent outline with a 2px offset so focus
contrasts with the primary button fill. Include icons pulse independently until their
provider settles, respecting reduced motion and ignoring completions from superseded
searches. Typing optimistically filters cached discovery rows by multilingual names and
address components, with case/width normalization and common street abbreviations such
as `rd`/`Road`. Filtering starts in a separate task, caches text by provider-row
identity and yields between small batches so address parsing does not block keystrokes.
Superseded queries, fresh responses, clearing, selection and unmount invalidate pending
filter work; unchanged matches retain their array identity to avoid regrouping and
republishing markers on every keystroke. Matching rows and map candidates remain visible
through debounce and provider loading. Each successful provider response replaces only
its own kind, including authoritative empty responses; failed providers retain matching
cached rows alongside the existing error feedback. Clearing the input still clears
results. Regression evidence (28 October 2026): 65 focused search/filter/grouping tests
pass and Svelte checking reports zero errors. A Chromium component fixture verifies
rapid typing, optimistic rejection, retained DOM identity and fresh replacement without
an empty-list flash. With 249 cached rows, local fixture input-handler timings fell from
130–200 ms to 0.1–0.4 ms after cooperative filtering and text caching. Authenticated
admin acceptance remains unverified.

When an unassociated Place matches one controlled street, its published street-name
translations populate the draft with the shared building number. Terminal compass
abbreviations (for example, Chatham Rd S) resolve through controlled street aliases. An
unambiguous published building-name match also supplies translated building names.
Traditional Chinese supplies a script-converted Simplified fallback through OpenCC when
no Simplified value is published, including locality names; an explicit correction or
clear takes precedence. Unparsed translated source text remains intact; no canonical
address identity or unpublished venue-name translation is inferred. The parser's 2D
remainder supplies the base display, so extracted units are not prepended to source text
that still contains them. The generated display label receives the same effective
divisions shown in the editor: the single most-specific available locality follows the
English street and precedes the Chinese street, including Hong Kong Island and Kowloon.
For example, `57 Wang Wo Tsai Street, Tsuen Wan` and
`198-200 Tsat Tsz Mui Road, Tsat Tsz Mui`. A neighbourhood takes precedence over its
macrohood or town; the nearest available broader locality is used when no finer locality
exists. Administrative divisions are not substituted for locality. Locality
changes/reset recompose the label, while a complete unlocked label remains untouched.
Resolved geography is a read-only projection, never a formatted-address override. Each
locality node removes its branch while retaining the valid ancestor prefix. Marker reset
appears below the Locality label on row hover or keyboard focus and closes an incomplete
custom search or chain choice. Ancestors with resolvable children expose Add in a
separate next-child slot on row hover/focus. The × stays with its own division; an
occupied child slot has no Add action. This picker offers only direct children of the
selected source chain. Ambiguous selections ask "Choose the neighbourhood chain for
{name}". Forward Tab from neighbourhood and street/building search skips Cancel to the
first result or chain; Shift+Tab can return to the visibly focused Cancel.

The editable address panel uses three desktop columns in reading order: **Address**
contains Add detail controls, **Location** contains the fields and Languages toggle, and
**Division** contains the geography editor. They stack in that order on narrow screens;
selecting a detail opens its field in Location. The same AddressDetails component
retains its compact layout when used outside the three-column form.

### Unit references and street presentation (Refs #233, parent #180)

The unit editor separates the full type label from the reference: select Room and enter
`3308`. Pasting recognized type words or abbreviations, including repeated ones, strips
them from the reference and shows a short inline warning to choose the type in the
selector. The selected type takes precedence over pasted wording. Generated display
addresses and component/search blocks use the existing canonical abbreviation table
(`Room` → `Rm`, `Suite` → `St`); Chinese unit ordering remains localized. Changing the
selector preserves the reference. Saving authored content persists the composed unit
expression alongside its semantic type/reference, so reloading cannot lose the type
prefix.

English street names use title case in generated addresses, selected street tiles,
search results and address component blocks, including apostrophes and initials.
Published source names remain intact for matching and provenance; explicit custom
display-address overrides remain authored text.

Regression coverage includes unchanged-reference pastes, repeated labels, selector
precedence, Chinese suite suffixes, canonical display blocks and street casing. Desktop
and 390px Playwright fixture checks cover normalization, warning clearing, selector
changes and layout. These component checks do not establish authenticated admin
acceptance.

### Venue identity on the FeatureCard (Refs #233, parent #180)

The display-address toolbar uses an inline locked field with a marker tooltip ("Display
address") and the lock on the right; it has no repeated label above it. Venue identity
remains a separate presentation field: the shared FeatureCard map portal shows the
accepted linked Location name as a horizontal label along its lower edge, while the
postal address retains its existing angled layout. Long venue names wrap to at most two
lines within the portal; absent names render no placeholder. The Feature title and
stored display address are unchanged.

Read-only `locationNames` is projected with the existing Feature list/detail reads from
`factsRevisionId` plus the accepted Organisation name corrections. It observes the same
draft/private-owner guards as accepted brands, honors per-locale clearing, and never
follows an unaccepted latest revision or substitutes an independent Feature title. The
UI uses the current language and configured fallback languages. This requires no new
database column or migration.

## Shared accessibility observations (26 October 2026)

Refs #194, parent #180. `locationAccessibility` is an independent append-only shared
fact stream for establishments, buildings and premises. It does not modify imported
`locationRevision` snapshots or Organisation corrections. Each revision stores four
independent answers: wheelchair access (`yes | limited | no | unknown`), step-free
entrance (`yes | no | unknown`), lift on the access route
(`yes | no | not_needed | unknown`), and wheelchair-accessible toilet
(`yes | limited | no | unknown`). Missing observations display Unknown. No evidence
fields, attachments, approval queue or standalone assistance-required flag are used.
Limited wheelchair/toilet access may include needing assistance; a lift's presence alone
does not establish wheelchair suitability. These are reported facilities, not regulatory
compliance certifications or an ordered whole-building score.

Every authenticated admin-panel contributor may save these shared facts using the
separate accessibility action in a linked Feature's Location section or the Location
record. Source identity/address permissions remain unchanged. Manual private Locations
are excluded from this shared contribution surface. Save records actor/date and an
immutable predecessor, fencing both the observation head and authoritative Location
revision. Previous values can be restored by saving a new revision. Shared facts are
read live in this explicitly labelled section; they are not silently incorporated into
historical Feature snapshots or their existing facts-adoption decisions.

Building/premises records separately show attributed reports from current, asserted,
shared direct occupants, including venue names and recorded dates. They never copy venue
answers into building answers or imply access to all entrances, floors, tenants, or
communal toilets. A venue may have an independent street entrance. Scoped/private
occupancy, former occupancy, all-unknown reports and reports needing a placement recheck
are excluded. The first 50 observed tenants are bounded and truncation is labelled. No
proximity/address-text inference or recursive propagation through a premises is used.

Observations retain an internal placement token from the source Location position and
shared occupancy heads. Position/occupancy changes flag the original observation for
rechecking and remove its current building signal. Non-placement source updates retain
its validity. Identity redirects do not automatically transfer observations to a
survivor. Migration 0155 adds only this new table, indexes, head view and
immutable-chain guards. Production application remains a separate release step.

The address editor exposes Accessibility as an optional **Add parts to edit** item. For
a linked shared Location with no recorded accessibility, adding the part reveals and
focuses the four controls inline beneath the address fields; it does not write until
**Save shared accessibility**. Existing direct observations or venue reports remain
visible automatically. The shared editor also remains available to contributors who can
read a Location but cannot edit its address.

New Features also offer this part after selecting an upstream place or choosing a new
local building/establishment. These four controls stage only explicitly edited answers
until the Feature is saved and linked. Changing the selected place clears the draft. The
retained link intent includes the accessibility draft so failed saves can be retried
after reload. Existing known answers are never silently overwritten: conflicts or stale
observations require review on the linked Location. Untouched fields retain their shared
values, and retries do not duplicate an applied report.

Access hints and mobility answers are independent optional parts under Accessibility in
the address editor. Standard form fields place icons and labels above answer selectors,
using two columns when the editor has room and one column in narrow panels. Access hints
use the same full-width text input as other address fields; field explanations are
available through keyboard-focusable information tooltips. A small Accessibility heading
groups Finding the entrance and Mobility access; sharing/publishing implementation
guidance is omitted from this editor. Draft and saved-Location editors use the same
answer-field component.

Building catalogue selections enable the same draft accessibility controls as Places
selections. Since catalogue rows carry address evidence rather than an importable Places
identity, Feature creation retains a local building intent using its building names,
while preserving the selected Feature name-inheritance choice.

The established reset/remove icon follows each subsection title. Access hints use the
address source/reset rules; mobility answers use their own observation baseline.
Resetting an unsaved mobility part discards it and restores its add-part button.
Removing saved mobility answers appends an all-unknown observation using the existing
revision checks, then hides the part only after a successful save. Neither operation
changes the other record type.

### Street-number expressions

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180.
`src/lib/addresses/streetNumber.ts` parses one number, a range, or a pair into
`buildingNumberFrom`, `buildingNumberTo`, and `buildingNumberConnector`. A hyphen
retains range semantics; commas and ampersands describe a pair. Shared numeric bases
shorten only suffix pairs, never ranges or missing numeric digits.

| Input         | From   | To     | Connector | Display number |
| ------------- | ------ | ------ | --------- | -------------- |
| `128-132`     | `128`  | `132`  | `-`       | `128-132`      |
| `124B-124C`   | `124B` | `124C` | `-`       | `124B-124C`    |
| `124B,124C`   | `124B` | `124C` | `/`       | `124B/C`       |
| `124B & 124C` | `124B` | `124C` | `/`       | `124B/C`       |
| `124B & 126A` | `124B` | `126A` | `&`       | `124B & 126A`  |
| `124B-126A`   | `124B` | `126A` | `-`       | `124B-126A`    |
| `124-126A`    | `124`  | `126A` | `-`       | `124-126A`     |

Lowercase/full-width characters and dash variants normalize for display. `238-A` becomes
the single number `238A`; `124B/C` and `124B-C` expand their structured last endpoint to
`124C`, while retaining pair/range semantics. Descending numeric or suffix endpoints,
incomplete expressions, decimals and lists with more than two entries are rejected.
Equal range endpoints remain valid. `124-6` is descending; it never silently expands to
`124-126`.

The input retains incomplete text during typing, normalizes on blur, and shows localized
errors with native form validity. Feature override validation and the local Location
submission schema reject invalid edits. Saving authored content and composing display
addresses use the same parser; source evidence is retained unchanged when its number
syntax is unrecognized. No intermediate address members are inferred from a range.
Parser, editor, schema and persisted display round trips are covered by
`street-number.test.ts` and `street-number-editor.test.ts`.

### Map-derived street number suggestion

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). Adding the Street number part in
the Feature or local Location address editor queries the current map pin's unique
containing building footprint. Number evidence comes from explicit `addr_housenumber` /
`addr:housenumber` properties on that footprint and address-point labels contained by
it, from the same map source. A single distinct literal number or range fills the empty
field using the ordinary editable address override; conflicting numbers, courtyards,
neighbouring labels, unavailable tiles and overlapping buildings do not produce a
suggestion. The adjacent dismissible note asks the editor to verify this map-derived
number. Dismissing the note retains the value. Typing, resetting, changing the pin or
changing the selected address prevents pending results from replacing user work. This
does not establish a source address identity or infer a street name. Implementation:
`src/lib/map/buildingAddress.ts`, the map controller and
`formFeatureAddress/AddressDetails.svelte`. Geometry tests are in
`src/tests/map-street-number.test.ts`; editor interaction checks are in
`src/tests/address-editor-controls.test.ts`. Exact live-map visual acceptance is still
required with the authenticated Pretty Garden workflow.

Street enrichment remains available whenever the pinned draft lacks a structured street
name, including premises-only results and drafts with a number already filled. A source
address ID does not suppress this offer. Adding the Street name part also starts the
existing pin lookup, which samples named road segments within 100 metres and offers
catalogue-matched streets nearest first. Selection remains explicit: proximity is a
suggestion, not proof that a number belongs to that road. Nearby streets start collapsed
because this is an optional enrichment path. Every choice shows a non-empty catalogue
name, its distance and the selection action; missing active-language text falls back to
the catalogue default name or a known non-empty translation. A default English catalogue
name can also populate the English street field without inventing Chinese translations.
The nearby-street review shows at most four rows at once; additional streets stay
available by scrolling within the list, including keyboard focus navigation. Its Cancel
action remains outside the collapsed choices at the section's top right. Cancelling a
lookup started to review a pin move also restores that move's prior marker and address;
ordinary enrichment cancellation only closes the lookup. The Pretty Garden
premises/number cases and Add street interaction are covered by
`src/tests/address-editor-controls.test.ts`; road proximity and canonical matching are
covered by `src/tests/nearby-streets.test.ts`. Live Pretty Garden/Ko Po Road acceptance
remains unverified without an exposed authenticated browser session.

### Address enrichment results and source-number recovery

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180. Lookup Address
keeps its label stable, with a leading search icon replaced by an animated loading
indicator. Address candidates use small numbered markers from their retained source
geometry, ordered identically to the distance-sorted rows. Hover/focus previews the
candidate; leaving restores the Location pin and previous zoom without mutating
coordinates. Selecting/dismissing removes transient markers.

A live public SaanSeoi check found Pretty Garden's DPO records retain village numbers
only in formatted text, with null structured number/street fields. Hype recovers a
single standalone numeric token only for DPO records with explicit hamlet membership, as
an editable override; original records remain unchanged. Conflicting tokens and existing
numbers/explicit clears are preserved. Ko Po Tsuen is not inferred as a street. Recovery
also makes the initial collapsed premises group expose its 71–75 alternatives. Text
search and pin lookup both use SaanSeoi's Address API; map-road hints remain a separate
100 m street-only lookup.

Evidence: `recover-address-number.test.ts`, `nearby-address-candidates.test.ts`,
`address-editor-controls.test.ts` and `draft-search-groups.test.ts`. The live source
check used release `data-hk-addresses-2026-09-23.0`, publisher `hkgov-dpo`.
Authenticated full-map camera acceptance remains pending; no save or publication is
implied by the local draft and component checks.

### Optional map parts after a marker drop

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180. After a Location
marker drop and camera settling, the editor checks all containing building footprints,
including overlapping podiums and towers. Names include the separate `building-labels`
interior-point dataset; labels outside the footprint are excluded. Unambiguous terminal
English Block/Tower/Building/House/Villa references can suggest missing block type and
reference; the existing footprint/address-point number lookup can also suggest a missing
number. The initial scope does not infer arbitrary address parts or assign nearby road
names automatically.

An anchored **Add missing parts** button below the marker previews the proposed parts,
with an independent dismiss control. It follows camera movement, hides during dragging,
and does not alter the draft until explicitly clicked. Existing values and explicit
clears take precedence, including edits made while a lookup was pending. Changing pin,
Feature or editing mode invalidates old requests. Ambiguous/unavailable map evidence
leaves ordinary manual editing unchanged.

`map-missing-parts.test.ts` covers Hollywood Terrace Tower B, conflicting labels,
inside/outside footprint labels, and preservation of existing or cleared fields.
`map-address-suggestion.test.ts` checks review/apply/dismiss behavior. Exact live map
acceptance with the user's authenticated Hollywood Terrace record remains unverified;
the component preview does not establish that full workflow.

Podium overlap correction: suggestion-only building-name sampling retains every
containing footprint and deduplicates label names across them. A podium cannot suppress
a tower simply because both contain the pin; conflicting Tower A/B names remain
unresolved. Name and number queries settle independently, so an ambiguous number lookup
does not discard usable block evidence. Explicit building/address identity selection
retains its unique-footprint requirement. Regression coverage in
`map-missing-parts.test.ts` checks nested podium/tower geometry in both source orders
and conflicting overlapping names. Live Hollywood Terrace geometry remains unverified in
an authenticated browser.

### Latched geography and map disagreement review

Refs [#194](https://github.com/tijptjik/hype/issues/194), parent #180. Marker moves
retain the last successfully resolved divisions in both the panel and canonical display
caption while replacement geography is pending. Unavailable or rejected lookups retain
the same projection; a successful empty result may replace it. Stale geography remains
non-editable until the current pin resolves.

Containing-building labels, explicit footprint street names and unique numbers produce a
structured **Address differs** notice, with a warning icon in its own vertically
centered left section and centered actions in a content-sized card, the existing
selected → mapped comparisons and explicit actions. Missing evidence or conflicting map
labels do not prove a mismatch; nearby road proximity is not used as contradictory
street evidence. Pin/Feature/edit changes cancel old evidence and ordinary edits
recompute disagreement against the current draft.

In the new-Feature flow, **Accept Change** applies the displayed corrections and looks
for an exact structured Address. Standard name abbreviations are normalized; number
ranges, blocks, floors and units must agree. Nearby, partial-number and display-only
matches do not establish identity. A complete no-match result becomes a custom authored
address with original source evidence retained separately and canonical identity
removed. Provider lookup, optional unit enrichment and local identity discovery are
optional for an explicitly accepted custom draft. Their unavailability cannot block that
draft; normal Save still authorizes creation. Ambiguous exact identities and truncated
results continue to require review. Once ambiguity is known, **Accept Change** is
removed and guarded against retries for that suggestion. The expanded explanation card
retains its existing layout and offers **Review Change** for explicit selection.

The existing Organisation-authorized local discovery query checks visible latest address
Location revisions within 1 km of the corrected address point. One exact Location with
the requested shared/exclusive visibility is retained in the normal deferred association
intent; Feature Save links it without creating a duplicate. Otherwise Save creates the
custom address Location through the existing retryable creation/linking flow. A changed
physical address invalidates a retained match. **Review Change** opens the existing
address lookup for explicit result selection. Saved Features preserve this review path:
automatic reassociation is restricted to new Features because ordinary saved-Feature
edits can write shared Location corrections and require a separate reassociation
workflow.

If the exact Address or Location changes the marker position, the editor previews that
candidate and reuses `LocationMoveConfirmation.svelte`, extracted from the existing
building-association flow. The accepted marker and address stay unchanged until **Move
marker and use address** is confirmed. The notice's × action and move-confirmation
Cancel restore the pre-drop geometry, address metadata, pin visibility and camera, while
preserving unrelated form edits. Cancellation also invalidates pending lookups,
preventing late results from restoring the move. Confirmation re-inspects map evidence
at the new point so further differences require another explicit decision. Saving is
blocked while lookup or move confirmation is pending; stale draft responses cannot
apply.

Custom corrections use the current dropped pin, supplied separately from the stale
address's retained coordinates. Accepting an address updates the chosen discovery
marker's geometry and caption while preserving its number and cached source result.
Reverse-lookup choices retain each record's actual point, and an explicit **Use
address** selection moves the marker to that point. Lookup alone never moves it.

Pointer focus does not recenter search rows before click dispatch. After selection and
action rendering, the chosen row is centered with its actions visible; narrow layouts
wrap those actions below the result. Streaming reorder still follows the stable
highlighted ID without replacing keyboard focus. Scrolling the list closes its tooltip.
`scripts/visual-checks/location-flow-check.ts` exercises these pointer and scroll
gestures, offline custom fallback, move rollback, stable marker 17 and the rendered
marker position through a real MapLibre component on a blank local basemap.
Authenticated admin acceptance remains separate.

While either **Address differs** or **Add missing parts** is visible, camera panning and
both the ordinary pin and selected discovery marker are locked against dragging.
Handling one notice keeps dragging locked if another remains; reviewing or applying the
last notice restores the editor's existing drag permissions.

Browser gestures against the real map component verified both marker kinds, camera
locking until the final notice is dismissed, restored dragging afterward, and
preservation of read-only marker permissions. This fixture used a local blank basemap;
authenticated admin acceptance remains pending.

The 28 October prompt update is local working-tree implementation (Refs #194, parent
#180). Focused coverage includes `map-address-change.test.ts`,
`resolve-map-address-change.test.ts`, `address-location.remote.test.ts`,
`map-address-conflict.test.ts`, `location-move-confirmation.test.ts` and the existing
identity/linking/building tests. Chromium fixture checks verify light and dark
rendering, both action callbacks and no horizontal overflow at 320 px. The combined
number, street and address-change run passes 121 tests across 13 files. The final full
Svelte check has zero errors and 19 existing warnings after the shared tooltip changes
settled. Authenticated admin creation/association and persistence remain unverified
because no authenticated browser session was exposed to this run. Existing broad
delivery acceptance remains open; there is no deployment or production data mutation.

English canonical block expressions use the shared display abbreviation table; editor
type selectors and original expressions retain full labels. Tower uses Twr, Building
Bldg, Block Blk, House Hse, Apartment Apt, Mansion Mans, Quarters Qtrs, Carpark CP and
Garage Gar. Block descriptors Phase/Stage use Ph/Stg. Recognized units use the same
table (Room Rm, Suite St, Office Off); Unit remains Unit. Flat, Shop, Stall, Kiosk,
Villa, Commercial and Retail remain spelled out pending abbreviation review. Chinese
labels and semantic type codes are unchanged. Regression coverage:
`address-divisions-ui.test.ts`, `map-address-disagreement.test.ts`,
`map-address-conflict.test.ts`, `address-formatting.test.ts` and
`address-expressions.test.ts`. Full authenticated map-drag acceptance remains
unverified; component tests/preview do not replace that workflow.

### Indexed partial names and lazy Address batches (Refs #194)

Feature discovery requests 20 publication-pinned Address results initially and loads
subsequent batches when the result list is within 160 px of its end. Short lists fill
automatically. Appending preserves the highlighted identity, keyboard focus and scroll
position, deduplicates Address IDs and updates candidate markers. Search changes abort
and discard older continuations. Network failures retain existing rows and retry the
same cursor; expired sessions require the explicit Search again action.

SaanSeoi retrieves normalised partial street/building names through a derived Unicode
gram index and verifies candidates with the component scorer. The initial request ranks
once and retains IDs/scores in a five-minute edge cache. Continuations hydrate only
their slice. Queries and resolved geographic filters, publication tokens and coordinate
requirements bind the session; unavailable preparation fails closed. `locatedOnly=true`
excludes unlocated records from both the map picker and its exact total. These remain
available from the general Address API. This does not introduce Street-type discovery
results.

Local verification: Hollywood loads 249 usable addresses in 13 batches, with stable
focus and no duplicate Address IDs. The other 29 text matches have no coordinates. SQL
tests verify indexed rowid retrieval, one ranking across continuations, exact filtered
counts, changed-publication rejection and cursor expiry. UI tests cover scroll guards,
stale responses, retry and explicit restart. The live API plus real component/map
fixture exercises desktop and mobile; authenticated admin save remains separate
acceptance. SaanSeoi's `docs/geocoding.md` and Address family processing documentation
define the API and finalisation contract.

### Feature association levels (28 October 2026, Refs #194)

**Locate feature here**, beside **Just use address**, opens the shared association
picker for draft discovery and saved-Feature discovery. Existing associations have
**Change location association**. Opening, previewing or switching levels writes no
identity; the reviewed intent is persisted after Feature Save.

The Address → Premises → Building → Establishment track expresses three independent
evidence states: filled for address-component evidence, filled with an outer ring for a
resolved matching-kind identity, and hollow for neither. The outer ring pulses during
lookup. A central dot denotes selection, with a faint hover/focus dot on other levels.
There is no recommendation state. Unit/floor evidence offers Add establishment without
inferring an occupant. Premises evidence never becomes a Building identity merely
because a building record is absent.

Existing scoped Locations, published Buildings and Places are cross-referenced
independently of discovery filters. Names reconcile after a 250 ms typing pause, with
immediate filtering of retained candidates, using normalized partial matches and a 100 m
circle; candidates require explicit confirmation. Results are bounded, and partial
coverage/provider failure is distinct from a complete no-match. Building address
alternatives remain separate; existing mirrored Place identities are preferred over
duplicate source suggestions. No-match checks stay quiet.

A selected candidate opens Location values / per-component switches / original Address
values. Populated Location values are the default, with original values retained for
gaps. Street IDs, number ranges and translated floor/unit semantics travel with their
structured groups. Both source envelopes are retained. Marker movement requires its own
checkbox. Reviewed placement belongs to the Feature and survives save, reassociation and
source materialization without changing a shared Location's address corrections.

Just use/keep address records Manual intent and does not reconcile Establishments. Named
custom records retain Unlinked intent; explicitly selected matching records retain
Linked intent. These UI modes are separate from Location sharing/ownership and lookup
status. Failed or unfinished lookups preserve failed/deferred status, not a false
no-match. The compact status strip shows discovery kind, selected kind and mode at the
bottom of Address additions. Entity creation/import and association reuse the existing
guarded save/retry paths; retries retain created identities and only replace the
explicitly selected prior Location.

Implementation: `LocationAssociationPicker.svelte`, `LocationAssociationStatus.svelte`,
`locations/association{,Address,Search}.ts`, `locationAssociation.remote.ts`,
`locationAssociationCandidates.ts`, and the draft/saved Feature editor integrations.
English, Traditional Chinese and Simplified Chinese strings are included.

Acceptance evidence: 272 tests pass across the 15-file focused/regression run; two
broader Location service tests fail identically with the saved pre-change files
(rejection fixture parameter mismatch and existing explicit-address-clear behavior).
Svelte checking reports zero errors and 19 existing warnings. The reproducible
`scripts/visual-checks/location-association-check.ts` passes in Chromium and Firefox:
actual discovery/picker components, deferred acceptance, structured component choices,
390 px layout without horizontal overflow, and no page errors. Provider boundaries are
fixtures. Screenshots are local under `output/playwright/association-*`.

Remaining acceptance: no authenticated admin browser session was exposed, so the full
live admin save flow is not browser-verified. SQLite integration covers initial link,
subsequent save and reassociation. The existing publication-refresh worker only scans
source-linked identities: automatic rematching/review of custom records on a future
publication remains a separate outstanding workflow. Persisted lookup states do not
claim that such a background review has been queued. Work remains uncommitted and
undeployed; broad #194/#180 acceptance and completion counts are unchanged.

#### Association picker presentation refinement (28 October 2026)

The visible track runs from most to least specific: Establishment → Building → Premises
→ Address. It is centered with a 768 px maximum width, a 6 px connecting line and 40 px
notches. Examples distinguish venues/shops/businesses/restaurants, named
buildings/towers/blocks, malls/estates/campuses/airports, and address-only placement
when no more specific location applies. The centered title has the subtitle “Select the
most appropriate location”. Notches select the type; the centered actions are “Use
selected location” and “Cancel”.

The toolbar uses a tooltip-equipped settings icon after the association icon.
`LocationAssociationIcon.svelte` is shared with the tiny status list without bullets:
chain with checkmark = Matched location (`linked`), chain = Custom location
(`unlinked`), broken chain = Address only (`manual`). These labels describe the matching
intent, independently of whether a Feature/Location database association has been
persisted. Detaching retains the address and updates its status to address-only;
restoring the association restores its prior matching state.

Validation: the existing 62 picker/discovery tests pass; Svelte checking reports zero
errors and 19 existing warnings. Chromium and Firefox fixture checks cover wide/narrow
layouts, track order/maximum width, all three icon states and the settings tooltip. This
is component browser evidence; authenticated live-admin acceptance remains outstanding
as noted above.

#### Association selection and component review refinement (28 October 2026, Refs #194)

The picker scrolls independently inside the available panel height; confirmation, Cancel
and the compact status remain in a fixed footer. Opening the picker from an accepted
custom record also switches the parent panel back to this constrained layout. The
floating manual-entry action is hidden during association review. Address additions
scroll above their retained status footer. Address-only actions use white text in dark
mode.

Typing filters retained candidates immediately and debounces reconciliation by 250 ms.
Blur does not launch another request: that previously refreshed the result under the
pointer during selection. Late responses cannot replace a newer query. **Use selected
location** requires an explicit candidate (or the Address notch). Creating an unmatched
entity requires **Create premises/building/establishment here**, then **Use custom
location**. Custom mode can return to existing-location search.

Comparison rows use icon, bold value and a smaller component label, with centered
switches under **Use**. Each row has **Edit** for a Feature-owned correction when
neither source is right; **Edit other address details** reveals unchanged components.
Identical addresses show a short agreement message instead of an empty comparison.
Invalid street numbers prevent confirmation. Custom choices retain both source
publications and the selected identity; a custom street drops its source street ID. The
editor's save path no longer clears an explicitly reviewed Location identity when its
Feature address is corrected.

Known premises plus explicit block terminology are split into structured components. For
example, **Hollywood Terrace Tower B** retains its full Location identity name, while
the address stores **Hollywood Terrace** as premises, **tower** as block type, and **B**
as block reference, with no duplicate Building name. Arbitrary named buildings and
conflicting existing block references are preserved. Custom premises and buildings seed
their address component before this normalization. The separate identity-name editor is
now reserved for Establishments, avoiding duplicate Building and Premises inputs.

Verification: 84 focused tests pass, including association selection, search, SQLite
services, source preservation, custom corrections and component parsing. Two broader
3D-input tests fail identically when loading the pre-change AddressDetails component
(immediate normalization expectations); they are unrelated to these picker changes.
Browser fixtures pass in Chromium and Firefox at 1500 px and 390 px: live matching
without blur, explicit custom acceptance, corrections, scrolling with a stationary
footer, dark-mode text, parsed building components, reopening custom associations, all
three status icons and schema validation. Provider responses are fixtures; authenticated
admin save remains unverified.

#### Compact association search and adaptive map space (28 October 2026, Refs #194)

The selector displays distinct shop, building, campus and street-address icons. A
retained published Address identity now gets the resolved outer ring. Help uses the
agreed friendly explanation of address specificity, automatic address updates and
discovery on Location profiles. Address-only preview reuses the header display address
component. Diagnostic metadata stays hidden throughout the picker and appears in the
address-component editor after acceptance.

Search is a centered, bounded row with the type label before the input and a spinner
inside its trailing edge. The searching status remains accessible without visible status
text. Unresolved types explain why to search or create; the redundant results heading
and separator are removed. Browsing results always offers **Create new
premises/building/establishment** in the footer instead of disabled confirmation. A
completed empty lookup adds **No results, you can**. Explicit creation stages the custom
record directly; selecting an existing candidate still requires reviewing and confirming
it. Provider failure never claims a complete no-match.

**Back to results** is restored to the selection header. Cancel returns a draft
association to its retained discovery results. The development-draft notice overlays the
map instead of consuming vertical layout space.

The picker measures intrinsic content and requests additional editor space when its
requirements change. The shared visual section slides up only as far as needed, retains
at least 64 px of visible map (including mobile layouts), and never grows back
automatically when content becomes shorter. Drag/keyboard resizing takes priority over
queued automatic measurements so the user can restore the map while the picker is open.
Ordinary scrolling does not resize the map.

Premises lookup currently reads accessible HYPE Location records of kind `premises`
within 100 m; it has no SaanSeoi premises/group provider. Empty results therefore do not
establish a globally empty catalogue. SaanSeoi retains site/complex vocabulary in
`libs/db/src/premises.ts`, while address `premisesName` remains component evidence. A
future integration should consume stable, independently identified premises/site records
with explicit membership relationships to buildings; it must not promote an address name
or a proximity cluster into an established group identity. This future provider is not
implemented by this UI refinement.

Validation: 65 picker/discovery tests pass. Chromium and Firefox fixture checks cover
wide and 390 px layouts, the four icons, Address ring, metadata visibility, live
filtering, empty-result creation, reviewed corrections, Cancel/back navigation,
scroll/footer stability, the visible 64 px map minimum and manual restoration during
review. Provider boundaries and the map content are fixtures; the actual picker and
visual resize components are exercised. No authenticated admin browser was exposed by
the current browser inventory, so full admin/map integration remains unverified.

#### Association evidence track and map result continuity (28 October 2026, Refs #194)

Icons and labels appear above the track, with examples below. Notches stay hollow: green
double rings denote resolved matching-kind records, amber outlines denote
address-component evidence, and neutral outlines denote absent evidence. A bright pink
center dot denotes the user's selection; unselected available levels retain only a faint
dot. Lookup pulses and textual tooltips remain, so color is not the only state cue. The
picker footer has no horizontal separator.

The unresolved message separates **No confirmed match yet.** from the smaller action
**Search nearby records or create a new location below.** This avoids declaring that no
record exists while plausible candidates are being reviewed.

Association rows and map markers now share one-based result numbers. Pointer hover and
keyboard focus highlight the corresponding marker. Clicking a candidate marker opens
component review, without accepting the association or moving the Feature's pin. While
association review is open, the picker owns the marker set so the parent discovery
effect cannot replace it with stale search markers. The original pin is retained
separately; the marker comparison uses the same candidate numbering.

Back to results and Cancel restore the map height captured before automatic fitting,
with the same sliding transition. They do not impose a fixed viewport percentage.
Ordinary acceptance and switching to shorter content continue to retain the fitted
height. Saved-Feature discovery and new-Feature discovery both receive the marker and
map-restoration callbacks.

Building association candidates combine accessible HYPE Building Locations, retained
search results, and name matches from SaanSeoi's published building names/detail
catalogue. Candidates are filtered to within 100 m of the original address. An empty
query can show nearby HYPE/cached records; new catalogue requests require a name.
Different published address alternatives remain separate candidates, so repeated
building names do not necessarily mean duplicate identities.

Validation: 73 focused picker, discovery and association-search tests pass; Svelte
checking reports zero errors and 19 existing warnings. Chromium and Firefox checks pass
at wide, 390 px and 320 px widths, including numbered hover/focus markers, marker-click
review and restoration of the prior map height. Browser verification uses actual
picker/visual components with fixture provider and marker boundaries; it does not
establish authenticated live-admin acceptance.

#### Provisional results and compact association review (28 October 2026, Refs #194)

The association heading and subtitle live in the Location toolbar. Type icons, titles
and descriptions precede the hollow track. Address evidence uses an amber inner ring,
resolved identities add a green outer ring, and the selected level has a pink center
dot. The action footer has additional bottom space; address metadata has no separate
panel background.

The no-match status and search/create guidance appear centrally in the empty results
area. Typing immediately filters retained candidates where possible; an empty filtered
set does not clear the previous results while providers are still responding. A settled
empty message remains visible during the next lookup. Late responses cannot replace
results for a newer query.

A provisional custom Location appears as a preselected result alongside possible
matches. Its record name and identity are independent of the search query. Reset
restores the original query and preselects that record; **Use Location** confirms it.
Explicit creation first adds a provisional row and requires confirmation. Selecting an
existing local record retains its identity. Synced, custom and manual Locations have
distinct icons/labels and source-backed rows use solid borders. This record provenance
is separate from the Feature's association intent.

Every explicit discovery selection captures the map height, including **Just use
address**. Back/Cancel restores that snapshot; resumed drafts without a snapshot use 35%
of the available editor height. Pointer hover takes precedence over a previously focused
row and keyboard highlighting resumes after mouse leave. Grouped-address markers fit to
their own bounds with 20% padding on each edge, independently of the Feature pin.
Association candidate sets also carry a fit-group identity so their map treatment
follows the reviewed subset.

Verification uses `location-association-picker.test.ts`,
`draft-feature-location-search.test.ts`, `location-association-search.test.ts`,
`location-association.services.test.ts` and
`scripts/visual-checks/location-association-check.ts`. Chromium and Firefox exercise
actual components at wide, 390 px and 320 px widths, including provisional reset,
immutable names, direct-address Back, footer scrolling and map-height restoration. The
Chromium grouped-address check uses the actual MapLibre renderer, asserting marker hover
and projected edge padding. Its basemap did not render, so that check proves
marker/camera behavior only. Provider responses are fixtures; authenticated admin
persistence remains unverified. No broad importer acceptance is implied.

The reproducible browser scope for this refinement is
`ASSOCIATION_SCOPE=provisional bun run scripts/visual-checks/location-association-check.ts`
(with the local base URL/browser paths configured). It excludes the independently
changing address-component editor. The four focused suites passed 79 tests before those
concurrent editor changes; final targeted verification rechecked five
provisional/evidence/marker regressions and three Location service tests. Whole-app
Svelte checking finishes with zero errors and 19 existing warnings. Broader
comparison-editor acceptance remains separate.

#### Sync-state vocabulary and viewport restoration (28 October 2026, Refs #194)

User-facing association states are **Synced**, **Open to Sync**, and **Not Synced**. The
existing persisted values remain `linked`, `unlinked`, and `manual` respectively. A
primary-colour chain denotes Synced, a foreground-colour chain denotes Open to Sync, and
a broken chain denotes Not Synced. A local Location ID alone does not prove a source
match; a published Places/Building identity or upstream `ssId` does. The draft toolbar
shows the current state and the action suffix **- toggle to sync** or **- toggle to
unsync**. Turning sync on chooses Synced only with source identity; otherwise it chooses
Open to Sync. Turning it off preserves the reviewed address, Location kind and name, and
re-enabling it retains the selected identity and edits.

Multilingual controls appear only while editing address details or names (updated 29
October 2026); selecting or preselecting a record alone does not reveal them. Search is
a single centered field with an inline search icon, pending spinner and Reset control,
without the former wrapper background, repeated label or bottom rule.

This supersedes the earlier snapshot-first Back behavior: returning to discovery
explicitly restores the map to **35% of visible editor height**. The visible budget uses
the window height minus the editor's on-screen top; the scrollable form's full content
height is not a viewport measurement. An explicit return height takes precedence over
any retained pre-review snapshot.

Chromium/Firefox component checks cover current-state icons, tooltips, both sync opt-in
paths, editing-gated Multilingual, the search layout and proportional map restoration.
These remain fixture checks; authenticated admin persistence is not established by them.

#### Selected Location editing (29 October 2026, Refs #194, parent #180)

Search-list map sizing correction: result count and asynchronous search updates must not
shrink the map. The list uses the available scroll viewport; only selected record
review/editing may request extra map space. Chromium and Firefox checks with 30 results
retain the initial 300 px map height and confirm the list can scroll
(`ASSOCIATION_SCOPE=map-results`). All 22 picker tests pass. The user's authenticated
admin page is not exposed to browser tools, so live-page acceptance remains open.

Association result rows group distance and the compact sync-state badge on the right,
leaving names and addresses room to wrap. Selecting the original Location does not
compare it against itself or show a two-record agreement message. **Edit address
details** opens one set of editable fields for that Location. Distinct records with
differing address components retain the source-choice comparison. Corrections remain
Feature-owned overrides and preserve the selected Location identity and canonical source
values.

Multilingual is an editing control, not a selection indicator: it stays hidden in result
browsing and read-only selected-record views, and appears after entering address or name
editing. This supersedes the earlier selection-only condition.

The 22 focused picker tests pass, including direct Location editing, preservation of
identity, and editing-only Multilingual. Svelte check reports no errors and 19 existing
warnings. Chromium and Firefox component fixture checks pass for right-aligned result
metadata, editing-only Multilingual, single-record editing, identity-preserving address
overrides, and narrow layouts without overflow. Authenticated admin persistence remains
unverified; broad acceptance counts on #194 and #180 are unchanged.

#### Ghost entries and Feature naming policy (29 October 2026, Refs #194, parent #180)

This supersedes the two-step custom-Location creation described above. A dashed entry
immediately below search previews the authored name and address, explains that the
record can be matched as data coverage improves, and offers a single **Use this …**
action. It does not promise automatic reconciliation. The ghost is not repeated in the
result list or a second confirmation card. Camera fitting ignores selection-only changes
and skips coincident association positions.

The full-width specificity selector has a recessed background and 24 px vertical
padding, a centered maximum-width four-item track, animated expansion, and horizontal
top-right legend/collapse controls. Neutral rings mean unspecified, blue means address
evidence, and emerald means a known match; primary marks the chosen level. Comparison
headings are **Chosen address** and **Matched record**; pins are **Chosen position** and
**Match position**. Inline edits retain icons, hide the type subtitle, and return to
text on blur with stable horizontal padding.

Project flags `allowFeatureDescriptions` (default true) and `locationBasedFeatureNames`
(default false) control Feature authoring. Layer metadata can explicitly override either
flag; absent/null means inherit. Turning off description authoring hides its Profile
fields and retains existing stored descriptions on save. It does not delete historical
content.

Location naming uses the existing record-level
`featureLocation.acceptancePolicy.nameMode`, not a second ownership model. Profile
offers Location naming when every title is empty. Inherited titles follow edited
Location translations, become read-only in Profile and link to **Edit Location**. When
parent policy permits it, the Feature can return to independent naming. Link/relink and
normal saves persist that intent; parent-required inheritance wins over submitted
independent intent. These settings apply during authoring and linking; this change does
not bulk rewrite existing Features when a Project setting changes.

Hydrated Feature list and admin responses include an `authoring.nameMode` read
projection of association ownership. Parent policy is not copied into Features: the
editor resolves Project flags and Layer metadata from the app's shared,
authorization-scoped ResourceDetail/CacheCtx through the hierarchy read-or-fetch
helpers. Navigation waits for those cached parent records before settling. Core Profile
does not fetch the full Location association; Location editing still loads that detailed
model. The minimal `compact` identity response does not carry naming data. Refs #194.

Search remains bounded to 100 m, with at most 50 building-catalogue candidates per query
and 20 upstream establishment text candidates. A limited/partial warning is not an exact
total or proof that further matches exist.

Validation: 65 focused policy, form, association and picker tests pass. Chromium and
Firefox component fixtures pass at desktop, 390 px and 320 px, including the one-step
ghost flow, wrapping names, hover highlights and real MapLibre camera bounds. External
map tiles return HTTP 401 in the fixture environment. No connected authenticated admin
session is exposed, so signed-in Profile/settings acceptance and full admin persistence
remain unverified. The broader Location suite still reports unrelated source-endpoint
expectation, identity-rejection fixture and address-clearing failures. No migration,
commit or deployment is included; #194/#180 importer acceptance counts remain unchanged.

#### Exact association matches and ranked alternatives (29 October 2026, Refs #194)

For a uniquely inferred match, **Use Location** appears directly in the selected
Location row beside Change selection. It uses the same validation and acceptance path as
the footer action, without duplicating that action below; **Cancel** stays in the fixed
footer. Explicitly selected alternatives retain the footer Use action.

Association review compares meaningful localized components rather than storage IDs,
optional empty flags, or range formatting. Translation-only enrichment does not force a
choice between visibly identical fields. A unique complete match of kind, name, street,
number and remaining components within 100 m preselects the matching kind and candidate,
unless the user already chose a level or opted out. A blue outer ring and explicit
suggested-Location caption distinguish this inference from a chosen identity.
Confirmation remains required; lookup completion never saves. Incomplete coverage and
ambiguous exact matches retain manual selection.

Alternatives sort by evidence score (40 for an exact localized name, 30 for street, 30
for number, minus 5 for each other differing component), retaining distance order for
ties. This is a transparent ranking score, not a probability. Every row has a visible
Use action; the custom-record action is compact and fixed below the list, with Cancel
still available. Reopening/reselecting the same identity retains its name-inheritance
intent, and a Feature with an existing independent title can still explicitly choose its
Location name.

Automatic future-publication rematching remains separate. The next-thread brief is
[Open to Sync rematching handoff](../../../docs/refactor-guides/Open-To-Sync-Rematching-Handoff.md).

#### Unused address parts and review rhythm (29 October 2026, Refs #194)

Compact comparison rows require a visible value in either source or the edited result.
Metadata-only differences such as an unused block type must not produce two empty cells.
Expanded details offer a small **Hide unused parts** action; collapsing preserves newly
authored values and source selections.

Map marker choices and their switch share one aligned row, with the title and distance
above the central control. Selected markers use the same muted surface as selected
address cells. Ghost entries retain the content maximum width and place their action at
the right, wrapping below the text on narrow screens.

The thread audit also restored the empty-titles-only naming prompt and active locale
first in the separate multilingual name editor. Remaining acceptance work includes a
complete independent Feature-title/Location-name editing flow, parent naming-policy
precedence for already-independent records during later source projection (current
projection respects stored record intent), and authenticated admin settings/save
verification. Future automatic matching of ghost records must not be claimed solely from
their eligibility for matching.

#### Field-oriented Profile and comparison clarity (29 October 2026, Refs #194)

Profile groups Title and Description into field columns, with the active locale first
and attached translations revealed by a header toggle. Collapsed locale controls remain
mounted to preserve remote-form registration. Translation actions operate on one field;
HumanVerified controls remain attached to their fields. Inherited titles carry a
read-only badge, an explanation, and Edit Location. A separate-name action is available
when parent policy permits. Persisted intent remains
`featureLocation.acceptancePolicy.nameMode` (`inherit` / `independent`).

Association comparisons default to the matched coordinates when available and label
positions by kind. Selection alone no longer emphasizes comparison markers; hover/focus
does. Known matching-kind evidence survives kind switching, ring hover scaling is
reduced and animated, and sublist Back lives in the search header.

Validation: 28 picker tests and 2 Profile tests pass; Svelte check reports zero errors
and 19 existing warnings. Chromium Profile fixtures were inspected at 1200px and 390px,
including inherited titles and expanded translations. This is component evidence, not
authenticated admin persistence acceptance. The broader discovery suite currently has 10
failing assertions requiring reconciliation with concurrent selection/creation changes;
it is not reported as passing.

Accessibility field presentation (29 October 2026, Refs #194): Access hints and mobility
selectors use the same panel background, 48 px control height, foreground text and
typography as the surrounding address controls. Dropdown surfaces follow the panel theme
too. This replaces the default filled form styling previously left on these separate
rendering paths. Chromium and Firefox fixture checks verify both light/dark themes,
matching computed surfaces and font sizes, and working selection; wide/narrow
screenshots were inspected. Svelte check: zero errors, 19 existing warnings. No change
to accessibility values or persistence.

## Background Open to Sync rematching (29 October 2026, Refs #194)

Tracking: [#194](https://github.com/tijptjik/hype/issues/194), parent
[#180](https://github.com/tijptjik/hype/issues/180). The implementation lives in
`src/lib/db/services/locationRematch.ts`, with migration `0157_location_rematching.sql`,
the existing Location refresh Worker, and the existing Tasks projection. This section
supersedes any assumption that persisting `association.lookup = deferred` alone queues
work.

Opt-in is the persisted **Feature** `addressMeta.address.association.mode = unlinked`,
not the shared Location's `manual`/`unresolved` state. A manual Location may be private
while its owning Feature opts into matching. One Feature's `manual` intent neither opts
other Features out nor authorizes adoption into that Feature. Missing intent is not
opt-in. Archived/draft Features, inaccessible Locations, redirects, existing upstream
identities, and mismatched kinds are excluded. The full authored address, association
version, Feature edit token, ancestry, owner, Location revision and identity-history
tail form the retained intent snapshot.

The Worker polls canonical Places publication metadata daily, independently of the
existing linked-identity refresh cadence. A forward publication creates a new
generation; identical publications do not duplicate work. Daily keyset sweeps also find
newly authored opt-ins. Each step seeds at most 25 eligible Features or advances one
lookup stage. A cron invocation drains at most ten steps and starts no further step
after a 60-second budget; an in-flight source request finishes under its existing
timeout and lease. Nearby discovery covers 100 m with the existing bounded
cell/page/candidate limits (at most 50 candidate identities); canonical verification and
optional Address hydration process one candidate per invocation. No whole Location or
source catalogue is loaded. Database-clock leases, publication generations,
authored-intent fences and atomic review/receipt/cursor writes make interruption and
replay safe. Candidate receipt IDs depend on source identity, not result ordering.

Names use the existing localized normalization; structured address agreement ranks above
distance. Number ranges and individual entrances remain different evidence. Matching
names and proximity produce proposals, never identity proof or automatic acceptance.
Multiple plausible identities remain separate ranked review tasks. A candidate retains
publication, source identity, evidence score, distance, address conflicts, proposed
identity-only changes, provenance and concurrency tokens.

**Coverage boundaries:** canonical establishment evidence can use the existing guarded
identity promotion/merge workflow. The nearby discovery index does not attest to an
immutable publication's complete coverage, so even a successful candidate carries
incomplete-coverage information; an empty result is deferred, never a definitive
no-match. Buildings and premises are deferred with `PROVIDER_UNAVAILABLE`. The current
interactive Building export importer requires a complete name catalogue and explicitly
does not implement Places identity promotion; it is not silently repurposed for this
bounded worker. Supporting Building rematching requires bounded publication discovery
and a reviewed Building identity transition contract. Missing coordinates or names and
provider failures retain separate reasons. A missing premises provider is never absence
of a matching premises.

Tasks reuse `locationIdentity`/`locationMerge` and the existing review editor. Deferred,
failed and in-progress lookups appear in that same queue, with owner-authorized retry.
The candidate tasks are restricted to their originating opted-in Feature. Acceptance
rechecks intent at the final transactional write as well as on read; explicit merge
reviews use the same fence. Existing Location authority, source-identity uniqueness,
optimistic concurrency and audit history remain authoritative. Promotion retains the
custom Location ID where unoccupied; occupied identities require explicit merge review.
It does not adopt source names, move pins, alter selected addresses, change Feature name
mode, or rewrite accepted Feature snapshots. Automatic source/local adoption and
automatic placement cannot override explicit Feature opt-outs.

Rejection suppresses that source identity for the same Feature, Location and authored
intent across retries and later publications. Retry does not clear a rejection. Changed
authored intent or Location revision establishes a new comparison baseline; explicit
interactive source review remains the deliberate reconsideration path. New publication
generations invalidate prior proposals until recaptured. Publication chronology
conflicts hold the pipeline and invalidate actionable background reviews.

### Rematching operations and recovery

Apply migration 0157 before running the updated application or Worker. It adds durable
state and views without rewriting existing rows. Source deployments/publications are not
required to validate the local integration. Structured Worker logs report
`task: location-rematch` and a phase, without coordinates, source payloads or
credentials.

Use these read-only probes on the intended environment:

```sql
SELECT generation,scanning,cursor,checkedAt,leaseUntil,failures,retryAt,lastError
FROM locationRematchRun WHERE id=1;
SELECT status,reason,count(*) FROM locationRematchCurrent GROUP BY status,reason;
SELECT generation,count(*) FROM locationRematchReview GROUP BY generation;
```

Discovery/storage failures use exponential backoff; per-Feature failures start at five
minutes and stop automatic retries after five attempts. Unavailable coverage retries
daily, also capped at five attempts. Task retry resets the current eligible lookup's
attempt budget, preserving rejection receipts. A healthy expired lease is reclaimed on
the next invocation; never force-release an active lease. An interrupted candidate batch
rolls back completely. For a publication chronology hold, investigate the canonical
release/catalogue metadata before requesting rediscovery; do not edit pins or advance
generations to bypass it. Daily discovery retries the chronology check. Old jobs and
immutable reviews remain audit evidence, while current views exclude stale intent.
Retention pruning is a separate operational policy, not part of retry.

The local migration was rehearsed on a database copy and then applied as the sole
pending migration after a backup. Existing rows and hashes were preserved: 1,656
Features, 1,368 associations, 1,448 Locations and 2,062 revisions; integrity and foreign
keys passed. There are currently no persisted Open to Sync associations in that local
database, so it is not live rematching acceptance evidence. Migrated SQLite/D1-adapter
tests exercise publication-to-review-to-acceptance, concurrency, retries, rejection,
shared opt-outs and bounded batches. Chromium and Firefox exercise the actual review and
retry components with fixture APIs, including save/reopen and 390 px layout.
Authenticated admin acceptance remains unverified because no authenticated browser
session is exposed. See #194 for the current scoped verification results and blockers.

The proposed next iteration is documented in
[Profile locales handoff](../../../docs/refactor-guides/Profile-Locales-Handoff.md):
inline locale-prefixed editing, header translation controls, reorderable locale
visibility, Organisation defaults and Project overrides, and the required dynamic
content-locale persistence work. This remains a proposal, not implemented acceptance
evidence (Refs #194).

The locale foundation uses the
[LLM 1 content-locale contract](../../../docs/refactor-guides/profile-locales/01-contract.md):
canonical content tags remain separate from compiled UI locales; ordered
`settings.contentLocales` on Organisation and Project replace inherited defaults without
touching Project boolean flags. Migration `0158_content_locale_settings.sql` adds the
two JSON-object columns and must precede deployment. Existing form writes accept an
optional settings patch, preserve unrelated keys, and remove `contentLocales` on
explicit null reset under the existing resource authorization and concurrency guard. The
maintained catalogue controls new default choices, not which stored record translations
may survive. Feature/Location content migration and rendered Profile/Advanced acceptance
remain separate workstreams (Refs #194).

The
[LLM 3 locale-control contract](../../../docs/refactor-guides/profile-locales/03-contract.md)
defines the controlled toolbar and Organisation/Project Advanced editors. Shared
settings require explicit override/reset intents; opening Advanced never persists a
resolved default. Profile visibility is presentation-only, with independent selected
order and enabled subset. Search, duplicate reveal, pointer/keyboard/touch reorder,
last-visible protection and inherited-order display are covered by fixtures. The
combined UI/model/settings-service run passes 56 tests; Chromium and Firefox fixture
screenshots at 320px, 390px and desktop are verified with reduced motion and no
horizontal overflow. Authenticated Advanced save/reload remains unverified because
browser inventory exposes no existing session. Feature Profile integration belongs to
LLM 4 and final acceptance to LLM 5; this work does not close #194 or its parent.

Feature Profile Title/Description fill (29 October 2026, Refs #194): use the panel
surface for all locale input/textarea shells, matching the lighter address inputs. The
scoped profile rule retains existing borders, focus and validation styling. Chromium
fixture verification confirms all six locale control fills match the panel in light and
dark themes; screenshots inspected.

### Dynamic authored content persistence (29 October 2026, Refs #194)

Feature translations and translatable property values use validated dynamic locale maps,
independently of compiled interface languages. Boundary adapters consume the canonical
content-locale model, retain legacy Chinese form/storage keys, and reject normalization
collisions. Saves upsert submitted locale fields and retain omitted locales; explicit
empty values clear content. Feature read, editable-copy, import and Task projections
preserve additional languages and verification flags. Location name materialization
projects available source languages and keeps missing translations empty; independent
Feature titles and unrelated descriptions survive older-client saves. Existing
address-language generation remains scoped to its current languages.

The single-field translation remote returns translated, unsupported or error results.
Manual storage does not depend on provider support. Client fanout and draft recovery
remain separate integration work. The
[persistence contract](../../../docs/refactor-guides/profile-locales/02-contract.md)
defines form shapes, empty semantics, provider signatures and required recovery behavior
for the Profile editor. No translation-row migration is required; the read-only
`scripts/i18n/audit-content-locales.ts` checks actual SQLite constraints and
normalization collisions before any future conversion. Shared settings migration
coordination remains with the locale-model assignment.

### Profile locale integration (29 October 2026, Refs #194)

The
[LLM 4 integration contract](../../../docs/refactor-guides/profile-locales/04-contract.md)
wires ordered content defaults and the controlled toolbar into Profile Title and
Description. Inline rows retain registered controls, rich-text display and field
verification while locking inherited titles. Header source actions fill all empty
selected targets, including hidden rows, with bounded requests and source/target/edit
revision guards. Record reset invalidates pending work; development draft recovery
retains full dynamic values plus separate locale order and visibility.

The combined focused run passes 94 tests; Svelte checking reports zero errors and 19
existing warnings. Chromium/Firefox fixture checks at 320px, 390px and desktop pass with
screenshots inspected. Authenticated save/reload and live provider execution remain
unverified because browser inventory exposes no existing session. This does not close
#194 or #180; the contract identifies the remaining LLM 5 acceptance checks and
reproducible artifacts. No persistent migration or deployment was performed.

### Profile locale integration acceptance (29 October 2026, Refs #194)

The integrated locale/Profile working tree has 596 passing checks and two reproduced
Location service baseline failures across the 20-file acceptance suite. Both Chromium
and Firefox pass Profile and locale-control fixtures at 320, 390 and 1440px. A new
SQLite bridge test connects Organisation defaults, hidden-target bulk translation, draft
recovery, dynamic form validation and save/reload with verification retention. The ten
stale discovery assertions have been reconciled with the current selection contract.
Svelte check reports zero errors and 19 existing warnings.

See the
[integration acceptance report](../../../docs/refactor-guides/profile-locales/05-acceptance-report.md)
for reproducible failures and evidence boundaries. Authenticated Advanced/Profile
save/reload and live-provider execution remain unverified; no broad acceptance or
leaf-completion count is advanced by fixture coverage.

Profile locale review follow-up (#194 / #180): language search uses an opaque portalled
overlay; regional Chinese choices are retired from search while old settings remain
writable, and Cantonese/yue search resolves to Traditional Chinese. Organisation
visibility submits through SvelteKit's bound hidden-field API so changing locale
settings does not hit `form_field_unbound`. See
[acceptance evidence](../../../docs/refactor-guides/profile-locales/05-acceptance-report.md)
for focused checks and the still-unverified authenticated persistence boundary.

Multilingual presentation defaults (#194 / #180) use optional boolean
`settings.multilingualContent` and `settings.multilingualAddresses` in the existing
Organisation/Project settings JSON. Each key resolves independently: Project,
Organisation, then false; explicit false is an override. The existing authorized
settings patch accepts null to remove one override, preserves unrelated keys, and
registers the whole JSON transport through the remote form binding. No migration is
required. Advanced > Languages exposes both switches and per-key resets.

An explicit Feature editor multilingual toggle is account-scoped, transient state owned
by AdminCtx. It survives next/previous Feature navigation and Profile/Location facet
remounts, taking precedence over each facet's separate initial default. Record language
membership/order and translation content remain record-local. Profile translation-source
controls are available only in multilingual edit mode.

Advanced language settings use “Default Languages” with Organisation-specific help.
Opening Edit does not create an override; a changed ordered list exposes reset. Add
language remains visible at the end of the locale toolbar. Boolean reset controls
reserve their space to avoid moving switches when overrides change. See the acceptance
report for browser coverage and remaining persistence checks.

### Saved Feature address and Updates separation (29 October 2026, Refs #194, parent #180)

Saved Features use the same compact Location-name/address/coordinate toolbar as accepted
new drafts. The Location tab contains address selection and editing; it no longer
inserts lifecycle, accepted-reference diagnostics, brands, or source administration
above the address columns. The connection status links to Updates. Saved Location
visibility is managed on the Location record rather than presenting the new-draft
visibility default as if it were persisted state.

The saved-only **Updates** facet (`#updates`) owns pending Location tasks, explicit
latest-local review, source identity matching, reset-to-Location drafts, brand
inheritance, and disconnection. It mounts on first visit and retains drafts across tab
changes. Matching and reset/disconnection tools remain progressively disclosed. Review
preparation and unlink retain dirty-form and expected-version guards; merely opening the
tab does not accept a revision or create a review.

A known operating/building status appears as **Location status** in Updates and links to
the owning Location record. Unknown status is omitted. Location lifecycle does not
assert whether the Feature still exists, so it does not get a separate Feature Lifecycle
tab. The local `lifecycle-demo-e-feature` (permanently closed establishment) and
`lifecycle-demo-f-building` (demolished building) illustrate this boundary. No new
persistence or policy model is introduced.

### Feature revision integration design

The
[resource revision implementation plan](../../../docs/refactor-guides/Resource-Revisions-Implementation-Plan.md)
defines the Feature contribution boundary. Independent proposals retain their base and
submitted revisions. Acceptance merges against the inspected published head and
publishes atomically; rejection preserves evidence without changing public content.
Location adoption must retain its existing source/correction evidence and pass through
that same publication boundary when the revision rollout is enabled.

Ordinary revision parents remain within one Feature identity. Merging or splitting
Features uses explicit multi-identity input/output lineage with revision guards on all
sources. This does not merge upstream Location identities or redistribute operational
history automatically. Gallery snapshots pin image metadata and immutable file versions;
removal from a gallery does not erase earlier associations or files.

Staff saves apply accepted content directly and record attributed history while
preserving publication state. Published/unpublished controls visibility only. New staff
records and split successors begin unpublished, without staff draft proposals. External
contributions remain proposed changes reviewed in the task queue; the Feature's History
tab is read-only. Gallery ordering and captions are edited in Images.

Gallery sorting controls retain their place while an image-intent save is pending;
temporary write restrictions disable the controls without removing the rail. Image
publication is derived from the selected intent, including Catch-All assignment when
accepting unclassified photos. Unavailable intent identities return a validation error
before any image or assignment writes. The
[review UI check](../../../scripts/visual-checks/task-image-review-check.ts) and
[image transaction tests](../../../src/tests/image-edit-transaction.services.test.ts)
cover these boundaries.

The title menu opens Split (two names and an optional redirect) or Merge (same-layer
search, side-by-side values, inline text editing and photo selection). A split copies
content into two new identities and unpublishes/archives its source. A staff merge
preserves the primary identity and visibility, and archives the secondary. Tasks, visits
and their evidence remain attached to their original identities. The task queue's
Duplicate action either discards the contribution with an attributed rejection or merges
it into an existing primary and completes review in the same atomic batch. Selected
photos retain immutable revision pins and original attribution; Last Seen keeps the
latest inspected observation date rather than the operation date.

Merge redirect choices live on `featureRevisionHead.redirectFeatureId`. A split's
optional choice lives in its immutable
`featureIdentityOperation.dispositions.redirectFeatureId`, linked to the source by the
input operation member. Public resolution follows only that chosen chain and checks
current destination visibility and hub scope on every request. Publication activates the
redirect; unpublication suspends it without changing the stored choice or requiring a
background job. Migration 0199 permits unpublished active merge survivors. Retired
identities retain history while their active Location/property/gallery projections are
removed.

Organisation-owned field definitions now have catalogue revision capture in the existing
organisation form and independent option-append API (migration 0176). This preserves
definition/option identities, translations and order for audit, including removed
definitions. It does not restore feature answers removed by existing field-deletion
behavior or enrol hub/project catalogue writers. The
[resource revision implementation plan](../../../docs/refactor-guides/Resource-Revisions-Implementation-Plan.md)
records the integration boundaries and local rehearsal.

The strict `feature-content/v1` snapshots preserve translations, property storage,
accepted Location references and immutable image pins. Contributor acceptance updates an
already-published Feature and cannot reactivate an unpublished identity. Staff Save
remains separate from Publish. Approved maintenance while unpublished records a private
capture without publishing. Shared Location name/phone/brand corrections require their
own Organisation review.

The
[write-boundary guide](../../../docs/refactor-guides/Feature-Revisions-Write-Boundaries.md#application-integration-and-activation-boundary)
records the remaining activation requirements: verified legacy-media baselines, full
cutover rehearsal, relationship reassignment policy, and an attributed replacement for
legacy bulk imports where required. Migrations 0184–0190 and browser verification have
only been exercised on isolated fixtures/copies; this does not enable live Feature
recording or complete the broader #194/#180/#213 acceptance criteria.

### Feature identity relationship boundaries (Refs #194, parent #180)

Accepted Feature merges and splits publish all outputs atomically with reviewed
open-task assignments. Merge review defaults each task to the surviving identity; split
review requires an explicit output, including tasks that stay on a retained original.
Visits and completed tasks remain on their original Feature. Merge wishlists move to the
survivor with duplicate links combined and visit history preserved. Split wishlists
remain attached to the original identity and show public successor guidance.

Import crosswalks retain their original Feature IDs. A mapped Feature may later be
merged or split; identity publication does not rewrite crosswalks or infer a new
mapping. This policy does not authorize importer replay to overwrite reviewed Feature
content.

Migration `0191_feature_identity_relationships.sql` records immutable task moves and
photo-proposal forwarding. Forwarded proposals retain the original upload and
contributor, use the selected output revision as their base, and carry only the photo
gallery change. Draft task evidence remains private until submitted. Legacy task photos
without verified revision evidence require enrollment before reassignment. See the
[Feature write-boundary guide](../../../docs/refactor-guides/Feature-Revisions-Write-Boundaries.md)
for writer coverage and activation prerequisites; live enrollment remains separately
gated.

### Revision-aware Feature import and legacy enrollment (6 November 2026)

Refs #194, parent #180; Feature review integration also relates to #213.
`scripts/breadline/features.ts --revisions` is the attributed offline writer after
Feature revision cutover. It commits new identities, owned relations, Location
associations, stable crosswalks and initial revisions together. Unchanged source replay
preserves reviewed content and creates no extra revisions. Retired mapped identities
remain mapped directly; the importer neither follows redirects nor chooses split
successors. Changed accepted source hashes still require explicit reconciliation.

The legacy SQL planner remains guarded for fresh rebuilds. Verified media enrollment and
activation are separate commands, so installing schema or replaying an import does not
silently enroll existing Features. Missing exact versioned media evidence blocks the
affected Feature; pending task photos retain their author and review state. Local
activation completed after database-refresh coordination and a fresh rehearsal: 1,647
legacy Features and 2,093 images are enrolled, with new-Feature revision creation
enabled. Subsequent explicitly authorized recovery enrolled all four previously blocked
Features, including the book, with seven marked empty metadata baselines and verified
original bytes. No local Feature remains unenrolled. Missing sidecars outside Feature
galleries/tasks are a separate media follow-up. Existing publication/review state and
normalized projections remain unchanged; production is unchanged. The
[write-boundary guide](../../../docs/refactor-guides/Feature-Revisions-Write-Boundaries.md#verified-local-enrollment-tooling-6-november-2026-refs-194--180--213)
contains commands, evidence coverage and remaining media exceptions.

Organisation, project and hub logos also retain immutable image-content and metadata
pins in their resource revision histories (migration 0197). Shared-logo edits capture
all affected resource owners atomically and require their editing permissions. Legacy
history remains identity-only until an exact baseline is verified; it never substitutes
the current image for missing historical evidence. See
[the resource revision implementation plan](../../../docs/refactor-guides/Resource-Revisions-Implementation-Plan.md).

### Contribution and duplicate review (Refs #194, #213)

Contribution review presentation (Refs #194, #213): new Feature reviews reuse the
Profile visual and description layout, with inline photo selection and a separate
contributed address. Resolve duplicate opens one button-origin dialog that morphs from
compact search into a Discard / Keep comparison. Categories load their allowed catalogue
options, while translated field edits and per-photo intents are validated server-side
before the existing atomic merge. The kept identity remains explicit on the right; photo
movement retains immutable revision pins and attribution.

## Merge review consistency (9 November 2026, Refs #194)

Feature merge placement selection carries localized addresses with the chosen geometry
and association. Shared inherited names and phone fields follow that same inspected
Location; names and descriptions unrelated to the placement retain their selected
values. Missing address languages are cleared instead of retaining another location's
address.

Location merge dependency evidence includes intermediate membership revisions and their
canonical endpoint mappings. A graph change invalidates the prior review before a merge
can introduce a transitive membership cycle. Feature split execution retains its
existing atomic retirement, unpublished successors, and explicit redirect choice.

## Complete geographic catalogue (10 November 2026; Refs #194)

The division mirror is a complete SaanSeoi geographic inventory, independent of Feature
memberships. An unused division must remain available for a new marker, locality
selection and polygon highlighting. Migration `0208_complete_division_catalogue.sql`
adds separate catalogue completeness and staging state to the fenced refresh worker.
Existing partial mirrors repair automatically, even when no Feature jobs are queued.

The worker imports bounded pages pinned to both the selected release and API catalogue
revision, validates page totals and area relationships, then publishes definitions,
translations and polygons atomically. Incomplete or failed imports retain the previous
catalogue. Change-feed scanning still schedules affected Features, but does not publish
partial definition changes. Feature geocoding cannot overwrite catalogue metadata.
Retired definitions remain for existing references; marker lookup uses the published
catalogue release. Point labels never imply polygon membership.

Large MultiPolygons are split at polygon boundaries into exact parts below D1's row
limit. Marker lookup transfers polygon data only for candidate bounds; the complete
locality choice list remains available. No coordinate simplification is applied.

Local repair uses `scripts/backfill-feature-divisions.ts --catalogue-only --apply` with
an explicit `--database` and API credential environment. It creates a consistent SQLite
backup, applies the catalogue migration and leaves Feature records, memberships and
pending jobs unchanged. Run on a copied database first. Apply the migration before
shipping the updated application and refresh worker; remote deployment is separate.

Verification: `division-refresh.test.ts` covers pagination, pinning, partial
publication, retry, lease fencing, no-polygon records, oversized exact polygon parts and
unused catalogue retention. `address-division-context.test.ts` covers retired-definition
exclusion; `prepare-local-divisions.test.ts` requires catalogue completeness even with
an empty Feature queue. Local rehearsal imported all 2,000 records from
`data-hk-divisions-2026-10-01.0`; the marker at `114.25234466277902, 22.230438757464853`
resolves to Shek O and Shek O Village.

### Three-layer Location correction contract

The Location correction model distinguishes immutable publisher snapshots, Hype-wide
shared correction revisions, and Organisation override revisions. Resolution uses that
order, with explicit Organisation suppression taking precedence. Shared contact and
accessibility edits require Project or Organisation editing authority; shared names,
addresses, brands and other sensitive facts require SuperAdmin. Organisation-authorized
sensitive edits remain Organisation overrides.

Shared revisions retain the original source value and its presence, replacement or
suppression, source revision, editor and time. Repeated publication values and omissions
preserve contact corrections. Changed publisher contact evidence retires them
permanently; agreement also retires redundant corrections. Sensitive shared corrections
require explicit reset. Organisation retain/follow policy governs its own overrides
against changed underlying evidence.

Direct staff saves must atomically record the correction and adoption by the originating
Feature. Other Features retain their independent adoption policies and accepted evidence
pins. Third-party proposals remain Tasks until staff choose and authorize the
destination changes. Pending reviews must not accept shared evidence that changed after
assessment. These requirements supersede earlier blanket Organisation-only correction
routing in this document.

### Name editor search and authored labels (10 November 2026)

Building and street name inputs query `/api/address-names` with a family, language and
name fragment. Empty inputs do not load inventories. The server retains the public
catalogue index and returns at most 30 records with their published names and release
references. Inputs debounce requests, abort obsolete searches, discard late responses
and retain at most 100 recent result pages for one minute. Catalogue availability does
not gate opening, typing, cancellation, clearing or accepting an authored name.

An explicit catalogue selection retains the existing multilingual/source workflow. **Use
as a custom name** applies an override only to the edited language; it does not create
or replace a Location association, claim a new source identity or fill other languages.
Missing language rows remain editable. Group Clear removes all language values for that
name, while Reset restores the source baseline and appears only when changed. Individual
language rows have no clear-X action. Clearing or resetting a building also invalidates
pending building-detail resolution.

Mounting the address form no longer preloads name inventories or scans the street
catalogue to fill translations reactively. Explicit source parsing and building-detail
workflows retain their existing catalogue helpers; this change moves interactive name
suggestions, not every source-ingestion operation, to server search. The first server
search can still pay the cost of loading/indexing the public export; warm searches reuse
that index. Production resource limits and deployment remain unverified.

Validation is in `address-name-api.test.ts`, `address-name-focus.test.ts`,
`address-editor-controls.test.ts`, `location-association-picker.test.ts` and
`scripts/visual-checks/name-editor-search-check.ts`. Browser checks cover the full
address form fixture, real local API suggestions, delayed replies, custom names, group
clear and reset. They do not establish the latency of the user's authenticated Feature
route: the browser access host was unavailable, so that live performance trace remains
open.

Local verification: the focused suites passed 95 of 96 tests; the retained-display
viewer test still fails outside the changed name-control path. Svelte checking reported
11 existing test-code errors and no diagnostics in the new search endpoint/client or
name components. Headless Chromium/Firefox measured edit entry at 69/111 ms, picker
opening at 32/50 ms, custom acceptance at 35/63 ms and group clear at 40/60 ms, with
zero catalogue-export requests. A warm local building search returned 398 bytes in about
4 ms; the first measured search took about 0.8 seconds. Results and screenshots are
written under `output/playwright/name-editor-search-*`. Narrow full-form inspection
still exposes address-column clipping outside the name-control changes.

Tracking note: the existing #194 and #213 references above currently resolve to
migration-importer and routing issues respectively; they are not evidence of completion
of this editor work. No unrelated issue or acceptance checkbox was changed.

Current Location directory/search projections apply Hype corrections and scoped
Organisation overrides before search, lifecycle filtering, nearby bounds and pagination.
Accepted Feature list projections instead use immutable shared revision pins, including
field-specific pins, beneath accepted Organisation overrides. Search labels never
replace canonical source identity evidence.

The standalone editor offers SuperAdmin-only Hype shared scope using the existing
name/address/status controls and brand editor. Organisation scope remains an explicit
separate destination. Proposal review supports per-field selection and retains the
accepted subset in an immutable `locationCorrectionMerge` receipt; remaining proposed
fields are not applied when that review completes.

### Feature intent and location contexts (10 November 2026, Refs #241, parent #186)

New Features carry independent `kind` (`object`, `place`, `area`, `route`),
`targetContext`, and `associationRelation` (`locatedAt`, `represents`) fields.
`featureType` remains the configurable classification identifier. A layer with one
classification infers it; otherwise the contributor chooses. Target-context cards then
show icons and examples. `building_part` is labelled **Inside or part of the building**;
`premises` is labelled **Complex**. Existing Features and historical content are not
reclassified.

Hub, Project and Layer **Location** tabs configure classifications, enabled target
contexts, relation, localized naming rules and whether missing associations prompt for
local creation or continue silently. Hub defaults remain available. Layers may override
the complete definition; older layer ID subsets remain readable. Null resets
inheritance. Versioned policy writes retain actor history and check the complete
ancestry version.

New Feature Flow is a staged `data.featureIntentSettings` field in the centralized Hub,
Project or Layer form. Main Save commits the parent, policy and policy history in one
revision-guarded transaction; main Discard restores the staged model. There are no
independent model Save, Discard or Reset actions. The Location facet reserves 320px of
trailing scroll space. Parent saves refresh the policy query after commit.

The shared form factory emits `meta.submittedTabs` for existing Hub, Organisation,
Project, Layer and Feature forms. Unchanged Profile, Fields, Members, Organisations,
Layers, Images and Location sections are removed from native FormData before preflight
and transport, as applicable to the resource. Their absent fields stay undefined through
parsing and persistence. A supplied empty replacement is distinct from omission; unknown
tab names and data sent under omitted tabs are rejected. Updates always send the
resource ID and revision token; authorization resolves unchanged ownership from
persisted records. Omitted Profile fields remain absent, including defaults,
translations, presentation settings and parent IDs. Submitted Profile values still
receive complete validation, and ownership changes retain their destination
authorization checks. Creation remains a complete submission. Naming conditions validate
against Fields supplied in the same Project transaction, including retained rules when
only Fields change. This contract is declared in `src/lib/forms/modelTabs.ts`.
Organisation membership and Feature properties are replaced only when their tabs are
supplied. Feature revision candidates preserve omitted accepted properties,
translations, placement and profile flags; transfers still authorize both scopes and
reconcile fields against the destination. The shared parser validates only selected tab
fields, so omitted defaults cannot become writes.

Type definitions carry an optional `enabled` flag (legacy definitions remain enabled).
Application defaults enable Object and Place and disable Area and Route. Disabled
definitions remain visible in configuration and inheritance, but new-feature options and
server-side selection exclude them. Existing feature association updates retain access
to their disabled definition. Custom definitions are not rewritten when defaults change.
Each type bar exposes its enable switch.

Object defaults allow building parts, buildings, premises and addresses. Place excludes
premises, thoroughfares and geographic features. Area defaults allow premises and
addresses. Geographic target classes are off in these defaults until datasets support
them. Location groups use distinct headings; classes list physical examples in the order
building part, building, premises, structure, thoroughfare.

The New Feature Flow editor uses the Fields toolbar and card layout: New, Multilingual,
Collapse/Expand, Remove Type, and the Custom switch. Type bars have a six-dot drag
handle, kind icon and collapsible title. Reordering supports pointer dragging and
Alt+Up/Down; saving persists catalogue order. Remove Type enables removal mode, with
confirmation before removing a draft type and protection for the last type. Escape exits
removal mode. Existing features retain their accepted type identities. The body groups
settings, localized naming and location-target switches in the same shared field styles.
The multilingual toolbar reveals display-name translations for the selected languages,
including additional catalogue languages. The expanded naming editor has its own
language selector. Hiding languages does not remove their content. Optional
canonical-locale `labels` persist inside the versioned type definition and inherit with
it; the existing `label` remains the fallback for legacy definitions and missing
translations. New-feature type choices and configuration headings resolve the label in
the current interface language.

Matching rules are shared application behavior. Building parts can use establishment
search results as physical-space evidence, but establishments cannot be selected as
physical targets. Search also reads accessible local records of the intended kind.
Physical targets can be created locally; a building-part draft can create its missing
parent building. Ordered fallbacks are building part → building → complex → address,
building → complex → address, and complex/infrastructure/street → address. Establishment
and natural-entity representations have no substitute-identity fallback. An addressless
building remains a building. Source availability never changes identity.

Missing associations never block creation or publication. Contributors can dismiss the
manual-creation prompt and save unresolved; the Feature index exposes a missing/linked
Location filter. Migration `0214_feature_location_context.sql` removes the earlier
publication trigger from migration 0212 and invalidates association-filter counts on
link/unlink. Migration 0215 adds locally authorable street and infrastructure identities
without reclassifying existing Locations. Apply the migrations before running the new
query code. Production rollout is separate.

Localized naming supports a feature or Location base plus ordered conditional fragments
from boolean properties or ToggleField controls, regardless of field audience, with
separate true, false and unset cases. Each locale controls its text, placement and
separator. New Features pin the reviewed rule in `nameTemplate`; changing project
defaults does not rewrite existing Features. The Feature stores only `{ rule }`. Each
`featureI18n` record owns `baseName` (authored Feature input), nullable `nameOverride`,
and the persisted final `title`. Without a template, `title = baseName`; overrides apply
only to templated names. A Location-based rule reads the accepted Location name for that
locale, without copying it over the Feature's authored base. Missing Location
translations remain unresolved (empty title) unless explicitly overridden; conditional
fragments cannot supply a missing base.

Naming-default adoption offers a reviewed update of existing Features (Refs #178, #241).
Review independently controls resetting descendant custom rules and custom titles; both
are preserved by default. The parent Save commits the policy and attributed accepted
Feature revisions atomically. Organisation catalogue defaults use the same review.
Retired identities and records without usable accepted content or an identifiable
feature type remain excluded. Records and policy ancestry are rechecked at save; a stale
preview must be reviewed again. Tests live in `src/tests/feature-naming-update.test.ts`,
`src/tests/feature-naming-update-dialog.test.ts`, and
`tests/e2e/templates/naming-update.spec.ts`.

Project and layer naming rules inherit independently of the type catalogue. Migration
`0221_feature_naming_policy.sql` moves current embedded rules into the policy’s
`namingRules` map, keyed by feature type, while retaining historical policy definitions.
An absent key inherits the parent rule; a layer can override or reset one type’s naming
without copying its project’s types. The parent form owns Save and Discard, with the
same ancestry/version guards as catalogue edits. Changing project fields validates rules
referenced by independent layer overrides as well as the project defaults.

The Model editor keeps naming rules styled as a field beneath Feature kind in the first
column. An inherited data model shows its naming status without action buttons. After
enabling the custom data model, inherited naming rules show **Define custom rules**,
which opens an editable draft in a full-width section underneath all three columns.
Accepted overrides show **Custom rules**, a condition count, **Reset** to the parent
default and **Configure naming rule** to reopen the editor. There is no inheritance
switch. The editor includes a complete title preview. **Accept naming rule** applies the
isolated draft to the parent form and returns to the summary; **Cancel** discards that
editing session. The parent form still owns Save and Discard. Naming actions are
available only while the data model is editable. The editor uses the parent multilingual
bar, with no separate locale selector. Visible languages appear as rows; each row owns
its text, placement and separator. Rule headers support drag ordering, keyboard
reordering and removal, with a plus button to add rules.

The editor explains missing boolean and toggle fields, supports loading retries and
condition ordering, and preserves text in languages not currently visible. Existing
Features retain their pinned rules when these defaults change.

The naming-policy browser check (`scripts/visual-checks/naming-policy-check.ts`)
verifies naming-only Save, inheritance, isolated Accept/Cancel drafts, compact
summaries, full-width expansion, ordered and localized previews, empty-field
explanations and load retry in headless Chromium and Firefox at 1440px and 390px, with
no horizontal overflow or page errors. It uses real components with mocked policy
transport; SQL tests separately cover persistence, dependency validation and migration.

Short-text fields (`InputField`, including retained `TextField` definitions) also
support presence conditions. These pin `test: "hasValue"` and expose **Has value** /
**Has no value** instead of boolean cases. Missing, empty and whitespace-only text use
the latter; nonempty text, including literal "false" or "0", uses the former. Migration
Feature phone ownership follows the `phoneNumber` property key, not the `PhoneField`
editor. WhatsApp and custom phone properties remain Feature-owned through ordinary
saves, revision projection and identity review. Universal phone edits on linked Features
now use the same Organisation override mechanism as other inherited Location fields
(Refs #241). Feature field permission and Organisation correction authority are both
required. Per-field Community mode atomically writes a community revision and retains
the authoring Organisation override; Internal mode writes only the override. Modes are
persisted on the Feature association, separately from visibility and inheritance. Names,
phone, brands and address can choose independently. Later acceptance releases only
changed fields; rejection retains those fields without freezing unrelated values or
converting the whole Location to an internal record. Explicit empty values remain
overrides; reset restores inheritance from accepted evidence. Community phone changes
continue through the Location correction path and consumer adoption policies. Unlinked
phone edits remain directly authored Feature content.

`0226_feature_naming_text_values.sql` makes **Has value** insert the actual property
text; only **Has no value** is authored fallback text. The editor shows read-only
examples labelled “e.g.” from populated values in the authorized project or layer. Array
examples show the first item; missing examples show an explicit empty state. Translated
fields check the title's locale with a scalar-value fallback. Migration
`0225_feature_naming_text_presence.sql` updates materialization and refreshes titles on
translated-value insert, update and delete. Policy validation prevents replacing a
referenced short-text field with an incompatible field type. Verification includes
SQLite/preview parity, localized refreshes and browser selection, two-case previews,
save/reopen and switching back to boolean fields.

PhoneField supports the same presence conditions. Migrations
`0228_feature_naming_phone_values.sql` and `0230_feature_naming_local_phone.sql`
materialize the first phone value without its `+852` prefix; stored phone values and
other country codes are unchanged. New conditions default to the separator `•` with a
space on each side.

Visible language defaults are added to the isolated rule draft immediately, so untouched
language rows participate in preview and persist when accepted.

Migration `0220_feature_name_materialization.sql` relocates legacy localized inputs and
materializes titles. SQLite write triggers refresh titles atomically on authored input,
pinned rule, boolean or toggle property, accepted association and ownership changes.
Shared corrections and Organisation choices follow the existing accepted revision pins;
an unaccepted upstream revision does not rename a Feature. Ordinary readers, sorting and
search consume stored titles; existing FTS triggers index their updates. No arbitrary
expressions enter generated names. Authorized naming rules may use internal fields;
boolean rules expose their configured text; short-text rules intentionally insert the
selected field value into the generated title. The source field retains its audience
setting.

Immutable revision payloads and hashes are retained. New revision translations keep
`title.value` as the authored base text (the established history contract), with a
localized `nameOverride`; projection guards compare these authored inputs rather than
the derived display title. Compatibility readers resolve older `baseNames`/`overrides`
inside historical templates without rewriting history. The existing form transport's
`title` input edits `baseName`, never the computed title returned by read APIs.

The Feature form displays resolved names in the existing multilingual Title field,
without a separate name-preview panel. Each language identifies its source as **From
location**, **Template** (with **From location** when applicable), or **Custom title**.
**Customize title** retains the resolved title as an override and opens its inline
editor. **Use template** or **Use location name** restores automatic naming; the
Location association and authored base names remain intact. **Go to location** opens the
Location facet. **View template** explains the pinned rule in a read-only dialog. Inline
edits and translations update per-locale overrides; untouched languages keep their own
source. The field retains its verification control and inline Escape cancellation.
Component checks cover cancellation, restoration, mixed-language overrides and base-name
preservation; headless Chromium and Firefox checks cover desktop and 390px layouts.

Profile previews decode PhoneField collections before evaluating presence, matching the
materialized naming view. An empty collection (`[]`) contributes no value; with an empty
fallback, neither its icon separator nor JSON brackets appear. Nonempty collections use
the first phone with the local `+852` prefix omitted. Ordinary text fields retain
literal JSON-looking text. SQLite/preview parity tests cover empty collections,
first-phone selection and missing-value fallbacks (Refs #241). Authenticated admin
save/reopen verification remains separate from this component evidence.

This naming-model follow-up is tracked under #241. Local verification: 198 tests pass
across eight focused files, including migrated revision saves and form input separation.
Migration 0220 was rehearsed and applied to the local D1 database: all 4,736
translations have bases, revision and association hashes remain unchanged, and
FK/integrity checks pass. A private-copy check confirms generated suffix tokens enter
and leave the actual contentless FTS index. Broader query/location fixtures remain
blocked by missing shared correction and taxonomy schema; Svelte checking reports
unrelated test-file errors. Release and deployed acceptance remain separate.

Implementation contracts are in `features/locationPolicy.ts`, `features/intents.ts`,
`featureIntents.remote.ts` and the `featureIntent` form components. Focused migration,
policy, name projection and lifecycle coverage is in `feature-location-context.test.ts`,
`feature-intent-policy.test.ts`, `building-parts.test.ts` and
`feature-lifecycle.test.ts`. The browser fixture
`scripts/visual-checks/target-context-check.ts` exercises the actual components with
mocked policy transport; it does not establish an authenticated create/link round trip
against a migrated application database.

Local verification: 314 tests pass across nine focused files, including local-target
discovery, generated-name editing, pinned-rule protection and revision projection.
Chromium and Firefox pass at 1440px and 390px with no horizontal overflow or page
errors. Scoped Biome checking has no errors; Svelte checking retains 11 existing test
errors and one existing fixture warning. Migrations 0214 and 0215 were rehearsed on a
private copy and applied to local D1. Readback preserved all 1,420 Location identities,
2,028 immutable revisions, memberships and occupancy records, with foreign-key and
integrity checks passing. Remote rollout and authenticated admin acceptance remain
unverified.

## Building parts — local implementation (10 November 2026)

Tracking: [#241](https://github.com/tijptjik/hype/issues/241), parent
[#186](https://github.com/tijptjik/hype/issues/186), under #178. This scoped
implementation does not complete the older migration-importer (#194) or routing (#213)
issues.

`building_part` is an explicitly authored physical Location: a wing, floor, zone, shop
space, flat, room or another identifiable portion of a building. It need not be
enclosed, numbered, occupied or described by a complete 3D address. “3/F, Example
Building” and “East Wing, Example Building” are valid identities. An establishment is
its occupant; tenant turnover does not replace the part or its directly associated
Features.

Creation requires an existing visible `buildingId`, plus an optional `parentPartId`. The
same D1 batch writes the identity, immutable baseline and `locationMembership`
assertions. Every authored part has a direct current owning-building edge, including
parts nested beneath other parts. The owning building is resolved from that explicit
edge, never inferred from address text. An additional current edge can point to a part
with the same owning building. Building → Room and Building → Wing → Floor → Room
therefore both work without manufacturing intermediate entities. Shared parts use shared
assertions; private parts use their owning Organisation scope. Database guards reject
self-parenting, cycles, cross-building nesting and reassignment/suppression of the
owning edge. Owning-building changes and conversion of an existing Location to/from a
part require a separate identity/reconfiguration workflow; the address editor does not
offer that conversion.

Existing structured floor/unit content, locally authored addresses and verified
canonical address references remain independent address evidence. Floor/unit text does
not create a part or prove entity equivalence. Local creation does not invent upstream
address or inventory IDs. Existing `address` Locations are retained without bulk
reclassification. `locationOccupancy` accepts establishments at either a building or a
part; no placeholder establishment is required. Current, former and unconfirmed episodes
retain their existing immutable lifecycle and relocation-review rules.

A building's **Associated Features** listing includes direct Features, Features on all
current nested parts, and Features associated with current establishments occupying the
building or its parts. Relationships resolve in each Feature's persisted Organisation
scope, with scoped suppression replacing shared assertions. Former/unconfirmed occupancy
does not count as current. The query uses distinct identity reachability and one row per
Feature; normal Feature authorization runs before the existing 25-item pagination.
Draft/archive access is unchanged. **Features placed here** and **Past accepted
placements** continue to use retained accepted placement evidence rather than current
tenancy. Accepted building/premises grouping now uses the actual ancestor kind;
intermediate part membership revisions remain exact pins rather than being mislabeled as
premises.

The association contract selects a Location identity and sync intent. The new-feature
context policy above replaces the earlier conceptual IN/ON distinction with one
`building_part` target, displayed as **Inside or part of the building**. The independent
relation is `locatedAt` or `represents`. Enabled target contexts determine which choices
are offered; legacy Feature-type Location allowlists remain readable for compatibility.

Migration `0213_building_parts.sql` widens the inline kind CHECK and facts
discriminator, updates membership/occupancy guards and accepted ancestry projections,
and recreates dependent triggers/views. It does not convert existing data. Apply it
before using the new kind; it has been rehearsed on a private local database copy, not
applied to the working database or any remote environment. The rehearsal preserved all
1,420 Location identities and 2,028 immutable revisions, retained existing schema
objects, and passed foreign-key and integrity checks.

Local evidence: 116 tests pass across nine files, including
`src/tests/building-parts.test.ts` and the existing relationship, address, listing,
association, accepted-placement and Feature-type policy suites. Svelte checking retains
11 existing errors in unrelated test code and one existing fixture warning; targeted
Biome checks report warnings but no errors. Headless Chromium and Firefox checked
creation controls at 1280px and 390px with mocked APIs: owning-building gating, optional
parent transport, no page errors and no horizontal overflow. Artifacts are under
`output/playwright/building-parts/`; the repeatable script is
`scripts/visual-checks/building-part-check.ts`. These are component checks, not
authenticated admin end-to-end or production verification. Release migration and
deployed acceptance remain open on #241.

### Feature location display preference

The Feature-owned address envelope stores `locationDisplayMode`: `automatic`, `address`,
`plus_code`, or `hkgcode`. Automatic prefers a usable address label and falls back to a
full Plus Code when only marker geography is available. Explicit address mode keeps
address presentation; explicit Plus Code mode uses the Feature marker regardless of its
associated Location's address. Explicit HKGeocode mode uses the same Feature marker to
identify a 5 × 5 metre Hong Kong GeoCode cell. Available marker-locality context follows
the code.

HKGeocode is computed offline by `@saanseoi/hkgcode` in the sibling SaanSeoi repository.
Its grid core has no runtime dependencies; the optional WGS84 adapter reuses Proj4. The
editor disables selection for missing or out-of-coverage markers. If a selected marker
moves outside coverage, the code becomes empty with an editor explanation; it is not
silently replaced by a different addressing scheme. Source addresses remain unchanged.
Geographic conversion applies the published ITRF96-to-HK1980 forward transformation and
matches the official API across the package's recorded 12,540 comparison outcomes. A
five metre cell does not imply five metre input accuracy. The official grid
specification, API examples, source attribution and precision limits are documented in
the package.

`markerCoordinates` is a Feature display projection, separate from the matched address's
source coordinates. The editor and write boundary derive it from Feature geometry;
changing display mode never changes Location identity or source address evidence. The
preference participates in the existing Feature address metadata/revision path.

What3Words integration is cancelled because it depends on a paid proprietary service
([#242](https://github.com/tijptjik/hype/issues/242)). It is not offered in the display
selector or its help. Supported modes are Automatic, Address, Plus Code and HKGeocode.

### New Feature setup

New Features begin in a four-step setup surface: select an authorised layer, select its
configured Feature type, select a permitted Location target, then find and accept its
actual location. The map and search open for the fourth step; the normal editor opens
only after the location is accepted. Clickable progress markers retain the selections
and allow returning to any available step. Saving is blocked while setup is incomplete.

Layer discovery uses the existing Feature-creation project permission filter and
excludes historical layers when their project disables them. The initial strip follows
the layer service's Feature contribution ordering (recorded user/import/restore
revisions and Feature creation, excluding drafts and system/migration revisions). Search
matches organisations, projects and layers; organisation and project selections narrow
the layer results, grouped by project. Full names and short names are both searchable.
Changing the Location target invalidates a previously accepted draft match; completing
the first three steps opens search with separate identity-link and starting-record
policies rather than unrestricted results.

### Location discovery actions and operating relationships

Location intent constrains identity linking to the selected matching kind/class. A
broader search result can offer **Create here**, supplying editable address components
and an initial position without supplying its identity, name, or synchronization mode.
The discovery policy is separate from link permission. Copying components adds no
source-tracking requirement and does not assert physical membership or an operating
relationship. Map-only creation is a separate discovery path, not an action on a result.

An establishment or service point may explicitly **operate in** a physical host; a
service point may also operate in an establishment. The author must select this
relationship independently. Existing `locationOccupancy` revisions implement operating
periods, retaining their historical storage names, effective dates, scope, and revision
references. Migration `0222_location_operating_relationships.sql` extends endpoint
guards without rewriting history. Newly authored relationships are unverified; existing
placement review and relocation policies still govern adoption by Features. Physical
membership remains a separate relationship.

### Compatible property edits and WhatsApp rollout

Migration `0227_core_whatsapp_phone_field.sql` changes the existing core
`whatsappNumber` property (`gPropWaNum01`) to `PhoneField` with translations disabled.
It preserves property identity, assignments and stored scalar phone values; the phone
reader accepts these legacy values. It captures before/after catalog revisions, checks
the existing head against the live catalog, and advances the head within the migration.
The migration is prepared for rollout, not applied to production.

Populated fields may switch between text editors or change scalar parsing to text,
number, date or boolean when every stored value validates under the target contract.
Text editors may also switch to `PhoneField` when every stored number parses. Options,
structured values and translations that the target cannot preserve block the change.
Phone collections, classifier and structured-storage transitions still require an
explicit migration. Validation preserves stored values and checks them again inside the
catalog transaction to reject concurrent edits. Naming-policy radios are excluded from
native form submission because the registered policy draft field owns their persisted
value (Refs #241).

### Using an existing Location preserves identity

Refs #194 (parent #180). “Use this location” retains the selected upstream ID and
resource release for import/link, or the existing local Location/revision for linking. A
stale local-creation flag must not override an upstream selection. Adjusting the Feature
pin during association review preserves that identity; it does not authorize creating a
replacement Location. Explicit “Create” actions retain the local-authoring path.
Regression coverage lives in `draft-feature-location-search.test.ts` and
`location-association-picker.test.ts`.

### Building-first part authoring (11 November 2026)

Refs #241 (parent #186). The building-part picker now suggests published buildings
before offering local creation. It joins the release-pinned point index to detail shards
within 100 metres and compares canonical Address IDs or complete street and number
evidence. If there is no address match, it displays all building points within 50
metres, including unnamed buildings. These are point-distance limits, not footprint
intersection guarantees; an exact match outside the 100-metre discovery window remains
unverified. A global address lookup needs a source-side index: downloading the current
52 MB address export for every picker is not an acceptable fallback.

A unique address match is suggested without writing. Ambiguous and nearby candidates
remain explicit choices, shared between the building card and map markers. “Link to
building” uses the existing authorized building importer to obtain a reusable Location;
local creation is a secondary footer action. Lookup failure remains visible and can be
retried rather than being reported as a complete no-match.

Optional enclosing-part cards sit between the building and final part. Each explicit
creation keeps the owning building and points to the preceding saved part. An unsaved
card blocks final acceptance; changing the building clears the draft chain without
deleting already-created Locations. Stale saves cannot attach an old chain to a newly
selected building. Source matching tests cover exact-address preference, unnamed
50-metre candidates, incomplete evidence and failures. Browser fixtures exercise map
selection callbacks and hierarchy transport with mocked persistence; they do not prove
an authenticated production write or live MapLibre interaction.

### MTR donor matching uses the existing review flows

Refs #194. Resolve an uncertain donor-to-shop identity in the project's existing
`/admin/projects/[project]/match-locations` flow, which searches shared imported shop
drafts as well as upstream candidates. Reuse the existing establishment and its recorded
occupancy; do not ask for a new station room merely because the donor match was
ambiguous. Shared drafts already associated with a Feature are treated as reviewed
identities and do not automatically enter that pending queue. An incorrect existing
association is changed through the Feature editor's existing Location selection flow.

A genuinely missing or conflicting unit relationship is reviewed in the establishment's
relationship editor. Adoption of its address or pin remains an explicit decision in the
existing Feature placement review. Identity matching alone does not accept occupancy or
prove a room assignment. Missing source geometry or a conflicting kiosk code stays
unresolved until supported by evidence.

There is no separate MTR placement route, fixed donor cohort or station-specific
placement command. Removing that prototype does not remove accepted relationships, mark
unresolved donors complete, or change the shared placement services.

## Source-specific Location changes

See
[Location change policies](../../../docs/specs/Design-Spec-Location-Change-Policies.md)
for branch provenance, Organisation/Project defaults, source-specific exceptions and the
accept/review diagram. The document records the remaining adoption-group and permission
boundaries explicitly. Refs #178.

### Central localized display templates (Refs #178)

The catalogue also exposes the built-in Feature-name and Location-name bases as
read-only system entries, with localized expressions and sample previews. These
inspection entries are not persisted registry versions and cannot be assigned or
regenerated. Signed-in users can read central definitions; publication still requires
SuperAdmin and private Organisation catalogues retain manager authorization.

The explicit Feature template path uses immutable central versions, a bounded expression
language and an editor at `/admin/templates`. Accepted edits materialize generated names
separately from authored bases and overrides. Community adoption renders from the same
prepared accepted facts as its transaction. See
[the implementation boundary](../../../docs/specs/Design-Spec-Location-Change-Policies.md#central-template-implementation)
for supported paths, validation and pending inherited assignments. Migrations 0234 and
0235 are prepared only; rollout and deployed verification are deferred by request.

## Authored languages and automatic translations

Content language resolution and explicit translation acceptance follow
[User language fallbacks](../../../docs/User-Language-Fallbacks.md). Existing i18n rows
retain automatic candidates separately from authored fields, with source identity,
provider provenance and independent editor acceptance. Cache-only rows and cache writes
do not enter editorial revision snapshots. Accepted provenance follows the existing
Feature and catalog authorization and revision transactions.

The active multilingual languages define missing translations. Saving reviews the
existing Profile, Policies and Fields tabs in sequence; generation displays editable
proposals in the existing controls, and only explicit acceptance fills authored values.
Readers default to published-language fallback. Opted-in readers can use a current
requested-language automatic value, with a robot control revealing its original.

Template follow-up: Hub → Project → Layer naming rules can reference immutable central
versions, and staff creation, accepted creation contributions and split identities
materialize generated names atomically. See `feature-display-template.test.ts` and
`feature-intent-policy.test.ts`. The local registry was activated with only migrations
0234/0235 after backup/rehearsal, and `scripts/visual-checks/template-registry-check.ts`
verifies authenticated load/save/reload in Chromium and Firefox. Remote rollout remains
deferred; Organisation/community defaults and bulk adoption remain pending.

Organisation template defaults (Refs #178) now sit between Hub and Project. Managers
select or reset a per-type central reference at `/admin/templates?organisation=<id>`.
Ancestry version checks reject stale edits, and existing Feature names retain their
accepted versions. Migration 0236 preserves current policies and immutable revisions; it
is applied locally only. The authenticated Organisation-default browser check covers
save, reload and reset in Chromium and Firefox. Community template adoption and bulk
regeneration remain separate work; this does not add Layer-level Location policies.

Explicit template regeneration (Refs #178) now lists accepted Organisation consumers in
bounded pages and regenerates each inspected Feature through the existing revision
transaction. Stale consumers are reported for reload; accepted Location pins and manual
names remain authoritative. `display-template-consumers.test.ts` covers page boundaries,
private ownership and retired identities, and `feature-display-template.test.ts`
verifies stale regeneration cannot overwrite a newer edit. Automatic community-template
policy adoption remains pending.

### Community identity catalogue storage

Implementation: `src/lib/db/services/identityCatalogue.ts`,
`src/lib/db/services/identityCatalogueImport.ts`, migration
`0237_identity_catalogue.sql`. Tracking:
[#178](https://github.com/tijptjik/hype/issues/178).

Brands and corporate groups share a versioned catalogue. Each record stores
`i18n[locale].name` and an optional logo. Source identifiers map imported brands to
stable catalogue identities; repeat imports retain curated translations. Missing
translations initially copy an available source name. No group, format or branch is
inferred by parsing an establishment name.

Community corrections own `brandId` and `groupId`, including immutable catalogue version
evidence. Raw Location source facts are retained. Publishing a catalogue revision
creates community evidence in bounded pages; consumer acceptance policies still govern
adoption. Locked Locations remain unchanged and are reported for retry.

New Branch and Format community correction values serialize as `i18n[locale].value`.
Historical locale maps remain readable without rewriting immutable revisions. Resolved
Location adapters expose locale maps. The global translatable Branch property uses the
existing `propertyI18n` and `featurePropertyI18n` tables; automatic binding to the
accepted Location Branch is a separate integration.

### Feature sync policy inspection and linked sections

The saved Feature Location toolbar exposes **Sync policy** as a read-only inspection
control. Feature read authorization permits seeing the effective Project policy,
Organisation fallback or default rules without granting policy-management rights. The
panel shows Community and SaanSeoi rules independently, including empty-value and
newly-resolved-address exceptions. Manual links remain explicitly unsynced. Inspection
uses the shared structured tooltip surface, not the legacy modal styling. Opening or
dismissing policy help must never submit the surrounding Feature form. The inspector
lists SaanSeoi before Community and shows “Defined by” with the actual Project or
Organisation name linked to its Advanced policy controls. Defaults identify Hype rather
than implying a Layer definition. Unused Layer relocation settings have a separate named
link to that Layer’s Advanced controls.

The current placement processor reads source-specific Project/Organisation relocation
rules. A configured Layer relocation setting is shown separately as not applied by this
processor; the inspector must not present it as effective consent.

Community/Internal controls apply to Name, Brands, Address and Communications sections.
Communications changes phone numbers, websites and socials together. Existing mixed
assignments are retained until explicitly changed, with a mixed-state indicator;
choosing it first consolidates to Internal. These are value-source choices, not privacy
settings. Community uses the regular Hype logo. Storage retains field-specific
assignment keys for compatibility, while the editor groups them at the section boundary.

### Pre-release translation storage correction (Refs #194)

Migration 0241 replaces the intermediate duplicated JSON/query projection with one
authoritative translation store. `locationRevision.facts` contains non-translated facts;
`locationRevisionI18n` contains the translated `name`, `branch`, `format`,
`displayAddress` and `displayAddressOverride`, keyed by revision and locale. Raw source
evidence remains untouched. Structured Address values retain their separate shared
Address contract.

`locationRevisionContent` assembles the locale-first snapshot at read time. Its atomic
insert trigger splits the input into facts and locale rows; a guarded write scope
prevents later additions, and immutable-row guards prevent editing or deleting
translations. The view is not materialized. `identityCatalogueI18n` similarly owns names
by catalogue, version and locale; `identityCatalogueRevisionContent` assembles each
pinned version without duplicating its names in revision JSON.

Feature search uses FTS5. Location search resolves permitted overlays before substring
matching; no Location FTS index has been added.

The reproducible local rebuild and approved media recovery workflow is documented in
[Local database rebuild](../../../docs/refactor-guides/Local-Database-Rebuild.md). It
retains export hashes and stage receipts, verifies exact recovery evidence, and backs up
the previous local database before installation. Production remains read-only.

### Reviewed donor catalogue migration (Refs #194)

`/admin/catalogue` edits localized brand/group names and logos. Breadline import seeds
brand catalogue records and community links; the importer reads curated catalogue names
before consulting retained legacy classifier labels. Public donor branding uses the
accepted Location projection, never the retired organisation classifier.

The editable, repeatable source of donor decisions is
`migrations/pending/breadline-donor-identity/curate.sql`. It remains outside automatic
migration rollout while outlet formats are reviewed. It seeds missing catalogue records,
appends documented group and explicit format curations, and retires the unused
organisation brand field with Organisation, Project, Layer and property-catalogue
revision capture. Original provider evidence and prior revision snapshots are retained.
Field locks and human curations take precedence. Community changes enter the existing
policy/review flow; the migration does not force Feature acceptance.

Preview against an explicitly selected local database (the original is read-only):

```sh
dev-check python scripts/breadline/curate-donor-identities.py \
  --database PATH_TO_LOCAL_SQLITE --report .local/donor-identity-review.json
```

The preview applies the SQL twice to a private copy and checks replay, foreign keys and
integrity. Add `--apply` only to install the reviewed decisions locally with a backup.
Do not amend a deployed migration: finalize this draft before promotion; later decisions
require a new version. During review, bump a decision's version when changing its value.
A repeat never overwrites a later human edit.

The 2026-11-12 local rebuilt Donors cohort has 311 donors, all linked to Locations and
14 catalogue brands; `unresolved` means no SaanSeoi match, not no Feature association.
The first draft supplies 297 group links and 55 explicitly named formats. Unknown group
relationships remain unset. All 35 AROME donor titles omit the Bakery/Café distinction;
these require outlet verification. Wooloomooloo's family-brand naming remains a review
choice. Sources and decision values live in the SQL rather than a second mapping file.

### Catalogue index and brand disambiguation

Each saved brand has Details and Features header tabs. Features reuses the standard
scoped index, including search, filters, sorting, pagination and normal Feature access
checks. Its predicate compares the accepted Location `brandId`, including applicable
Organisation overrides and field-specific community acceptance pins. Pending community
changes, textual brand-name matches and unassociated legacy classifiers do not qualify.
Counts use the same authorized predicate and avoid Feature-only count caches because
Location acceptance can change independently.

`/admin/catalogue` uses separate Brands and Groups tabs, header search and standard
resource rows. Opening an entry retains its stable catalogue ID in the URL. Names use
the shared locale prefixes and Multilingual control; switching visible locales does not
delete translations.

Catalogue detail forms place Multilingual directly before Edit in the page header. Names
and Identity share equal space beside the narrower brand image column. Group search
supports an inline creation row with the same locale-prefixed name editors. The new
group remains a draft until Save; its identity, translations and the brand link are
committed in one revision batch. Cancel and revision conflicts leave no orphan group.

The immutable catalogue content supports an optional readable `code`, unique among
current records of the same kind. Names are not unique identifiers. Search matches codes
as well as localized names. Brand `categories` is an array of exact keys from the
existing place taxonomy; it does not invent a separate brand classification. These
non-translatable values live once in revision content. Translated names remain solely in
`identityCatalogueI18n`.

Catalogue logos are uploaded assets. A community brand revision includes its logo in the
accepted Location brand snapshot, preserving consumer review policies. Breadline
rendering prefers that accepted logo, with bundled artwork as fallback. The repeatable
managed command below attaches the existing 14 SVG treatments through the authenticated
catalogue PNG upload flow. It preserves existing logos, fills missing codes, and writes
per-entry upload receipts to runner artifacts. Run it against the intended local admin
server after importing the brands; assets belong to that server's stage and are not
deployed by this command.

An agent server launched with `HYPE_LOCAL_R2=1` stores uploads in isolated local R2. The
normal `hype.localhost` server uses the remote `hype-assets-dev` bucket. Shared local
database URLs do not copy the corresponding image objects between these stores. Use the
development-only repair command to copy missing PNGs under their original IDs:

```sh
bun run catalogue:logos:sync:dev --database PATH_TO_LOCAL_SQLITE --report .local/catalogue-dev-logo-sync.json
bun run catalogue:logos:sync:dev --database PATH_TO_LOCAL_SQLITE --report .local/catalogue-dev-logo-sync.json --apply
```

It previews by default, refuses different existing bytes, and verifies
SHA-256-equivalent content through `hype.localhost` after each upload. It never rewrites
database records or uploads into production. Verify public image decoding against port
5175 using `catalogue-public-logo-check.ts`, separately from authenticated UI checks on
port 4173.

```sh
dev-remote --port 4173 chrome bun scripts/visual-checks/install-breadline-catalogue-logos.ts
```

### Shared naming templates and prerequisite scope (12 November 2026, Refs #194)

The reviewed donor naming proposal lives in
`migrations/pending/breadline-donor-naming/README.md`. It composes localized brand,
outlet format and branch with standalone-name fallback, then access hints and explicit
paid-area status. Store discriminators use access hints, not exit identifiers; estate
blocks stay in the branch. The existing project-owned `mtrPaidArea` prerequisite makes
the template Breadline-project scoped. The shared `join` component retains either
present value without a dangling separator. The approved migration is applied locally.
It versions the Donors layer Place naming default so future donors inherit the template;
other layers are unchanged. The reviewed corrections select Domain Mall in English and
海港城 in Chinese. Access hints and paid status share a single parenthesis, such as
`(D - Paid)`.

For donors whose Location relink omitted the catalogue brand reference,
`scripts/breadline/restore-donor-brands.ts` restores only the brand recorded in the
donor's accepted naming revision. It appends attributed Location corrections and Feature
acceptance revisions, retains matching Feature overrides, and regenerates template
output without changing the template or branch fields. It refuses conflicting brand
choices and locked fields, rehearses on a copy, and saves a local backup before an
explicit `--apply`. Unlinked donors remain unlinked; this repair does not infer a
Location association. `scripts/breadline/audit-donor-template.ts` independently compares
stored titles with the template evaluated against accepted inputs.

The Model naming panel selects shared immutable display templates or creates one using
that same expression editor. Feature name and properties, and linked Location name and
attributes, are available inputs; neither name is mandatory. Existing rule fragments can
be copied into a reusable template. Creating a template publishes its definition;
accepting the rule and saving the parent form separately adopts its pinned version. The
inline editor and template catalogue edit those same definitions by publishing a new
version, subject to the existing catalogue editing authority.

Availability follows the prerequisites in every language and every expression branch.
Built-in fields impose no project restriction. Inherited catalogue properties retain
their Hub or Organisation availability. Any project-owned property restricts use to that
project, including templates created from a Layer. Missing prerequisites are rejected.
Internal fields retain their existing eligibility for deliberate naming configuration;
they do not bypass ownership or project restrictions. The server enforces these
constraints when publishing, listing selectable templates, saving policies and
materializing accepted Feature names; transactional checks repeat the prerequisite test
with the write. Catalogue management can inspect project-specific templates without
offering them as Organisation defaults.

Regression coverage includes dependency scope, forged assignments, stale dependency
rollback, inherited policies, name-free rendering and parent-form isolation in the
display-template, feature-intent-policy and feature-naming-form suites. The managed
Chrome check `tests/e2e/templates/naming-template.spec.ts` exercises desktop publication
and reopening, plus the shared editor at desktop and narrow widths. The admin shell
retains its existing 1200px minimum-width guard.

The Entity Catalog uses the shared header facets for Brands/Groups and the standard New
action beside its title. Its detail form is one section with Brand, Identity, and Names
columns. Names use `FormI18nInlineRow`; taxonomy and group searches use the Bits
combobox keyboard model (arrows, Enter, Escape).

A brand or group's optional `groupId` references a group catalogue record. Groups can
therefore have one parent group, or no parent. Migration
`0245_catalogue_group_hierarchy.sql` adds the indexed self-referencing foreign key on
`identityCatalogue`, backfills existing memberships, and projects each published
revision's link into that column. Immutable revisions retain historical membership.
Database triggers reject missing or wrong-kind parents, self-links and indirect cycles
inside the publication transaction; the parent picker excludes the current group's
subtree before limiting search results. Parent links can be selected, created inline,
changed or cleared without changing group identity. Ancestor membership does not
automatically propagate to Location curation. Selecting a brand proposes its group in
the same community curation revision unless the edit supplies an explicit group choice.
Normal field locks and consumer policies still apply. The reviewed donor migration also
seeds these catalogue relationships without replacing authored links; its
`--catalogue-only` mode leaves donor location fields and pending format decisions
untouched.

The release data migration `0247_seed_active_identity_catalogue.sql` (Refs #194) seeds
the 2026-11-13 active snapshot: 14 brands and 7 groups. It excludes three archived
identities and omits DFI's link to the archived Blossom group; it preserves Maxim's
Group → DFI and the active brand memberships. Existing target identities, including
their revisions, archive state and source mappings, remain untouched. Missing identities
retain their IDs, current version numbers, names, categories, logo references and source
mappings. This is a current-head snapshot, not a copy of local revision history. The
source snapshot currently has no Wikidata mappings; future exports preserve them when
present.

Run this SQL through the transactional D1 migration runner after the catalogue schema
migrations. Identity-kind, code and source collisions abort instead of merging records.
The authoritative revision view writes translations and validates group relationships.
The migration is safe to rerun. R2 objects must separately exist at the exact referenced
keys in the target environment; the SQL does not upload assets. Regenerate a reviewed
snapshot with `scripts/catalogue/export-release-seed.py --database PATH --output PATH`.
Rehearsal:
`dev-check python3 -m unittest discover -s scripts/catalogue -p test_release_seed.py -v`.
No production database application is implied by generating or testing the migration.

The November 24 post-schema release advances this catalogue and carries the reviewed
Location associations, donor naming, MTR placements and their media into the cutover.
The operator selects the private package during managed preparation. The planner
compares each affected row with its accepted before-image and verifies a zero-write
replay on a copy of the target.
[Matching and branding package](../../../migrations/pending/matching-and-branding/README.md)

Catalogue Identity displays the immediate group followed by indented, linked ancestors
in nearest-first order. The connector says “Part of” because group membership does not
encode ownership percentage. The ancestor chain follows the draft's selected group and
ignores superseded requests. Wikidata is a field below Group, alongside Categories; read
mode shows the linked value (or None), while editing exposes search and logo review.

Catalogue profile images try the saved upload before the approved bundled group artwork,
then the shared deterministic identicon seeded by catalogue ID. Lists, profiles,
related-brand cards and group links share that fallback sequence. Missing development
uploads are repaired in the shared development bucket using
`scripts/catalogue/sync-dev-logos.py`; bundled artwork is not a substitute for uploading
the assets. Code edits finish pending link writes and await the new detail URL before
refreshing. `scripts/visual-checks/catalogue-identicon-code-check.ts` covers creation,
code changes, reloads and consistent list/profile identicons. Location discovery
skeletons reuse the same Row component as loaded results, including the panel surface,
64px image area, text lines, status rail and action placeholders. Status marks use 20px
geometry with a 32px gap before actions; the compact Hype mark is an open square spiral
with a clear central counter. Managed browser coverage lives in
`scripts/visual-checks/catalogue-artwork-rows-check.ts`.

First-load catalogue profiles use a shared Brand/Group skeleton with the image/name
header, identity fields and related-card rows. Record, index and group-picker errors are
separate, with explicit retries that refresh failed remote queries. Read-only details
skip list/autocomplete searches so those background failures cannot masquerade as a
failed record or save. The managed `catalogue-loading-check.ts` exercises delayed
responses, record retry and group-search failure recovery.

Catalogue detail navigation between brands and groups keeps the route viewport, form and
profile card mounted; record values update in place. Resource-specific discovery and
feature facets remain keyed, as does transient Wikidata search state. Group profiles
also list direct child groups in a separate Subgroups section. The identity field label
is “Parent group” in both view and edit modes; the relationship remains optional.

Group profiles list brands throughout their descendant groups. Brand profiles discover
sibling brands across the family sharing an ancestor, including intervening groups,
while excluding the selected brand. Traversal uses current catalogue links, deduplicates
results and excludes unrelated or ungrouped brands. These catalogue affiliations do not
encode ownership percentages: DFI's reported 50% interest in Maxim's Group must not be
interpreted as full ownership. Maxim's Cakes and Arome belong to Maxim's Group; the DFI
affiliation is at group level. See
[DFI's business profile](https://www.dfiretailgroup.com/en/our-businesses/restaurants/)
and
[Maxim's company report](https://www2.hkma.org.hk/program/qa/pdf/qa/2014-RS-Maxims.pdf).
`scripts/visual-checks/catalogue-family-check.ts` verifies the hierarchy and sibling
navigation; its explicit `--apply` option saves the reviewed local corrections through
the authenticated catalogue editor.

Hierarchy verification: `src/tests/identity-catalogue.test.ts` covers nested saves,
clearing, immutable history, migration backfill, invalid parents, cycles and stale-save
rollback (15 tests passed, managed job `job-OLTSPfT16o`).
`scripts/visual-checks/group-hierarchy-check.ts` verifies authenticated parent
selection, self-exclusion, clearing and reload without publishing fictional corporate
links (managed Chrome job `job-57aMIq2JeR`). The existing narrow admin guard remains.

`catalogue-marker-images-check.ts` compares every catalogue PNG against its Breadline
marker SVG as decoded browser pixels, checks visible image content, and records the
asset URLs. An HTTP success alone does not establish that an image is visibly rendered
or matches the marker artwork.

### Catalogue profile and donor identity migration (Refs #194)

The catalogue uses `/admin/catalog/brand/[code]` and `/admin/catalog/group/[code]`.
Codes are unique within each kind; existing ID links redirect when a code exists.
Profile editing uses localized names, taxonomy categories, group membership, image
upload and success notifications. The read-only Features tab filters by accepted
Location Brand ID, including organisation choices; pending community updates do not
enter the index.

The repeatable donor identity specification remains in
`migrations/pending/breadline-donor-identity/curate.sql`. Its local runner defaults to a
preview on a copy and requires `--apply` for mutation. It is deliberately not part of
automatic migration rollout while donor decisions are being reviewed.
`catalogue:logos:sync:dev` repairs missing development PNG objects with byte-level
verification, without changing catalogue IDs or writing to production.

Verification: catalogue service tests cover code lookup, disambiguation, taxonomy
validation and atomic group creation. `donor-catalogue-check.ts` covers authenticated
profile/index navigation, keyboard selection, locale controls and code redirects.
Remaining acceptance work includes unresolved donor decisions, accepted Brand ID
propagation into existing Features, actual save-toast assertions, and repairing any
remaining missing development logo objects. Deployment is deferred.

### Brand Location discovery (Refs #194)

An upstream discovery request requires either search text or a selected taxonomy
category. Category-only discovery uses SaanSeoi category browsing with its normal
continuation cursor; clearing the text does not disable a selected category.

The map uses a clustered GeoJSON source and MapLibre symbol layers without per-location
DOM markers. HYPE is the outer ring, SaanSeoi the middle ring and Features the centre.
Individual locations use colored rings for presence and thin neutral rings for absence.
Numbered clusters show the proportion present as colored arcs on each ring. Cluster
images are resolved before MapLibre builds symbol tiles, so new cluster sizes remain
visible across zooms. Clustering ends at zoom 14 (with a 40px radius); zoom 15 and above
shows individual locations. Clicking zooms into a cluster; coincident locations expand
around their shared position without changing stored coordinates. The camera fits once
when the first results arrive and then remains under user control, including across
map/list switches. The map stays mounted across those switches; the list reveals cached
rows in batches as the user scrolls. Shared filter bars collapse in document flow
without fading their content or exposing a gap above the results.

Brand profiles expose Locations beside the read-only Features header action, before
search. Locations uses the existing three-state filter control: Hype (not added / all /
added), Upstream (community only / all / backed), and Linked Features (unlinked / all /
linked). The initial Hype state is not added. Search runs automatically on entry and
whenever text or filters change, with a 300 ms debounce and stale-response protection.
Empty text skips the upstream search. Organisation-scoped usage checks include only that
organisation's linked Features.

The Locations header owns the shared resource filter bar, including these switches and
an explicitly labelled taxonomy Category selector. Free-text searching uses the header
search alone. Results use the standard resource rows. Profile does not expose a separate
discovery-settings card; existing saved search preferences remain readable.

Catalogue revision content optionally stores `discovery.terms` and `discovery.category`.
These search preferences are independent of classification `categories` and translated
catalogue names. Discovery category filtering uses the existing taxonomy and applies to
both upstream search and local Location results. Local matching uses the latest retained
source classification, includes descendants, and precedes counts and pagination;
unclassified Locations do not match a selected category. Category selection refreshes
immediately and displays as a taxonomy token with a tag icon inside the picker. Local
catalogue matches and source candidates retain independent bounded continuations. A
viewport sentinel loads subsequent pages automatically, including filtered-empty source
pages; failed continuations pause for explicit retry. The source text-search contract
provides a cursor, not an exact total. Local-only searches count the full matching scope
once on the first page, without hydrating every result. Upstream and mixed searches show
an unavailable count until all pages finish, then show the deduplicated total; page size
is never presented as the full count. An inexpensive upstream total requires a separate
filtered FTS count contract and query-level caching, plus reconciliation for
Hype-specific filters. Status icons distinguish confirmed brand identity from text-name
matching, Hype presence, and linked Feature usage. Link Existing Hype Location opens
identity review; Add Location to Hype imports the source identity. Both actions remain
explicit. Coverage means branches found, never an exhaustive branch census. No discovery
request writes a Location or Feature.

The current source search contract supports names and taxonomy, not an exact upstream
brand-identifier filter. Results are labelled Name match unless the source identity
already has the selected curated Brand ID in Hype. A text match never assigns a brand.
Add Location re-fetches exact canonical evidence, rejects release drift, and uses the
existing idempotent ingestion and retired-identity safeguards. Link existing Location
captures the existing identity review; acceptance and any merge remain explicit. These
canonical identity actions retain the administrator permission boundary. Feature
creation remains separate. No migration rollout or deployment is required for the
optional revision-content preferences.

Focused verification lives in `brand-locations.remote.test.ts`,
`brand-location-directory.test.ts`, and the catalogue persistence test;
`brand-locations-check.ts` verifies authenticated header placement and filter
interactions.

Catalogue group links and the group picker use the same uploaded-logo then
bundled-artwork fallback as catalogue cards. Failed uploads advance to the fallback;
failed fallback artwork becomes the stable catalogue identicon instead of a broken
image. `scripts/visual-checks/catalogue-group-logo-check.ts` exercises the
missing-upload case in both Profile and edit mode (Refs #194).

### Reviewed Wikidata brand links (Refs #194)

The brand profile editor searches Wikidata labels and descriptions for explicit entity
selection. Save atomically registers the selected `brand:wikidata` source mapping with
the catalogue revision. Existing source ownership cannot be reassigned or merged by this
action; duplicate mappings and stale revisions fail without partial writes. Subsequent
upstream imports carrying the same Wikidata identifier reuse this brand. Existing links
remain usable when Wikidata is offline.

A selected entity can offer its `P154` Commons logo. “Use this logo” imports the raster
thumbnail through the existing PNG upload path and stages it in the profile draft. The
immutable catalogue content retains the Commons file URL, author text, and license.
Selection does not overwrite names or automatically adopt the logo. Reset discards the
pending profile and identity changes. Unit coverage lives in
`identity-catalogue.test.ts` and `wikidata-brands.test.ts`; the authenticated
live-provider interaction check is `scripts/visual-checks/wikidata-brand-check.ts`.

### Catalogue archival

Brands and groups expose Archive/Restore in the standard title dropdown only to
SuperAdmins. The server independently enforces that role and the inspected revision.
`isArchived` is stored in immutable catalogue revision content; absent means active.
Archiving removes the entry from catalogue searches, pickers and family listings, while
ID/code reads, historical revisions and existing Location references remain available.
Codes stay reserved. Normal publishing cannot archive, restore or edit an archived
entry; restoration uses the dedicated SuperAdmin command. Archived groups cannot be
newly assigned, but existing memberships remain intact.

### Imported donor identity resolution (Refs #194)

Breadline-created Locations retain local provenance until an explicit upstream identity
acceptance. Resolution compares branch/base and catalogue brand names, complete phone
numbers, spatial distance and competing candidates against a pinned source publication.
A candidate's category is evidence to retain, not proof of its identity or correctness.
Canonical API verification precedes acceptance; provider failures and ambiguous matches
remain unresolved. Acceptance preserves Feature values and accepted revision pointers
while recording the source identity and canonical Location revision. Converted local
lifecycle schemas must retain the computed-title guard exception described in
`migrations/pending/feature-lifecycle/README.md`.

### Project Location reconciliation (Refs #194)

The project title menu opens **Match locations** at
`/admin/projects/[project]/match-locations`. The queue excludes archived Features and
counts only upstream-linked Locations as matched. **Skip** saves a Feature-specific
review decision, including for Features without a Location. Saved skips count as
reviewed but never as matched, persist across sessions, and leave the pending queue. The
skipped count opens a list with **Reset** to return a Feature to review. Migration
`0252_feature_reconciliation_skip.sql` records the first skip date and actor; commands
recheck project scope, Feature content and association before saving. Search defaults to
the curated Brand and a 50 m radius, with Feature name or a project field available as
the automation source. Search text remains editable. Search spans all upstream locales:
an English brand can occur in a Chinese-labelled source record. The interface language
affects presentation, not candidate eligibility. Provider radius constraints apply
before pagination, and changing the record, query, radius or authority invalidates prior
candidates and reviews.

Selecting a result on the map or candidate list displays canonical details below it.
**Link Location** imports or reuses the selected SaanSeoi Location and associates the
current Feature with it, then advances. An existing association uses the guarded
reassociation command; it does not change or merge the old Location identity or move
other Features. Features without a Location use the initial association command. Both
paths adopt the shared upstream facts without copying the old Location values into
Organisation corrections. Custom Feature name overrides remain on the Feature, and
generated names continue through its naming rules.

The comparison starts collapsed. The selected shop’s top-right expand icon opens a
full-height review; the collapse icon returns to the map. The control appears only when
there are details to review. The single Link action imports/reuses the immutable
upstream snapshot and atomically accepts the Feature association. If upstream has no
phone, the current Feature phone becomes a shared community curation authored by the
server-resolved, authorized `hkfoodworks` Organisation, with the signed-in user retained
as audit actor. Existing community phone choices, including explicit clears, take
precedence. Names, addresses, websites and other old values are not carried into new
Organisation overrides. Shared phone curation, policy-governed propagation, Feature
projection/history and association commit together or roll back together; source
snapshots are never edited. Curation locks and source/head/Feature/association
concurrency checks remain enforced. No match is accepted merely because its name or
distance ranks first. Existing Feature values and their accepted Location revision
remain subject to the existing reconciliation policy. Source failures retain search
settings and expose retry controls.

Focused tests are `location-reconciliation.test.ts` and
`location-reconciliation.remote.test.ts`; the managed Chrome interaction check is
`scripts/visual-checks/location-reconciliation-check.ts`.

#### Accepted unavailable Locations

`location.lastManualMatchAttemptAt` is nullable operational review state, separate from
publisher `sourceAvailability` and immutable Location facts. **Mark location as
unavailable** writes a server-generated UTC timestamp only after an explicit manual
decision. Searching, empty results, provider errors and **Skip** do not write it.
Migration `0249_location_manual_match_attempt.sql` leaves all existing Locations
unattempted. The action requires an existing Location and rechecks its ownership,
current Feature association, active Project membership and unmatched state atomically;
retries preserve the accepted timestamp.

An unmatched Location with a timestamp is excluded from the default queue. The header
shows a large reviewed percentage and count to the left of the action buttons. A small
legend sits above the segmented bar: green matched, amber saved skips, blue unavailable,
and gray remaining. Saved skips are Feature-specific and count as reviewed. Counts are
per active Feature, so one shared Location can resolve multiple queue entries. A
subsequently linked Location counts as matched only, even if its historical
manual-attempt timestamp remains. The no-Location path continues to require a Location
before it can store this disposition. The search source uses the standard Select
dropdown rather than an editable search picker.

Persistence and race coverage lives in `location-reconciliation-state.test.ts`, with
permission coverage in `location-reconciliation.remote.test.ts`. The managed Chrome
check additionally exercises the dropdown, unavailable-action failure/retry and progress
after reload using simulated writes, leaving real shop dispositions intact.

Reconciliation discovery now downloads all pages for the chosen search text before
applying the selected radius locally. Completed cohorts are cached in browser storage
for 24 hours, scoped by role context and exact query; radius and Feature changes reuse
the same cohort. A progress bar reports the downloaded count (the search API supplies no
total). Failed or partial downloads are not persisted as complete. Canonical details and
identity acceptance remain separately verified. Refs #194.

The accepted-unavailable count opens the shared row display with a **Reset** action.
Reset checks Project and Location authority and clears only the manual-attempt
timestamp, rechecking ownership and association atomically. All active Features sharing
that Location return to review. The matching header owns **Skip**, blue **Location
unavailable**, and green **Link Location** actions; deletion uses the current Feature's
title dropdown rather than an inherited form callback. Feature address components remain
in a bottom comparison card beside the selected upstream Location, with both cards
centered clear of the map legend. The compact radius control sits at the far right of
the filter bar. Refs #194.

Matched, skipped and unavailable counts open sortable row lists, with Name, Address and
Date sorting and inline relative timestamps. Matching filters are hidden in these lists.
Matched dates use recorded association and identity history; imported baselines without
reliable dates show “Date unavailable”. Reset is available for skipped and unavailable
records.

The header retains confirmed values while loading and keeps Link visible but disabled
without a valid selection. Location options have a selected outline; list selection and
the card’s bottom-right Previous/Next controls center the chosen marker. Locations
already linked to active Features in this Project use square markers and remain in the
option sequence. Websites and social profiles live in the shop’s overflow popover.
Address labels use the shared structured formatter and wrap without truncation.

Reset persistence and authorization regressions and the updated Chrome interaction
fixture are prepared. Runtime verification of this UI revision remains outstanding: the
managed runner could not reach Li over SSH on 2026-11-14.

### Brand and group artwork

Catalogue revisions include a source-artwork library with solid-background general logos
and approved marker variants. Selection uses exact theme, light/dark mode, default
marker, then a general logo or generic icon with a white ring. Candidates stay in admin
review. Corporate ownership evidence is separate from local franchise operation;
imported artwork does not change pinned Location identity revisions. See
[the artwork contract and local MTR import](../../../docs/catalogue/mtr-artwork.md).

Saved Feature skips are covered by the managed Chrome check
`scripts/visual-checks/reconciliation-skip-check.ts`: an unlinked Feature can be
skipped, a failed save stays on the current record, saved progress survives reload, and
Reset returns it to matching at 1440px and 1200px. Database coverage in
`location-reconciliation-state.test.ts` verifies attribution, retry stability, stale
content/association rejection, project boundaries, shared-Location isolation and later
match precedence. Local migration 0252 is applied; remote migration and deployment
remain separate release steps. Refs #194.

### Durable donor corrections (24 November 2026, Refs #194)

Reviewed operator corrections in `scripts/breadline/lib/donor-curation.ts` are keyed by
stable donor identity and override later imported values until explicitly revised. Raw
source hashes remain unchanged; generated Features retain curation provenance. Existing
donors receive attributed shared Location corrections and Feature adoption. The legacy
Place plan format remains blocked on the deployed Location schema. The recurring planner
now selects a revision-aware Location adapter (see below).

The post-cutover correction step is `scripts/breadline/prepare-donor-curations.ts`. Run
it after source reconciliation on the private working target, include its guarded
revision groups in the release, and require a zero-group repeat. Production application
uses the existing maintenance journal and restores the retained application identity; it
does not require an application redeployment.

### Recurring Location sync (24 November 2026, Refs #194)

`scripts/breadline/sync-features.ts` detects the target schema and produces version 2
plans for Location targets. Explicit `--adopt-state PRIVATE_LEGACY_STATE` adoption
requires unchanged accepted source rows, the same target and all original Feature
identities with valid current revisions. It creates a separate private checkpoint; it
does not write production. Retain the legacy checkpoint and adoption receipt.

Planning snapshots the complete donor/drop-off/run mirror and copies the target. Version
2 checkpoints pin source-to-Feature identities and normalized source facts. Updates
append attributed Feature revisions through the production lifecycle. New identities use
the existing importer and revision initializer. Source evidence is retained in the new
Feature revision's `placement.addressMeta.breadlineSource`; existing canonical Location
source revisions are not rewritten.

Three-way reconciliation preserves independently curated values. Changed addresses,
coordinates or brand identity, missing sources, newly excluded records and competing
edits produce review exceptions. Accepted Location matches, naming templates and
placement evidence survive routine source changes. Blank phones preserve known contacts.
Changed nonblank phones fill an empty linked Location through attributed shared
corrections; differing contacts retain a Feature override, removed only on exact
equality. Durable donor rules remain applied to source projections.

The existing hash-pinned apply commands accept both plan versions and verify the schema,
checkpoint and target. Each Location group has atomic source/revision guards; retry
accepts an already committed revision and rejects subsequent independent edits. The
private checkpoint advances only after remote application and local replay.

Verification: focused legacy/current-schema tests cover rollback, stale revisions,
lost-response retry, three-way conflicts and identity adoption. A private production
copy rehearsal preserved all 330 existing identities and naming templates, applied three
updates and one new drop-off, and replayed with zero writes. Integrity was OK, with zero
foreign-key violations; donor corrections and authentication rows survived. This tooling
change does not deploy an application or schedule recurring execution.

### Feature breadcrumbs with unavailable parents (24 November 2026, Refs #194)

A published Feature can be readable while its Organisation, Project or Layer is not.
Breadcrumb navigation resolves each persisted parent ID independently through the
current surface's authorized resource reader. A forbidden (403) or absent (404) parent
contributes no label; other readable labels and Feature actions remain available.
Authentication (401), transport and server failures still produce the existing error
state. Strict hierarchy resolution used by editing and other domain operations is
unchanged. This behavior does not publish parent resources or grant upward access.

The production Breadline reproduction found denied Organisation, Project and Layer
queries on all three sampled donors and the drop-off. Those parent records were
unpublished in the retained production snapshot. Remote-query errors used HTTP 200
transport envelopes containing status 403, so HTTP-status-only smoke checks missed them.
The breadcrumb-specific reader and focused tests cover complete, partial and unavailable
context; managed Chrome checks require rendered Feature content and the breadcrumb
surface on desktop and mobile.
