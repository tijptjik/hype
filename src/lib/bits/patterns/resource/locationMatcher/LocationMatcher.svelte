<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte'
import { page } from '$app/state'
import { replaceState } from '$app/navigation'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import {
  getLocationMatcherQueue,
  prepareLocationMatcherReview,
} from '#lib/api/locationMatcher.remote.js'
import { searchDraftLocations } from '#lib/api/draftLocation.remote.js'
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import BrandLocationMap from '../brandLocations/BrandLocationMap.svelte'
import LocationIdentityReviewSection from '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte'
import MatcherControls from './MatcherControls.svelte'
import MatcherActions from './MatcherActions.svelte'
import SaanSeoiMarkIcon from '#lib/bits/patterns/cards/resourceCard/components/SaanSeoiMarkIcon.svelte'
import type { HeaderButtonActionConfig } from '#lib/bits/patterns/layout/header/index.js'
import {
  MATCHER_CATEGORIES,
  type MatcherCategory,
  type MatcherCounts,
} from '#lib/locations/matcherCategories.js'
// DOMAIN
import {
  hasMapCoordinates,
  type BrandLocationMapPoint,
} from '#lib/locations/brandLocationMap.js'
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// TYPES
import type { LocationFacts } from '#lib/locations/model.js'

type LocalRow = Awaited<ReturnType<typeof getLocationMatcherQueue>>['data'][number]
type Candidate = Awaited<ReturnType<typeof searchDraftLocations>>['rows'][number]
const header = getHeaderCtrl()
let counts = $state<MatcherCounts | null>(null)
let category = $state<MatcherCategory>('all')
let evidenceRows = $state<
  Awaited<ReturnType<typeof getLocationMatcherQueue>>['evidence']
>([])
let actions = $state<HeaderButtonActionConfig[]>([])
let expanded = $state(false)
let localQuery = $state('')
let query = $state('')
let radius = $state(500)
let locale = $state<'en' | 'zh-hant' | 'zh-hans'>('en')
let locals = $state<LocalRow[]>([])
let selected = $state<LocalRow | null>(null)
let total = $state<number | null>(null)
let localCursor = $state<string | null>(null)
let candidates = $state<Candidate[]>([])
let sourceCursor = $state<string | null>(null)
let reviewId = $state<string | null>(null)
let candidateId = $state<string | null>(null)
let loading = $state(false)
let searching = $state(false)
let preparing = $state(false)
let failure = $state('')
let searchFailure = $state('')
let partial = $state(false)
let localGeneration = 0
let searchGeneration = 0
let reviewGeneration = 0
let alive = true
let submittedLocalQuery = ''
let searched = $state(false)
let submittedSearch = {
  q: '',
  radius: 500,
  locale: 'en' as 'en' | 'zh-hant' | 'zh-hans',
}
const meta = { isAdminRequest: true as const }

/** Present publisher labels without inventing a business name. @param facts Current facts. @returns Display label. */
function name(facts: Pick<LocationFacts, 'names'> | null): string {
  return (
    facts?.names.en ||
    Object.values(facts?.names ?? {}).find(Boolean) ||
    'Unnamed Location'
  )
}
/** Show the retained shop/address label alongside its name. @param facts Location address facts. @returns Display address. */
function address(facts: Pick<LocationFacts, 'location'>): string {
  return getAddressDisplay(
    {
      version: 1,
      source: facts.location.address,
      coordinates: facts.location.geometry.coordinates,
      matchStatus: facts.location.address.status,
      overrides: {},
    },
    'en',
  )
}
const points = $derived.by((): BrandLocationMapPoint[] => {
  const rows: BrandLocationMapPoint[] = []
  const coordinates = selected?.facts?.location.geometry.coordinates
  if (selected && hasMapCoordinates(coordinates))
    rows.push({
      id: selected.id,
      name: name(selected.facts),
      coordinates,
      hype: true,
      upstream: false,
      linked: Boolean(selected.hasLinkedFeatures),
      shape: 'square',
    })
  for (const row of candidates) {
    const coordinates = row.facts.location.geometry.coordinates
    if (hasMapCoordinates(coordinates))
      rows.push({
        id: row.id,
        name: name(row.facts),
        coordinates,
        hype: false,
        upstream: true,
        linked: false,
      })
  }
  return rows
})

/** Load a bounded shared draft page and preserve the current review during pagination.
 * @param more Continue the current local query. @param id Optional deep-linked Location.
 * @returns Completion of the latest authorized read.
 */
