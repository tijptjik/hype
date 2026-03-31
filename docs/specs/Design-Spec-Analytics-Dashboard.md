# Analytics Dashboard Design Spec

## Summary

This spec defines the remaining implementation work for the admin analytics surface at
`/admin/analytics`.

The current state is uneven:

- `assets` has a real backend path and a working dashboard shell.
- `views`, `audience`, and `data` are still placeholder facets.
- local development is still noisy because the app boot path and local D1/workerd can
  fail independently of analytics.

The immediate objective is to finish the asset analytics vertical so it is stable in dev
while reading production data, then implement the first live traffic facet for page and
host analytics.

## Current State

### Delivered

- Asset analytics admin route and dashboard shell exist.
- Asset analytics reads are proxied through `/api/admin/analytics`.
- The asset worker exposes `/analytics/summary`.
- Window-level failures now degrade partially rather than failing the entire payload.
- The dashboard can surface partial window warnings.
- Reusable analytics UI primitives already exist under
  `src/lib/bits/patterns/analytics/assetAnalyticsDashboard` and
  `src/lib/bits/custom/analyticsCard`.

### Not Delivered

- No live implementation for:
  - `views`
  - `audience`
  - `data`
- No unified analytics service layer for Cloudflare Web Analytics or zone analytics.
- No facet-specific server routes beyond the asset summary route.
- No explicit local-dev strategy for auth/bootstrap contention versus analytics failures.

## Goals

- Make `assets` reliable enough to use daily in local dev and admin preview flows.
- Implement a first live non-asset facet, starting with `views`.
- Keep analytics reads server-side and policy-aware.
- Make partial failures legible in the UI instead of collapsing to generic error states.
- Ensure prism constraints can be applied consistently across asset and traffic analytics.

## Non-Goals

- Full BI-style arbitrary query builder
- Historical backfill or warehouse export work
- Public analytics pages outside admin
- Real-time streaming charts
- Cloudflare dashboard parity across every metric dimension

## Product Shape

The analytics page should become four concrete dashboards:

- `assets`
  - image delivery performance, transformations, cache mix, latency, top images
- `views`
  - page views, top hosts, top paths, trend lines, referrers
- `audience`
  - country, browser, OS, device class, performance slices
- `data`
  - D1, queue, and operational pipeline health

These should share:

- common time-window selection
- common prism awareness
- common admin authorization
- common partial-error presentation

## Architecture

### Facet Routing

Each facet should have its own server route instead of overloading one endpoint:

- `/api/admin/analytics/assets`
- `/api/admin/analytics/views`
- `/api/admin/analytics/audience`
- `/api/admin/analytics/data`

Rationale:

- isolates failures per facet
- makes caching simpler
- keeps response contracts small and explicit
- avoids coupling asset worker failures to traffic metrics

### Service Layer

Add dedicated analytics services under `src/lib/api/services`:

- `analytics.assets.ts`
- `analytics.views.ts`
- `analytics.audience.ts`
- `analytics.data.ts`

Shared concerns should stay in a small common helper module:

- time window normalization
- prism-to-filter translation
- Cloudflare auth/config resolution
- error normalization
- partial-window response shaping

### UI Layer

Add one dashboard component per facet, but build them out of shared analytics primitives
instead of duplicating the current asset layout. The current asset dashboard already gives
us reusable shells for:

- card chrome and section headers
- partial/empty/error states
- fixed-window comparison layouts
- ranked-table sections
- time-series presentation

Recommended structure:

- keep asset-specific composition in
  `src/lib/bits/patterns/analytics/assetAnalyticsDashboard`
- add shared facet-agnostic analytics primitives under
  `src/lib/bits/patterns/analytics`
- add facet-specific compositions for:
  - `ViewsAnalyticsDashboard.svelte`
  - `AudienceAnalyticsDashboard.svelte`
  - `DataAnalyticsDashboard.svelte`

The route-level page should only:

- manage active facet
- fetch the selected facet
- keep refresh behavior
- render a facet-specific dashboard

The route-level page is currently still asset-specific. Refactoring that page into a small
facet loader is a prerequisite for shipping `views` cleanly.

## Workstream 1: Asset Analytics Completion

### Objective

Make the existing asset analytics dashboard stable and shippable.

### Remaining Work

- Add contract coverage for worker payloads with:
  - complete success
  - partial window failure
  - all-window failure
  - empty-but-valid windows
- Add targeted dashboard tests for:
  - warning banner rendering
  - per-window unavailable cards
  - mixed success and failure layouts
- Decide whether local dev should always pin to production asset analytics or allow an
  opt-in preview/local source.
- Add response caching strategy for `/api/admin/analytics/assets`.
- Add generated timestamp and source environment visibility in the dashboard header.
- Add small drill-down affordances for:
  - transformation groups
  - ranked images
  - 30-day trend anomalies

### Open Questions

