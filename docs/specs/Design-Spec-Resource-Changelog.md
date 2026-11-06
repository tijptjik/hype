# Hierarchy changelog

Layer, Project and Organisation record menus open a dedicated `/changelog` child route.
The record header remains visible, with Changelog selected alongside the normal tabs.
The feed includes the selected record and resources currently below it in the hierarchy.
Moving a resource changes which hierarchy can see its history; this is not a historical
hierarchy reconstruction.

The reader combines immediate organisation/project/layer revisions, owned field
catalogues, Feature publication receipts and approved private-maintenance captures.
Catalogue revisions produce an entry for each changed field, including removed fields.
Feature gallery changes include the existing safe image-metadata comparisons. Tasks,
proposal saves, unaccepted drafts and review activity are not feed sources. Initial
migration snapshots are labelled separately from new records.

Entries appear newest first, ordered by change-set timestamp and a unique source/record
key. Pages inspect at most 25 candidates, with one lookahead. Unauthorized candidates
are omitted and still advance the continuation cursor, so a sparse page can have a next
page. The client appends pages as the visible range approaches the end, using the same
shared virtual list as the Features index. Variable-height measurement supports expanded
changes, and disclosure state survives virtual row unmounting. Refresh, resource, locale
or account changes reset the feed; stale requests are discarded. Failed continuations
keep loaded rows and offer an explicit retry.

Each row starts collapsed and shows resource type, affected record name with locale
fallback, shared operation labels and date. Expanding shows attribution, reason and
before/after evidence. Each collapsed row also identifies the actor; user actors link to
their current username profile, while non-user origins retain their immutable actor
reference on hover and in expanded details. Dates use localized relative time, refreshed
while mounted, with exact timestamps on hover. The standard section header matches
Fields, and rows fill the available content width with 16px horizontal padding. Names
and essential labels wrap at narrow widths.

Feature enrollment keeps its migration actor distinct from original authorship.
`0194_feature_baseline_attribution.sql` freezes unambiguous creation-task reviewer or
contributor evidence, including direct contributions, without rewriting revisions. Known
original actors link to their current username and identify their role; missing evidence
is shown as “Author unknown.” Photo and missing-report tasks do not establish Feature
authorship. The changelog remains readable before this optional attribution migration is
installed.

The last 24 hours lead the feed without a heading. Older populated groups begin with “a
day ago,” “a week ago,” “a month ago” and “a year ago” boundaries, localized for the
selected locale. Thresholds are 24 hours, 7 days, 30 days and 365 days, matching the row
relative-time durations. Empty groups are skipped. Boundaries are derived across all
loaded entries, so a continuation within the same group does not repeat its heading.
Each boundary shares its following record's virtual row and is remeasured on expansion;
the live clock moves records between groups without changing server paging.

One blue “Last checked” boundary separates changes at or since the previous successful
visit from older records. Checkpoints belong to the authenticated user and canonical
resource ID, persist across devices, and do not create resource revisions. First visits
have no invented checkpoint. A successfully loaded visible view saves the server cutoff
captured before its feed read; changes arriving later remain new. Background loading and
failed reads do not advance progress. The previous marker stays fixed through scrolling,
refresh and locale changes until the next visit. Delayed tabs cannot move stored
progress backwards, and writes repeat current ancestry checks.

Private progress is stored in `userResourceCheckpoint`, keyed by `userId`,
`resourceType`, `resourceId` and `checkpointKind`, with a `checkedThrough` timestamp.
The changelog owns the `changelog` kind, authorization, visit semantics and blue marker.
The reusable store only reads and advances timestamps monotonically, capped at server
time; callers must supply a server-built persisted scope guard for both reads and
writes. Other features may use their own kinds without importing changelog logic.

Apply `0192_user_changelog_checks.sql` followed by `0193_user_resource_checkpoints.sql`
before deploying the current checkpoint reader. The forward migration preserves every
existing cutoff exactly under the `changelog` kind, then removes the old
`userChangelogCheck` table.

Every request authorizes the root through existing editor policies and authorizes each
descendant separately. Feature publication/maintenance evidence requires existing
publication-review authority. SQL repeats current hub and agreeing hierarchy links;
Feature comparisons reuse the privacy-aware history readers. The reader never returns
whole Feature snapshots. Missing sources are reported explicitly. The feed adds no new
revision capture tables or resource write paths. Checkpoint metadata uses the migrations
above; remote rollout remains separate.

This extends the
[resource revision design](../refactor-guides/Resource-Revisions-Implementation-Plan.md)
and the Feature revision boundaries in
[Places and Features](../../spec/breadline/proposal/01-places-features.md).

The section header's Filters button toggles a responsive filter bar without clearing
selections. Resource type, action, actor, category, source and literal metadata search
combine across the full authorized feed. Actor selections retain immutable identity and
origin rather than matching display names. The Period section reuses the user-directory
two-handle range slider, with persistent UTC date labels and inclusive endpoints;
selecting the full range clears the date constraints. Reset clears every section, and
the header indicates active filters even while the bar is hidden. Resource/account
changes reset selections; locale changes preserve them and refresh localized options.

Actor options and time bounds are aggregated from the unfiltered authorized hierarchy,
independently of loaded pages or active filters. These aggregates expose attribution and
time only, after the same per-owner authorization as entries. Metadata predicates apply
before candidate pagination. Action predicates apply after privacy-aware comparisons; a
sparse filtered page still advances the raw cursor. Hidden differences never affect
action membership, and search never inspects historical field values. Filter changes
cancel stale requests and debounce new reads; continuations retain the filter snapshot.