async function load(more = false, id?: string): Promise<void> {
  const token = ++localGeneration
  if (!more) submittedLocalQuery = localQuery.trim()
  loading = true
  failure = ''
  try {
    const request = getLocationMatcherQueue({
      category,
      q: submittedLocalQuery,
      after: more ? (localCursor ?? undefined) : undefined,
      meta,
    })
    await request.refresh()
    const result = await request
    if (!alive || token !== localGeneration) return
    locals = more ? [...locals, ...result.data] : result.data
    localCursor = result.nextCursor
    total = result.totalCount
    counts = result.counts
    evidenceRows = more ? [...evidenceRows, ...result.evidence] : result.evidence
    if (!more) {
      let target = result.data.find(row => row.id === id) ?? result.data[0] ?? null
      if (id && !result.data.some(row => row.id === id)) {
        const exact = await getLocationMatcherQueue({ id, category, meta })
        if (!alive || token !== localGeneration) return
        evidenceRows = [...evidenceRows, ...exact.evidence]
        target = exact.data[0] ?? target
        if (target && !locals.some(row => row.id === target.id))
          locals = [target, ...locals]
      }
      choose(target)
    }
  } catch {
    if (alive && token === localGeneration)
      failure = 'Could not load shared Locations. Check your session and retry.'
  } finally {
    if (alive && token === localGeneration) loading = false
  }
}
/** Switch the review target, invalidating every in-flight source request.
 * @param row Shared draft to review. @returns Nothing.
 */
function choose(row: LocalRow | null): void {
  searchGeneration++
  reviewGeneration++
  actions = []
  expanded = false
  selected = row
  candidates = []
  sourceCursor = null
  reviewId = null
  candidateId = null
  searching = false
  preparing = false
  searchFailure = ''
  partial = false
  searched = false
  query = row?.facts ? name(row.facts) : ''
  const url = new URL(page.url.href)
  if (row) url.searchParams.set('location', row.id)
  else url.searchParams.delete('location')
  replaceState(url, page.state)
}
/** Search bounded upstream pages around the selected shared Location.
 * @param more Continue the submitted source query. @returns Completion of the latest search.
 */
async function search(more = false): Promise<void> {
  if (!selected || !query.trim() || preparing) return
  const token = ++searchGeneration
  if (!more) {
    actions = []
    expanded = false
    submittedSearch = { q: query.trim().slice(0, 200), radius, locale }
    candidates = []
    sourceCursor = null
    reviewId = null
    candidateId = null
    reviewGeneration++
    partial = false
  }
  searching = true
  searchFailure = ''
  const coordinates = selected.facts?.location.geometry.coordinates
  try {
    const request = searchDraftLocations({
      q: submittedSearch.q,
      locale: submittedSearch.locale,
      limit: 20,
      cursor: more ? (sourceCursor ?? undefined) : undefined,
      ...(hasMapCoordinates(coordinates)
        ? { near: { coordinates, radius: submittedSearch.radius } }
        : {}),
    })
    await request.refresh()
    const result = await request
    if (!alive || token !== searchGeneration) return
    const existing = new Set(candidates.map(row => row.id))
    candidates = [...candidates, ...result.rows.filter(row => !existing.has(row.id))]
    sourceCursor = result.nextCursor
    searched = true
    partial ||= result.partial
  } catch {
    if (alive && token === searchGeneration)
      searchFailure =
        'SaanSeoi search failed. Retry the search; existing results remain available.'
  } finally {
    if (alive && token === searchGeneration) searching = false
  }
}
/** Freeze one exact candidate before presenting accept/reject/merge controls.
 * @param candidate Selected upstream preview. @returns Completion after retained evidence loads.
 */
async function review(candidate: Candidate): Promise<void> {
  if (!selected?.draftVersion || preparing) return
  const token = ++reviewGeneration
  preparing = true
  searchFailure = ''
  candidateId = candidate.id
  reviewId = null
  actions = []
  expanded = true
  try {
    const result = await prepareLocationMatcherReview({
      locationId: selected.id,
      expectedSourceHash: selected.draftVersion,
      ssId: candidate.id,
      resourceReleaseId: candidate.resourceReleaseId,
      meta,
    })
    if (alive && token === reviewGeneration) reviewId = result.reviewId
  } catch {
    if (alive && token === reviewGeneration)
      searchFailure =
        'Could not prepare this comparison. The Location or source may have changed; reload and retry.'
  } finally {
    if (alive && token === reviewGeneration) preparing = false
  }
}
onMount(() => {
  void load(false, page.url.searchParams.get('location') ?? undefined)
})
onDestroy(() => {
  alive = false
  localGeneration++
  searchGeneration++
  reviewGeneration++
  header.setViewActionContent(null, {})
  header.clearControlBar()
  header.setViewActions([])
})
/** Prepare retained station evidence with the same fresh canonical review safeguards.
 * @param id Source identity. @param release Source release. @returns Review preparation completion.
 */