- Should local dev always read production asset analytics by default?
YES
- Should 1h and 24h windows be hidden automatically when the dataset is sparse?
NO
- Should the asset worker return per-query metadata for debugging, or keep the contract
  UI-only?
UI only

## Workstream 2: Views Facet

### Objective

Implement the first live non-asset dashboard using Cloudflare traffic analytics.

### Scope

The first version should answer:

- How many page views did we get in each fixed window?
- Which hosts drove those views?
- Which paths drove those views?
- What is the trend line over time?
- Which referrers are most important?

### Filtering Requirement

The first live traffic facet should be host-first rather than prism-attributed. We do not
currently record organisation or project ownership inside the web analytics engine, so
`views` and `audience` should operate on hostname scope directly:

- select one tracked host at a time
- report metrics for that host only
- avoid implying organisation/project attribution that does not exist upstream

This means host selection is the primary filter contract for `views` and, by extension,
`audience`.

### Proposed Response Shape

```ts
type ViewsAnalyticsSummary = {
  generatedAt: string
  scope: {
    hostname: string
  }
  windows: Record<
    '1h' | '24h' | '7d' | '30d',
    | null
    | {
        totalPageViews: number
        totalVisits?: number
        topHosts: Array<{ host: string; views: number }>
        topPaths: Array<{ path: string; views: number }>
        topReferrers: Array<{ referrer: string; views: number }>
        timeseries: Array<{ date: string; views: number }>
      }
  >
  windowErrors: Partial<Record<'1h' | '24h' | '7d' | '30d', string>>
}
```

### Backend Work

- Add `src/lib/api/services/analytics.views.ts`.
- Add `/api/admin/analytics/views/+server.ts`.
- Resolve Cloudflare credentials and site selection server-side.
- Resolve the selected host into the correct upstream analytics query.
- Normalize Cloudflare response shapes into one app-owned contract.

### Data Source Decision

We do not need full Cloudflare dashboard parity, but we do need host/domain control. The
source selection should be evaluated against that requirement first:

- Cloudflare Web Analytics per-site APIs:
  - likely best fit if each hub/domain can be mapped to a site and queried independently
  - preserves host-level control cleanly
  - weaker if we need cross-site aggregation with one query
- Zone analytics:
  - useful when metrics are available per hostname inside one zone-level dataset
  - only acceptable if hostname filtering and hostname dimensions are stable enough for
    hub-level slicing
- Mixed strategy:
  - most realistic fallback
  - use per-site Web Analytics for host/path/referrer/audience traffic data
  - keep asset delivery analytics on the existing asset worker path

Recommendation: treat "can query a single hostname/site cleanly" as the gate. If a
candidate API cannot support host-scoped reads, it is not sufficient for `views` or
`audience`.

### UI Work

- Add `ViewsAnalyticsDashboard.svelte`.
- Reuse the fixed window selector pattern from `assets`.
- Start with:
  - headline totals
  - top hosts
  - top paths
  - timeseries
  - referrers

Recommended reuse:

- keep the same fixed window keys: `1h`, `24h`, `7d`, `30d`
- reuse the existing card shell and warning/empty/error patterns
- adapt the ranked-table card pattern for:
  - top hosts
  - top paths
  - top referrers
- create a traffic-specific time-series card instead of forcing the asset stacked-series
  component onto incompatible metrics
- add a host selector above the dashboard as the primary traffic filter

### Open Questions

- Should `views` use Cloudflare Web Analytics per-site APIs, zone analytics, or a mixed
  strategy?
- How should host filtering behave when a prism maps to multiple custom domains?
- Should `localhost` or preview hosts ever appear in the dashboard when developing locally?

Current answer direction:

- default to production hostnames only in local dev
- exclude `localhost`, preview hosts, and internal test domains unless explicitly requested
- select a single host at a time instead of attempting organisation/project attribution
- do not aggregate hosts into prism-owned totals unless we later add a reliable mapping layer

## Workstream 3: Audience Facet

### Objective

Add the next layer of Cloudflare traffic understanding once `views` is stable.

### Scope

The first version should show:

- country distribution
- browser distribution
- operating system distribution
- device class distribution
- Core Web Vitals or performance buckets if Cloudflare exposes them in a stable way

### Notes

- `audience` should reuse the same host and window filters as `views`.
- Avoid shipping this until `views` proves out the Cloudflare analytics service path.
- `audience` should reuse the same ranked-table and empty/error primitives as `views`.
- The first slice should stay distribution-focused:
  - country
  - browser
  - OS
  - device class
- Performance slices should only ship if the chosen traffic source exposes them with the
  same host-level filtering guarantees as the rest of the facet.

## Workstream 4: Data Facet

### Objective

Turn `data` into an operational dashboard for internal systems rather than traffic.

### Candidate Inputs

- D1 query latency and failures
- queue backlog / retries
- map render throughput
- image pipeline failures
- asset worker operational counters

### Recommendation

Do not implement `data` until:

