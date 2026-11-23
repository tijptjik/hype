# MTR building parts and shop review

Refs [#194](https://github.com/tijptjik/hype/issues/194) and
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

The local network import uses the retained 15 November 2026 LandsD baseline and the 14
November MTR shop directory. Physical identities use `landsd-mtr-unit:<unit_id>`;
establishments use `mtr-shop:<sourceRecordId>`. Replays preserve existing facts and
relationship history. Upstream identities are never inferred from names or proximity.

The import created or retained 9,122 building parts across 98 station maps and created
1,758 establishment drafts. The 16 November resolution pass brings coverage to 1,356
establishments with 1,439 occupancy links: 1,389 current, 24 former and 26 unconfirmed
(opening soon). Unknown operating dates remain unset. Combined shop codes may occupy
several existing polygons when they cover the complete group; no polygons are invented
or merged.

Catalogue source mappings associate 1,683 establishments with existing brands, whose
codes are shown in the review. The remaining 75 records represent 73 services and two
explicit exclusions from the prior catalogue review, not 75 unresolved brand matches.
The review's exception data is copied from the 11 corresponding decisions in
`scripts/catalogue/mtr-network-reconciliation.json`. Another 402 records remain
unmatched to polygons, including 68 West Kowloon shops outside the retained station-map
archive. Those drafts use an explicitly retained station anchor and do not claim a
particular shop polygon. The current unresolved report separates 236 service footprints
or codes needing confirmation, 96 unit-code/source-version mismatches, two incomplete
code groups, and the 68 West Kowloon records. These are evidence gaps, not a conclusion
that every record requires a human decision. Equivalent complete numeric and lettered
groups match across range/list notation.

The additional 92 matches comprise 69 complete multi-unit groups, two adjacent polygon
groups bearing the same code, seven equivalent code formats, four PDF-confirmed code
corrections and ten isolated units with a unique linked occupant and directory record.
The PDFs identify Kennedy Town kiosk 6 and expose three transposed `SWH` prefixes on
Sheung Wan source units. Raw source records remain unchanged. All 11 previously generic
room labels now use confirmed codes or supported functions. Kwai Fong's banking area,
Lei Tung's shared service corner and Siu Hong's photo/ATM area still lack confirmed
standalone codes. Sai Ying Pun's unnamed ATM area is `SYP ATM 2`, beside shop 4 in the
PDF; it is not shop 7.

Open `/admin/mtr-shops?station=KOT` as a super admin. Station rows expose the draft,
brand code, occupancy status and retained upstream comparisons. Identity acceptance and
merge reuse the existing concurrency-fenced review. Imported brand associations are
promoted to community catalogue corrections in that same transaction. A previous tenant
can instead be opened as a separate establishment in the relationship editor and
recorded as a former occupant, without identifying it as today's tenant.

## Local evidence and commands

The local backup, full import plan, per-record exceptions, discovery evidence and
verification receipts are under `.local/places/mtr-network/`. They are ignored local
artifacts, not a second delivery tracker. `before.sqlite` is the consistent pre-import
backup. The initial `verification.json` records 921 polygons with resolvable logo
artwork, unchanged content for all 640 prior station/unit revisions, and zero
foreign-key violations. Logo coverage is server projection evidence, not rendered
browser evidence. The later `resolution-verification.json` records 1,043 logo polygons,
15 intentional physical-name edits, preserved raw sources and prior occupancy
assertions, zero foreign-key violations and zero assigned draft `ssId` values. Replaying
the resolution plan proposes no changes.

There are 35 pending upstream comparisons. Offline acceptance rehearsals passed for both
direct linking and merging: the imported catalogue brand survived, merge occupancy
history was unchanged, and stale replay was rejected. These rehearsals used isolated
copies and did not accept real pending reviews.

Run the Python planner with `--baseline DIRECTORY` to cover the complete retained
network. `apply-mtr-drafts.ts` accepts an offline database by default; an actual managed
local database requires `--apply-local`. `import-mtr-shops-local.ts` rolls back unless
passed `--apply`, verifies the catalogue capture checksums, and writes a per-record
receipt. Use `dev-check` for these local-state operations.

`discover-mtr-shops.ts` searches all pages, including closed businesses, on the
configured local upstream API and retains exact publication-pinned candidates.
`capture-mtr-shop-reviews.ts` stores pending comparisons without assigning the draft an
`ssId`. `verify-mtr-network-local.ts` checks physical coverage, prior revision
preservation, empty draft `ssId` values, foreign keys and the real map artwork service.
`rehearse-mtr-shop-identity.ts` only accepts an isolated copy under the evidence
directory.

`plan-mtr-shop-resolutions.py` produces `resolutions.json` from retained sources and
reviewed map overrides. `apply-mtr-shop-resolutions.ts` previews it against the local
database; `--apply` creates a backup and adds guarded occupancies and name corrections.
Different existing current tenants block automatic placement. The plan includes every
remaining unmatched directory record and its reason. The upstream refresh still yields
35 pending comparisons. The relationship editor supports former occupancy, evidence URLs
and optional end dates without identifying today's draft as the previous tenant.

Full typechecking and browser interaction checks must run through `dev-remote`. Li was
unreachable during this import. The page compiled through Vite, the authenticated review
query returned Kowloon Tong shops, and anonymous access returned `UNAUTHENTICATED`;
these checks do not replace managed Chrome acceptance.

## Station discovery and local reconciliation

Reconciliation searches shared Hype Locations alongside SaanSeoi previews. Existing
shared drafts are selectable without an upstream identity; the acceptance transaction
checks their content hash as well as the Feature and association revisions. Private
Organisation records remain outside this shared search. Results identify their source,
and a failed upstream request does not discard successful Hype results. Search includes
retained address labels so MTR shop codes can find imported local establishments. Local
results appear before the upstream download finishes. When a shared draft lacks a phone,
linking preserves the Feature phone as an override without editing the draft.

Run `dev-check bun scripts/indoor/discover-mtr-stations.ts KOT` for Kowloon Tong, or
omit station codes for the full station catalogue. The read-only job scans nearby
spatial cells, exhausts pagination, and retains station reports under
`.local/places/mtr-network/station-discovery/`. A successful search is not proof that
upstream has indexed every station establishment. Missing previews and failed searches
are reported as incomplete, not as confirmed absent establishments.

Comparisons preserve all directory rows. Complete normalized code groups are primary
evidence; station-qualified names provide secondary candidates. Code matches with a
different tenant remain unconfirmed, and differing unit codes are flagged. Reports do
not populate `ssId`, publish records, merge tenants, or accept pending identity reviews.

Discovery scans every resolution-nine cell intersecting a 350 m station envelope,
including all cell pages, and checks each preview's identity and release. Optional
`--text` queries search English and Chinese station names and codes; they are
constrained to 1 km around the station. Proximity retrieves candidates; it does not
prove they are inside the station. The directory's West Kowloon station is included
using the retained anchor even though it is outside the 98-map archive. This is a
bounded discovery baseline, not a claim that all station entrances fit the envelope.

For local proxy routing where Bun cannot resolve `api.atlas.localhost`, use
`SAANSEOI_API_URL='http://[::1]' SAANSEOI_API_HOST=api.atlas.localhost` before
`dev-check`. The Host override is a CLI-only transport option; it does not affect
application search.

For a full local scan, `--local-current=/absolute/path/to/current.sqlite` keeps cell
selection and pagination on the API but reads preview labels from its exact backing
SQLite database in read-only batches. Every ID and resource release must match a current
publication, ambiguous scopes fail, and one preview per newly discovered page is
compared with the API. The final publication check still applies. Reports record
`previewTransport` so this evidence is distinguishable from API-only previews.

The application-level matcher is `/admin/locations/match`, available to super admins as
“Match locations” with the SaanSeoi mark in the chevron menu beside the Locations index
heading. It lists shared unpublished Locations and searches SaanSeoi by name or shop
code with an explicit language and radius. Selecting a candidate freezes
publication-pinned evidence for the existing accept/reject/merge review. No
organisation, project or layer is required. It does not automatically import the offline
station comparison reports.

Shared-draft identity and merge reviews pin the mutable content hash as well as the
revision ID. Older shared-draft reviews without a hash must be prepared again. Changes
to the draft during review invalidate acceptance, including the final transaction.

The matcher uses a full-workspace map with header search, language selection and the
shared `LocationSearchRadius` slider. Bottom panels compare the current Hype Location
with SaanSeoi candidates; retained comparison actions appear in the header. Clickable
counters filter the MTR evidence cohort before pagination: all shops, accepted matches,
code-and-name candidates, code candidates needing review, name-only candidates and no
candidates. Counts ignore the current text query. Accepted identities move into Matched;
evidence categories describe proposed matches, not accepted identities. Next Location
advances without recording a match, skip or rejection.

The retained public comparison is `src/lib/locations/mtrMatchEvidence.json`; it records
the discovery publication and source keys rather than local database IDs. The queue
joins these keys to current shared Locations and offers retained candidates directly.
Canonical source evidence is still fetched again before preparing an identity review.

`automatch-mtr-shops.ts DATABASE` previews unique code-and-name candidates without unit
conflicts. `--apply-local --backup=PATH` applies only candidates whose current draft
name, shop code, upstream release and publication still agree. Existing upstream
identities requiring a merge remain for review. A verified local backup and per-record
receipts are retained under `.local/places/mtr-network/`. The authorized local pass
applied 104 matches; 23 needed a merge and two failed current code/name agreement. No
remote data was changed.