async function reviewEvidence(id: string, release: string): Promise<void> {
  if (!selected?.facts) return
  await review({ id, resourceReleaseId: release, facts: selected.facts })
}
/** Advance through the queue without recording a false match or rejection.
 * @returns Completion after choosing the next record or loading another page.
 */
async function next(): Promise<void> {
  const index = locals.findIndex(row => row.id === selected?.id)
  if (locals[index + 1]) choose(locals[index + 1])
  else if (localCursor) {
    const length = locals.length
    await load(true)
    if (locals[length]) choose(locals[length])
  } else if (locals[0]) choose(locals[0])
}
const candidate = $derived(candidates.find(row => row.id === candidateId) ?? null)
$effect(() => {
  header.setHeaderForIndex('Match locations', SaanSeoiMarkIcon, {
    showNew: false,
    showLayoutToggle: false,
    showViewActions: true,
  })
  header.setCrumbs([
    { name: 'Locations', href: '/admin/locations' },
    { name: 'Match locations' },
  ])
  header.setSearch(null)
  header.setTitleMenuItems([])
  header.clearFooter()
})
$effect(() => {
  header.setControlBar(
    MatcherControls,
    {
      query,
      locale,
      radius,
      busy: searching,
      disabled: preparing || !selected,
      count: candidates.length,
      onquery: (value: string) => {
        query = value
      },
      onlocale: (value: string) => {
        locale = value as typeof locale
      },
      onradius: (value: number) => {
        radius = value
        void search()
      },
      onsearch: () => {
        void search()
      },
    },
    { isVisible: true },
  )
  header.setViewActionContent(MatcherActions, {
    counts,
    category,
    oncategory: (value: MatcherCategory) => {
      category = value
      localQuery = ''
      choose(null)
      void load()
    },
    actions,
    disabled: loading || preparing,
    onnext: () => {
      void next()
    },
  })
})
</script>