- asset analytics is stable
- one traffic facet is live
- operational sources are clearly defined and available

This facet has the highest ambiguity and should remain last.

## Local Dev Strategy

### Problem

Local analytics testing is currently polluted by unrelated failures:

- auth/session D1 reads
- local workerd `SQLITE_BUSY`
- root app bootstrap data fetches
- production analytics fetch behavior

### Required Hardening

- Keep local analytics reads pinned to production where production data is the test target.
- Ensure analytics facet fetches fail independently from non-analytics app bootstrap.
- Reduce duplicate auth/session reads during one request where possible.
- Keep retry behavior limited to transient local D1 lock contention only.
- Log upstream analytics failures with enough detail to distinguish:
  - local app failure
  - asset worker failure
  - Cloudflare analytics query failure

## Error Model

### Principles

- Whole-facet failure should be rare.
- Partial-window failure should render data for the successful windows.
- Error messages should identify the failed window and upstream reason when safe.
- The admin UI should never collapse successful windows because one query failed.

### Required UI States

- full success
- partial success with warning banner
- full empty state
- full error state
- per-window unavailable card state

## Security and Permissions

- Analytics reads stay server-side.
- Admin analytics routes require current admin authorization.
- Public browser tokens must not be used as read credentials.
- Secret Cloudflare API credentials stay in worker/app private env only.

## Caching

Recommended first-pass caching:

- facet API routes: short-lived private cache, about 60 seconds
- worker summary routes: short-lived private cache
- no client-side persistent caching beyond current query lifetimes

The analytics page should feel fresh enough for admin usage without turning every refresh
into a full upstream query storm.

## Implementation Order

### Phase 1

- Finish asset analytics contract and dashboard hardening.
- Stabilize local dev behavior while reading production data.

### Phase 2

- Implement `views` backend service and dashboard.
- Ship host/path/time-series/referrer slices.

### Phase 3

- Implement `audience`.

### Phase 4

- Implement `data`.

## File Plan

Planned additions:

- `src/lib/api/services/analytics.assets.ts`
- `src/lib/api/services/analytics.views.ts`
- `src/lib/api/services/analytics.audience.ts`
- `src/lib/api/services/analytics.data.ts`
- `src/routes/api/admin/analytics/assets/+server.ts`
- `src/routes/api/admin/analytics/views/+server.ts`
- `src/routes/api/admin/analytics/audience/+server.ts`
- `src/routes/api/admin/analytics/data/+server.ts`
- `src/lib/bits/patterns/analytics/viewsAnalyticsDashboard/ViewsAnalyticsDashboard.svelte`
- `src/lib/bits/patterns/analytics/audienceAnalyticsDashboard/AudienceAnalyticsDashboard.svelte`
- `src/lib/bits/patterns/analytics/dataAnalyticsDashboard/DataAnalyticsDashboard.svelte`

Likely refactors:

- slim down `src/routes/admin/analytics/+page.svelte`
- move shared filter/window logic into local analytics helpers
- reduce cross-facet coupling in `AssetAnalyticsDashboard.svelte`
- split shared primitives out of the asset dashboard package instead of cloning its
  internals into new facet components
- keep traffic host selection separate from prism-derived asset scope until a trustworthy
  attribution model exists

## Facet Content Proposal

### Views

Add first:

- total page views per fixed window
- optional visits/uniques if the upstream API exposes them reliably
- top hosts or, if the upstream query is already host-scoped, host summary metadata
- top paths
- top referrers
- daily trend line for the selected host

Reuse:

- fixed-window controls
- analytics card shell
- ranked-list/table pattern
- partial-window banner handling

New shared pieces likely needed:

- host selector chip group or select
- traffic time-series chart
- generic ranked-dimension card

### Audience

Add first:

- countries
- browsers
- operating systems
- device classes

Reuse:

- the same host selector as `views`
- the same fixed-window controls
- the same ranked-dimension card pattern

Add later only if source quality is proven:

- performance buckets
- CWV-style slices

### Data

Add only after source contracts exist:

- D1 latency/error summaries
- queue backlog/retry counts
- image pipeline failures
- asset worker operational counters

Reuse:

- card shell
- partial error banner
- fixed-window summary cards where time-windowed data exists

Do not force the traffic dashboard shape onto `data`. This facet is operational, not
visitor-behavior analytics.

## Testing Strategy

- Server-side contract tests for every facet response normalizer.
- Endpoint tests for auth and configuration failure modes.
- Dashboard rendering tests for:
  - success
  - partial warning
  - empty
  - error
- Dev validation against production data for:
  - asset analytics
  - first live `views` implementation

## Acceptance Criteria

- `assets` is usable in local dev against production data without collapsing on single-window failures.
- `views` is live and no longer placeholder copy.
- Partial failures are visible and specific.
- The analytics page can be refreshed repeatedly in dev without generic opaque failures.
- Server logs are sufficient to distinguish local request problems from upstream analytics issues.