<svelte:head><title>Match locations · Hype</title></svelte:head>
<div class="relative min-h-0 flex-1 overflow-hidden" data-location-matcher-map>
  {#key selected?.id}
    <BrandLocationMap
      {points}
      missing={0}
      busy={searching || loading}
      selected={candidateId}
      onselect={id => {
        const row = candidates.find(row => row.id === id)
        if (row) void review(row)
      }}
      onretry={() => void search()}
    />
  {/key}
  <aside
    aria-label="Unmatched Hype Locations"
    class="border-border bg-panel/95 absolute top-3 left-3 z-10 max-h-[38%] w-64 max-w-[calc(100%-1.5rem)] overflow-auto rounded-lg border p-3 shadow-lg"
  >
    <h2 class="mb-2 text-sm font-semibold">
      {MATCHER_CATEGORIES.find(item => item.id === category)?.label}
      {total === null ? '' : `(${total})`}
    </h2>
    <form
      class="mb-3 flex gap-2"
      onsubmit={event => {
        event.preventDefault()
        void load()
      }}
    >
      <input
        aria-label="Name or shop code"
        placeholder="Name or shop code"
        bind:value={localQuery}
        maxlength="200"
        class="border-border bg-panel min-w-0 flex-1 rounded border px-2 py-1 text-sm"
      >
      <Button type="submit" text="Find" size="sm" disabled={loading || preparing} />
    </form>
    {#if failure}
      <p role="alert" class="text-sm">{failure}</p>
    {/if}
    {#if loading}
      <Skeleton class="h-16 w-full" />
    {/if}
    {#each locals as row (row.id)}
      <button
        type="button"
        class="hover:bg-muted w-full rounded p-2 text-left text-sm aria-pressed:font-semibold"
        aria-pressed={selected?.id === row.id}
        disabled={preparing}
        onclick={() => choose(row)}
      >
        <span class="block break-words whitespace-normal">{name(row.facts)}</span>
        {#if row.facts}
          <span
            class="text-muted-foreground block text-xs break-words whitespace-normal"
            >{address(row.facts)}</span
          >
        {/if}
      </button>
    {:else}
      {#if !loading && !failure}
        <p class="text-sm">No Locations in this category match your search.</p>
      {/if}
    {/each}
    {#if localCursor}
      <Button
        text="More Locations"
        size="sm"
        disabled={loading}
        onClick={() => load(true)}
      />
    {/if}
  </aside>
  <section
    aria-label="SaanSeoi matching"
    class="pointer-events-none absolute inset-x-3 bottom-3 z-10 grid max-h-[52%] grid-cols-1 items-end gap-3 md:grid-cols-2 md:gap-8"
  >
    <section
      aria-label="Hype Location details"
      class="border-border bg-panel/95 pointer-events-auto max-h-[24vh] min-w-0 overflow-auto rounded-lg border p-4 shadow-lg md:max-h-[46vh]"
    >
      <p class="text-muted-foreground mb-2 text-xs">HYPE · Current Location</p>
      {#if selected?.facts}
        <h2 class="font-semibold break-words whitespace-normal">
          {name(selected.facts)}
        </h2>
        <p class="mt-2 text-sm break-words whitespace-normal">
          {address(selected.facts) || 'Address not provided'}
        </p>
        <p class="text-muted-foreground mt-2 text-sm">
          {selected.facts.phoneNumber.join(' · ') || 'Phone not provided'}
        </p>
        <a class="mt-3 block text-sm underline" href={`/admin/locations/${selected.id}`}
          >Open Hype Location</a
        >
        <p class="text-muted-foreground mt-3 text-xs">
          {selected.ssId
            ? `Associated with ${selected.ssId}`
            : 'No upstream identity yet. Compare the unit, name and address before accepting.'}
        </p>
      {:else if loading}
        <Skeleton class="h-24 w-full" />
      {:else}
        <p class="text-sm">Select a Hype Location to review.</p>
      {/if}
    </section>
    <section
      aria-label="SaanSeoi candidate details"
      class="border-border bg-panel/95 pointer-events-auto max-h-[27vh] min-w-0 overflow-auto rounded-lg border p-4 shadow-lg md:max-h-[46vh]"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">
          SaanSeoi · {candidate ? 'Selected candidate' : 'Candidates'}
        </p>
        {#if candidate}
          <Button
            text={expanded ? 'Candidates' : 'Review comparison'}
            size="sm"
            onClick={() => {
              expanded = !expanded
            }}
          />
        {/if}
      </div>
      {#if searchFailure}
        <p role="alert" class="mb-2 text-sm">{searchFailure}</p>
      {/if}
      {#if partial}
        <p role="status" class="mb-2 text-sm">
          Some previews failed; results are incomplete.
        </p>
      {/if}
      {#if searching || preparing}
        <div role="status" aria-label="Loading candidates">
          <Skeleton class="h-20 w-full" />
        </div>
      {/if}
      {#if reviewId && selected}
        <div class:hidden={!expanded}>
          {#key reviewId}
            <LocationIdentityReviewSection
              featureId=""
              locationId={selected.id}
              initialReviewId={reviewId}
              isDirty={false}
              onActionsChange={value => {
                actions = value
              }}
              onCommitted={async () => {
                await load()
              }}
            />
          {/key}
        </div>
      {/if}
      {#if selected && !searched && !searching && !reviewId}
        {#each evidenceRows.find(row => row.locationId === selected?.id)?.candidates ??
          [] as suggestion (suggestion.ssId)}
          <button
            type="button"
            class="border-border hover:bg-muted mb-2 w-full rounded border p-3 text-left"
            disabled={preparing || Boolean(selected.ssId)}
            onclick={() =>
              void reviewEvidence(suggestion.ssId, suggestion.resourceReleaseId)}
          >
            <span class="block text-sm">{suggestion.names.join(' · ')}</span>
            <span
              class="text-muted-foreground block text-xs break-words whitespace-normal"
              >{suggestion.addresses.join(' · ')}</span
            >
            <span class="block text-xs"
              >{suggestion.evidence}{suggestion.conflictingCode
                ? ' · Conflicting unit code'
                : ''}</span
            >
          </button>
        {/each}
      {/if}
      {#if !expanded || !reviewId}
        {#each candidates as row (row.id)}
          <button
            type="button"
            class="border-border hover:bg-muted mb-2 w-full rounded border p-3 text-left aria-pressed:font-semibold"
            aria-pressed={candidateId === row.id}
            disabled={preparing}
            onclick={() => review(row)}
          >
            <span class="block text-sm break-words whitespace-normal"
              >{name(row.facts)}</span
            ><span
              class="text-muted-foreground block text-xs break-words whitespace-normal"
              >{address(row.facts) || 'Address not provided'}</span
            >
          </button>
        {:else}
          {#if !searching}
            <p class="text-sm">
              {searched
                ? 'No live search candidates found. Try another name, shop code or radius.'
                : 'Search SaanSeoi using the header controls to compare candidates.'}
            </p>
          {/if}
        {/each}
        {#if sourceCursor}
          <Button
            text="More candidates"
            size="sm"
            disabled={searching || preparing}
            onClick={() => search(true)}
          />
        {/if}
      {/if}
    </section>
  </section>
</div>
