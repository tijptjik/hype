<script lang="ts">
// SVELTE
import { onMount, onDestroy, untrack } from 'svelte'
import { page } from '$app/state'
import { replaceState } from '$app/navigation'
// THIRD PARTY
import { formatDistanceToNowStrict } from 'date-fns'
import { Popover } from 'bits-ui'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// API
import {
  getLocationReconciliation,
  markReconciliationUnavailable,
  getUnavailableReconciliation,
  getMatchedReconciliation,
  getSkippedReconciliation,
  skipReconciliationFeature,
  resetReconciliationSkip,
  getReconciliationLinkedSources,
  resetReconciliationUnavailable,
  acceptReconciliationMatch,
} from '#lib/api/locationReconciliation.remote.js'
import { searchDraftLocations } from '#lib/api/draftLocation.remote.js'
import { archiveFeature } from '#lib/api/feature.remote.js'
import {
  importFeatureLocationCandidate,
  getFeatureLocationSearchDetails,
} from '#lib/api/location.remote.js'
import { readFreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
import BrandLocationMap from '../brandLocations/BrandLocationMap.svelte'
import ReconciliationControls from './ReconciliationControls.svelte'
import ReconciliationActions from './ReconciliationActions.svelte'
import Row from '#lib/bits/custom/rows/Row.svelte'
import ResourceSortControl from '../resourceSortControl/ResourceSortControl.svelte'
import TrashIcon from 'virtual:icons/proicons/delete'
import LocationIcon from 'virtual:icons/proicons/location'
import MoreIcon from 'virtual:icons/lucide/ellipsis'
import ExpandIcon from 'virtual:icons/proicons/full-screen-maximize'
import CollapseIcon from 'virtual:icons/proicons/full-screen-minimize'
import PreviousIcon from 'virtual:icons/proicons/arrow-left'
import NextIcon from 'virtual:icons/proicons/arrow-right'
// DOMAIN
import {
  hasMapCoordinates,
  type BrandLocationMapPoint,
} from '#lib/locations/brandLocationMap.js'
import {
  reconciliationQuery,
  reconciliationDistance,
} from '#lib/locations/reconciliation.js'
import { createReconciliationCache } from '#lib/locations/reconciliationCache.js'
import { getLocaleKey } from '#lib/i18n.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import type { LocationFacts } from '#lib/locations/model.js'

let { project }: { project: string } = $props()
type Queue = Awaited<ReturnType<typeof getLocationReconciliation>>
type Candidate = Awaited<ReturnType<typeof searchDraftLocations>>['rows'][number]
const header = getHeaderCtrl()
const admin = getAdminCtx()
let queue = $state<Queue | null>(null)
let displayedQueue = $state<Queue | null>(null)
// Retain the last confirmed progress while the next queue item is in flight.
let progress = $state<Queue['counts'] | null>(null)
let source = $state('brand'),
  radius = $state(50),
  query = $state('')
let candidates = $state<Candidate[]>([]),
  selectedId = $state<string | null>(null)
let linkedSourceIds = $state<string[]>([])
let downloaded = $state(0)
let searchCache: ReturnType<typeof createReconciliationCache>
let loading = $state(true),
  searching = $state(false),
  preparing = $state(false),
  linking = $state(false)
let dispositionFailure = $state('')
let listView = $state<'unavailable' | 'matched' | 'skipped' | null>(null)
let listRequest = 0
const listTitle = $derived(
  listView === 'matched'
    ? 'Matched'
    : listView === 'skipped'
      ? 'Skipped'
      : 'Accepted as unavailable',
)
let unavailableLoading = $state(false)
let unavailableFailure = $state('')
let resetting = $state<string | null>(null)
let unavailableRows = $state<
  Array<{
    id: string
    name: string
    address: string | null
    locationId: string | null
    date: string | null
  }>
>([])

let unavailableSorting = $state<{ sortBy: string; sortOrder: 'asc' | 'desc' }>({
  sortBy: 'name',
  sortOrder: 'asc',
})
const sortedUnavailableRows = $derived.by(() => {
  const direction = unavailableSorting.sortOrder === 'asc' ? 1 : -1
  return [...unavailableRows].sort((a, b) => {
    const comparison =
      unavailableSorting.sortBy === 'date'
        ? (a.date ? Date.parse(a.date) : 0) - (b.date ? Date.parse(b.date) : 0)
        : (unavailableSorting.sortBy === 'address'
            ? (a.address ?? '')
            : a.name
          ).localeCompare(
            unavailableSorting.sortBy === 'address' ? (b.address ?? '') : b.name,
            getLocaleKey(),
            { numeric: true, sensitivity: 'base' },
          )
    return direction * comparison || a.id.localeCompare(b.id)
  })
})

/** Format the persisted review timestamp as relative time.
 * @param value UTC timestamp returned by the server. @returns Relative elapsed time.
 */
function unavailableDate(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : formatDistanceToNowStrict(date, { addSuffix: true })
}

/** Read the selected reviewed list. @param view List to display. @returns Completion after refresh. */
async function openList(view: 'matched' | 'unavailable' | 'skipped'): Promise<void> {
  const request = ++listRequest
  listView = view
  unavailableRows = []
  unavailableLoading = true
  unavailableFailure = ''
  try {
    const rows =
      view === 'skipped'
        ? (await readFreshRemoteQuery(getSkippedReconciliation({ project }), true)).map(
            row => ({ ...row, date: row.skippedAt }),
          )
        : view === 'matched'
          ? (
              await readFreshRemoteQuery(getMatchedReconciliation({ project }), true)
            ).map(row => ({ ...row, date: row.matchedAt }))
          : (
              await readFreshRemoteQuery(
                getUnavailableReconciliation({ project }),
                true,
              )
            ).map(row => ({ ...row, date: row.lastManualMatchAttemptAt }))
    if (alive && request === listRequest) unavailableRows = rows
  } catch {
    if (alive && request === listRequest)
      unavailableFailure = 'Could not load locations. Please retry.'
  } finally {
    if (alive && request === listRequest) unavailableLoading = false
  }
}
/** Reset the selected Feature skip or shared Location disposition and refresh progress. @param row Selected Feature row. @returns Completion. */
async function resetUnavailable(row: (typeof unavailableRows)[number]): Promise<void> {
  if (resetting || linking) return
  resetting = row.id
  unavailableFailure = ''
  const currentId = item?.id
  try {
    if (listView === 'skipped' && row.date) {
      await resetReconciliationSkip({ project, featureId: row.id, skippedAt: row.date })
    } else if (row.locationId) {
      await resetReconciliationUnavailable({
        project,
        featureId: row.id,
        locationId: row.locationId,
      })
    } else return
    if (!alive) return
    await openList(listView === 'skipped' ? 'skipped' : 'unavailable')
    await load(undefined, currentId)
  } catch {
    if (alive) unavailableFailure = 'Could not reset this Location. Please retry.'
  } finally {
    if (alive) resetting = null
  }
}
let failure = $state(''),
  searchFailure = $state(''),
  detailFailure = $state('')
let canonical = $state<LocationFacts | null>(null)
let reviewExpanded = $state(false)
let mapFocus = $state<{ coordinates: [number, number] } | null>(null)
let ready = $state(false)
const skipped = $derived(progress?.skipped ?? 0)
let generation = 0,
  queueGeneration = 0,
  detailGeneration = 0,
  alive = true
const item = $derived(queue?.item)
const coordinates = $derived(
  item?.geometry.type === 'Point' && hasMapCoordinates(item.geometry.coordinates)
    ? item.geometry.coordinates
    : null,
)
const selectedIndex = $derived(candidates.findIndex(row => row.id === selectedId))
const selected = $derived(candidates[selectedIndex])
const facts = $derived(canonical ?? selected?.facts)
const selectedAddress = $derived.by(() => {
  if (!facts) return ''
  const address = {
    ...emptyFeatureAddress(),
    source: facts.location.address,
    coordinates: facts.location.geometry.coordinates,
  }
  return [
    ...new Set(
      ([getLocaleKey(), 'en', 'zhHant', 'zhHans'] as const)
        .map(locale => getAddressDisplay(address, locale))
        .filter(Boolean),
    ),
  ].join(' · ')
})

const points = $derived.by((): BrandLocationMapPoint[] => [
  ...(coordinates && item
    ? [
        {
          id: 'current-feature',
          name: item.name,
          coordinates,
          hype: true,
          upstream: false,
          linked: Boolean(item.locationId),
        },
      ]
    : []),
  ...candidates.flatMap(row =>
    hasMapCoordinates(row.facts.location.geometry.coordinates)
      ? [
          {
            id: row.id,
            name: label(row.facts),
            coordinates: row.facts.location.geometry.coordinates,
            hype: false,
            upstream: true,
            linked: linkedSourceIds.includes(row.id),
            shape: linkedSourceIds.includes(row.id)
              ? ('square' as const)
              : ('circle' as const),
          },
        ]
      : [],
  ),
])
const roleScope = $derived(admin.view.getRoleScopeQueryKey())
const storageKey = $derived(`location-reconciliation:${project}:${roleScope}`)

/** Choose a localized display name with a stable fallback. @param value Candidate facts. @returns Name. */
function label(value: LocationFacts): string {
  return (
    value.names[getLocaleKey()] ||
    value.names.en ||
    Object.values(value.names).find(Boolean) ||
    'Unnamed location'
  )
}
/** Load the next unresolved record and authoritative saved review counts. @param after Cursor. @param featureId Explicit previous/current record. @returns Completion. */
async function load(after?: string, featureId?: string): Promise<void> {
  const token = ++queueGeneration
  generation++
  detailGeneration++
  loading = true
  failure = ''
  dispositionFailure = ''
  queue = null
  mapFocus = null
  candidates = []
  selectedId = null
  canonical = null
  try {
    const result = await readFreshRemoteQuery(
      getLocationReconciliation({ project, after, featureId }),
      true,
    )
    if (!alive || token !== queueGeneration) return
    queue = result
    displayedQueue = result
    progress = result.counts
    query = result.item ? reconciliationQuery(result.item, source) : ''
    const url = new URL(page.url.href)
    if (result.item) url.searchParams.set('feature', result.item.id)
    else url.searchParams.delete('feature')
    replaceState(url, page.state)
  } catch {
    if (alive && token === queueGeneration)
      failure = 'Could not load this queue. Check your project access and retry.'
  } finally {
    if (alive && token === queueGeneration) loading = false
  }
}
/** Download the complete term once, then filter and sort by the current radius locally. @returns Completion. */
async function search(): Promise<void> {
  if (!coordinates || !query.trim() || !item) return
  const token = ++generation
  searching = true
  downloaded = 0
  searchFailure = ''
  const origin = coordinates
  const limit = radius
  const term = query.trim().slice(0, 200)
  try {
    const rows = await searchCache.get(
      roleScope,
      term,
      async cursor =>
        readFreshRemoteQuery(
          searchDraftLocations({
            q: term,
            // Search all source locales and positions, then apply distance to the complete cohort.
            limit: 20,
            ...(cursor ? { cursor } : {}),
          }),
          true,
        ),
      count => {
        if (alive && token === generation) downloaded = count
      },
    )
    const linkedSources = await readFreshRemoteQuery(
      getReconciliationLinkedSources({ project }),
      true,
    )
    if (!alive || token !== generation) return
    linkedSourceIds = linkedSources.map(row => row.ssId)
    candidates = rows
      .filter(row => reconciliationDistance(origin, row.facts) <= limit)
      .sort(
        (a, b) =>
          reconciliationDistance(origin, a.facts) -
          reconciliationDistance(origin, b.facts),
      )
    if (candidates[0]) void select(candidates[0].id)
  } catch {
    if (alive && token === generation)
      searchFailure =
        'Upstream download failed or was incomplete. Retry to download the full set.'
  } finally {
    if (alive && token === generation) searching = false
  }
}
/** Step through the visible match options and center the selected marker.
 * @param direction Previous or next option. @returns Nothing.
 */
function stepOption(direction: -1 | 1): void {
  if (linking || searching || selectedIndex < 0) return
  const candidate = candidates[selectedIndex + direction]
  if (candidate) void select(candidate.id, true)
}
/** Read canonical details for the selected marker without proposing an identity merge. @param id Source identity. @param centerMap Center the marker after an explicit list selection. @returns Completion. */
async function select(id: string, centerMap = false): Promise<void> {
  if (linking || id === 'current-feature' || !item) return
  const candidate = candidates.find(row => row.id === id)
  if (!candidate) return
  if (centerMap && hasMapCoordinates(candidate.facts.location.geometry.coordinates))
    mapFocus = { coordinates: [...candidate.facts.location.geometry.coordinates] }
  const token = ++detailGeneration
  selectedId = id
  reviewExpanded = false
  canonical = null
  detailFailure = ''
  preparing = true
  try {
    const result = await readFreshRemoteQuery(
      getFeatureLocationSearchDetails({
        featureId: item.id,
        ssId: id,
        resourceReleaseId: candidate.resourceReleaseId,
      }),
      true,
    )
    if (!alive || token !== detailGeneration) return
    canonical = result.facts
  } catch {
    if (alive && token === detailGeneration)
      detailFailure =
        'Canonical details could not be verified. Retry this candidate or choose another.'
  } finally {
    if (alive && token === detailGeneration) preparing = false
  }
}
/** Apply only the explicit selected identity through existing authorized domain commands. @returns Completion after acceptance and queue refresh. */
async function link(): Promise<void> {
  if (!item || !selected || !canonical || linking || preparing) return
  const current = item
  const candidate = selected
  linking = true
  detailFailure = ''
  try {
    const imported = await importFeatureLocationCandidate({
      featureId: current.id,
      ssId: candidate.id,
      resourceReleaseId: candidate.resourceReleaseId,
    })
    // Save source adoption and any missing-phone curation together before advancing.
    await acceptReconciliationMatch({
      project,
      featureId: current.id,
      locationId: imported.locationId,
      revisionId: imported.revisionId,
      expectedFeatureModifiedAt: current.modifiedAt,
      expectedRevision: current.associationVersion ?? null,
    })
    await load(current.id)
  } catch {
    detailFailure =
      'Could not link this Location. The record may have changed; reload its details before retrying.'
  } finally {
    linking = false
  }
}
/** Record an explicit unavailable disposition without counting it as a successful match. @returns Completion after durable save and queue refresh. */
async function markUnavailable(): Promise<void> {
  if (!item?.locationId || linking || loading) return
  const current = item
  const locationId = item.locationId
  linking = true
  dispositionFailure = ''
  // Invalidate in-flight candidate details before starting this independent queue outcome.
  generation++
  detailGeneration++
  try {
    await markReconciliationUnavailable({ project, featureId: current.id, locationId })
    await load(current.id)
  } catch {
    dispositionFailure =
      'Could not mark this Location as unavailable. Your record has been kept; retry or reload if it changed.'
  } finally {
    linking = false
    preparing = false
    searching = false
  }
}
/** Delete the current Feature and advance only after the authorized archive succeeds. @returns Completion after deletion and queue refresh. */
async function deleteCurrentFeature(): Promise<void> {
  if (!item || loading || linking) return
  const current = item
  linking = true
  dispositionFailure = ''
  // Invalidate candidate work before deleting the Feature it belongs to.
  generation++
  detailGeneration++
  try {
    await archiveFeature({
      id: current.id,
      state: true,
      meta: { isAdminRequest: true },
    })
    if (!alive) return
    await load(current.id)
  } catch {
    if (alive)
      dispositionFailure = 'Could not delete this Feature. Retry before moving on.'
  } finally {
    linking = false
    preparing = false
    searching = false
  }
}
/** Save an explicit skip and advance only after the server confirms it. @returns Completion. */
async function skip(): Promise<void> {
  if (!item || loading || linking) return
  const current = item
  linking = true
  dispositionFailure = ''
  // Skipping is independent of upstream availability and invalidates pending candidate work.
  generation++
  detailGeneration++
  try {
    await skipReconciliationFeature({
      project,
      featureId: current.id,
      modifiedAt: current.modifiedAt,
      associationVersion: current.associationVersion,
    })
    if (alive) await load()
  } catch {
    if (alive) dispositionFailure = 'Could not save this skip. Retry before moving on.'
  } finally {
    linking = false
    preparing = false
    searching = false
  }
}
/** Open saved skips so a record can be reset for review. @returns Completion. */
async function previous(): Promise<void> {
  await openList('skipped')
}

onMount(() => {
  header.setHeaderForIndex('Match locations', LocationIcon, {
    showNew: false,
    showFilter: false,
    showLayoutToggle: false,
    showViewActions: true,
  })
  header.setSearch(null)
  // This queue owns its Feature deletion; inherited form callbacks may belong to a destroyed page.
  header.setFormActions({ showDeleteAction: false, toggleDelete: () => {} })
  let storage: Storage | null = null
  try {
    storage = localStorage
  } catch {
    /* Use session memory when storage is disabled. */
  }
  searchCache = createReconciliationCache(storage)
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    if (saved) {
      source = typeof saved.source === 'string' ? saved.source : 'brand'
      radius = [
        50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800,
        850, 900, 950, 1000,
      ].includes(saved.radius)
        ? saved.radius
        : 50
    }
  } catch {
    /* Invalid preferences use defaults. */
  }
  ready = true
  void load(undefined, page.url.searchParams.get('feature') ?? undefined)
})
let previousScope: string | undefined
$effect(() => {
  const scope = roleScope
  if (!ready) return
  if (previousScope !== undefined && previousScope !== scope) {
    untrack(() => {
      queue = null
      displayedQueue = null
      progress = null
      listView = null
      listRequest++
      unavailableRows = []
      linkedSourceIds = []
      void load()
    })
  }
  previousScope = scope
})
// Search state changes invalidate old candidates, canonical reviews and continuation cursors together.
$effect(() => {
  const key = JSON.stringify([
    item?.id,
    query,
    source,
    radius,
    ready,
    loading,
    roleScope,
  ])
  if (!ready || loading) return
  untrack(() => {
    generation++
    detailGeneration++
    candidates = []
    selectedId = null
    canonical = null
    preparing = false
    searching = false
    searchFailure = ''
    detailFailure = ''
    sessionStorage.setItem(storageKey, JSON.stringify({ source, radius }))
  })
  const timer = setTimeout(() => void search(), 300)
  return () => {
    clearTimeout(timer)
    void key
  }
})
// Keep route regions mounted: selection changes only update their props.
$effect(() => {
  header.setTitle(displayedQueue?.item?.name || 'Match locations')
  header.setCrumbs([
    {
      name: displayedQueue?.project.name || 'Project',
      href: `/admin/projects/${project}`,
    },
    { name: 'Match locations' },
  ])
})
$effect(() => {
  header.setTitleMenuItems(
    displayedQueue?.item
      ? [
          {
            label: 'Delete feature',
            icon: TrashIcon,
            disabled: !item || loading || linking || Boolean(listView),
            onSelect: () => void deleteCurrentFeature(),
          },
        ]
      : [],
  )
})
$effect(() => {
  header.setViewActionContent(ReconciliationActions, {
    disabled: !item || loading || linking || Boolean(listView),
    canMark: Boolean(item?.locationId),
    canLink: !preparing && Boolean(selected && canonical),
    canPrevious: skipped > 0,
    onskip: () => void skip(),
    onprevious: () => void previous(),
    onmark: () => void markUnavailable(),
    onlink: () => void link(),
    onunavailable: () => void openList('unavailable'),
    onmatched: () => void openList('matched'),
    onskipped: () => void openList('skipped'),
    skipped,
    matched: progress?.matched ?? 0,
    drafts: progress?.drafts ?? 0,
    total: progress?.total ?? 0,
    unavailable: progress?.unavailable ?? 0,
  })
})
$effect(() => {
  if (listView) header.clearControlBar()
  else
    header.setControlBar(
      ReconciliationControls,
      {
        query,
        source,
        radius,
        fields: displayedQueue?.fields ?? [],
        busy: searching,
        disabled: linking,
        count: searching ? null : candidates.length,
        onquery: (value: string) => {
          if (!linking) query = value
        },
        onsource: (value: string) => {
          if (linking) return
          source = value
          query = item ? reconciliationQuery(item, value) : ''
        },
        onradius: (value: number) => {
          if (!linking) radius = value
        },
      },
      { isVisible: true },
    )
})
onDestroy(() => {
  alive = false
  generation++
  detailGeneration++
  queueGeneration++
  header.setTitleMenuItems([])
  header.clearControlBar()
  header.setSearch(null)
  header.setViewActions([])
  header.setViewActionContent(null, {})
})
</script>

<div class="relative flex h-full min-h-0 flex-col" aria-busy={loading}>
  {#if listView}
    <section
      aria-label={listTitle}
      class="border-border bg-panel absolute inset-0 z-30 flex min-h-0 flex-col p-4"
    >
      <div class="mb-4 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">{listTitle}</h2>
        <div class="flex items-center gap-3">
          <ResourceSortControl
            sorting={unavailableSorting}
            onSortingChange={value => (unavailableSorting = value)}
            sortables={{
              items: [
                { value: 'name', label: 'Name' },
                { value: 'address', label: 'Address' },
                {
                  value: 'date',
                  label:
                    listView === 'matched'
                      ? 'Date matched'
                      : listView === 'skipped'
                        ? 'Date skipped'
                        : 'Date marked unavailable',
                },
              ],
            }}
          />
          <Button text="Back to matching" onClick={() => (listView = null)} />
        </div>
      </div>
      {#if listView === 'skipped'}
        <p class="text-muted-foreground mb-4 text-sm">
          Skips are saved. Reset returns this Feature to the matching queue.
        </p>
      {:else if listView === 'unavailable'}
        <p class="text-muted-foreground mb-4 text-sm">
          Reset returns a Location and its associated Features to the matching queue.
        </p>
      {/if}
      {#if unavailableFailure}
        <p role="alert">{unavailableFailure}</p>
        <Button text="Retry" onClick={() => listView && void openList(listView)} />
      {/if}
      <div class="min-h-0 overflow-auto" aria-busy={unavailableLoading}>
        {#each sortedUnavailableRows as row, index (row.id)}
          <Row
            {index}
            entityId={row.id}
            variant="resource"
            interactive={false}
            class="min-h-20 grid-cols-1"
          >
            <div class="flex w-full items-center gap-4 p-4">
              <div class="min-w-0 flex-1">
                <p class="font-semibold break-words whitespace-normal">{row.name}</p>
                <p class="text-muted-foreground text-sm break-words whitespace-normal">
                  {row.address || 'Address not provided'}
                </p>
              </div>
              <time
                datetime={row.date ?? undefined}
                class="text-muted-foreground w-36 shrink-0 text-right text-sm whitespace-nowrap"
                >{unavailableDate(row.date)}</time
              >
              {#if listView === 'unavailable' || listView === 'skipped'}
                <Button
                  text={resetting === row.id ? 'Resetting…' : 'Reset'}
                  disabled={Boolean(resetting)}
                  onClick={() => void resetUnavailable(row)}
                />
              {/if}
            </div>
          </Row>
        {:else}
          <p class="p-4">
            {unavailableLoading
              ? 'Loading…'
              : listView === 'matched'
                ? 'No matched records.'
                : listView === 'skipped'
                  ? 'No skipped records.'
                  : 'No locations accepted as unavailable.'}
          </p>
        {/each}
      </div>
    </section>
  {/if}
  {#if dispositionFailure}
    <p role="alert" class="border-border border-b px-4 py-2 text-sm">
      {dispositionFailure}
    </p>
  {/if}
  {#if failure}
    <div role="alert" class="p-4">
      {failure}<Button onClick={() => void load()} text="Retry queue" />
    </div>
  {:else if !loading && !item}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h2 class="text-xl">
        {queue?.counts.remaining ? 'End of this pass' : 'All locations reviewed'}
      </h2>
      <p>{queue?.counts.remaining ?? 0} Features still need review.</p>
      <Button onClick={() => void load()} text="Review remaining records" />
    </div>
  {:else}
    <section class="relative min-h-64 flex-1" aria-label="Location reconciliation map">
      {#key item?.id}
        <BrandLocationMap
          {points}
          missing={0}
          busy={searching || loading}
          selected={selectedId}
          focusRequest={mapFocus}
          onselect={id => void select(id)}
          onretry={() => void search()}
        />
      {/key}
      <div
        class="border-border bg-panel/95 absolute top-3 left-3 z-10 max-h-[45%] w-72 max-w-[calc(100%-1.5rem)] overflow-auto rounded-lg border p-2 shadow-lg"
      >
        {#if searchFailure}
          <p role="alert" class="p-2 text-sm">{searchFailure}</p>
          <Button onClick={() => void search()} text="Retry search" />
        {/if}
        {#if !coordinates && item}
          <p class="p-2 text-sm">
            This Feature needs a point location before a nearby search can run.
          </p>
        {:else if !query.trim()}
          <p class="p-2 text-sm">
            No value for this field. Choose another search source or enter a name.
          </p>
        {:else if searching && !candidates.length}
          <div class="p-2" role="status">
            <p class="text-sm">
              Downloading matches for {query}… {downloaded} downloaded
            </p>
            <progress
              class="mt-2 h-2 w-full"
              aria-label="Downloading upstream matches"
            ></progress>
          </div>
        {:else if !candidates.length && !searchFailure}
          <p class="p-2 text-sm">
            No matches within {radius} m. Try another name or a larger radius.
          </p>
        {/if}
        {#each candidates as candidate (candidate.id)}
          <button
            type="button"
            aria-pressed={selectedId === candidate.id}
            onclick={() => void select(candidate.id, true)}
            disabled={linking}
            class="hover:bg-muted border-border aria-pressed:bg-primary/15 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 border-b p-2 text-left text-sm"
          >
            <span class="min-w-0 break-words whitespace-normal"
              >{label(candidate.facts)}</span
            ><span class="text-muted-foreground tabular-nums"
              >{coordinates
                ? Math.round(reconciliationDistance(coordinates, candidate.facts))
                : ''}
              m</span
            >
          </button>
        {/each}
      </div>
      <div
        class={selected && facts && item && reviewExpanded
          ? 'pointer-events-none absolute inset-y-3 right-3 left-80 z-10 grid min-h-0 grid-cols-2 gap-8'
          : 'pointer-events-none absolute inset-x-0 bottom-4 z-10 mx-auto grid max-h-[42%] w-[calc(100%-26rem)] max-w-[82%] grid-cols-2 items-start gap-8'}
      >
        <section
          aria-label="Feature details"
          class={selected && facts && item && reviewExpanded
            ? 'border-border bg-panel pointer-events-auto h-full min-h-0 min-w-0 overflow-auto rounded-lg border p-4 shadow-lg'
            : 'border-border bg-panel/95 pointer-events-auto max-h-[38vh] min-w-0 overflow-auto rounded-lg border p-4 shadow-lg'}
        >
          <h2
            class="text-lg font-semibold [overflow-wrap:anywhere] break-words whitespace-normal"
          >
            {item?.name || 'Loading record…'}
          </h2>
          <p class="text-muted-foreground mt-2 text-sm">Current Feature</p>
          <p class="text-muted-foreground mt-3 text-sm">
            Link adopts the upstream Location. Custom Feature names are kept.
          </p>
          <dl
            class="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 text-sm [&_dd]:[overflow-wrap:anywhere] [&_dd]:whitespace-normal [&>div]:min-w-0"
          >
            <div class="col-span-2">
              <dt class="text-muted-foreground">Address</dt>
              <dd class="break-words whitespace-normal">
                {item?.address || 'Not provided'}
              </dd>
            </div>
            {#each Object.entries(item?.addressProperties ?? {}).filter(
              ([, value]) => typeof value === 'string' && value.trim(),
            ) as [key, value]}
              <div>
                <dt class="text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1')}
                </dt>
                <dd class="break-words whitespace-normal">{String(value)}</dd>
              </div>
            {/each}
            <div>
              <dt class="text-muted-foreground">Brand</dt>
              <dd>{item?.brand || 'Not provided'}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Phone</dt>
              <dd>{item?.phoneNumber?.join(' · ') || 'Not provided'}</dd>
            </div>
          </dl>
          {#if item && !item.locationId}
            <p class="text-muted-foreground mt-3 text-xs">
              Use Skip to finish reviewing this Feature without linking a Location.
            </p>
          {/if}
          {#if skipped}
            <p class="text-muted-foreground mt-2 text-xs">
              {skipped}
              saved skips.
            </p>
          {/if}
        </section>
        {#if selected && facts && item}
          <section
            class={selected && facts && item && reviewExpanded
              ? 'border-border bg-panel pointer-events-auto flex h-full min-h-0 min-w-0 flex-col overflow-auto rounded-lg border p-4 shadow-lg'
              : 'border-border bg-panel/95 pointer-events-auto flex max-h-[38vh] min-w-0 flex-col overflow-auto rounded-lg border p-4 shadow-lg'}
            aria-label="Selected upstream Location"
          >
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div class="min-w-0">
                <h2
                  class="text-lg font-semibold [overflow-wrap:anywhere] break-words whitespace-normal"
                >
                  {label(facts)}
                </h2>
                <p class="text-muted-foreground text-sm">
                  {selected.facts.searchClassification?.taxonomyPrimary ||
                    selected.facts.classification?.taxonomy?.primary ||
                    'Category unavailable'}
                  ·
                  {coordinates
                    ? Math.round(reconciliationDistance(coordinates, selected.facts))
                    : ''}
                  m away
                </p>
              </div>
              <div class="flex items-center gap-1">
                {#key selected.id}
                  <Popover.Root>
                    <Popover.Trigger
                      aria-label="Websites and social profiles"
                      title="Websites and social profiles"
                      class="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md"
                    >
                      <MoreIcon class="size-4" />
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        align="end"
                        sideOffset={8}
                        class="border-border bg-panel text-foreground z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border p-4 shadow-lg"
                      >
                        <dl class="grid gap-3 text-sm [&_dd]:[overflow-wrap:anywhere]">
                          <div>
                            <dt class="text-muted-foreground">Websites</dt>
                            <dd class="break-words">
                              {facts.websites?.join(' · ') || 'Not provided'}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-muted-foreground">Social profiles</dt>
                            <dd class="break-words">
                              {Object.values(facts.socials ?? {}).join(' · ') ||
                                'Not provided'}
                            </dd>
                          </div>
                        </dl>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                {/key}
                <Button
                  size="sm"
                  hideLabel
                  text={reviewExpanded ? 'Show map' : 'Expand review'}
                  iconComponent={reviewExpanded ? CollapseIcon : ExpandIcon}
                  attrs={{ 'aria-expanded': reviewExpanded }}
                  onClick={() => (reviewExpanded = !reviewExpanded)}
                />
              </div>
            </div>
            <dl
              class="mt-3 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 text-sm [&_dd]:[overflow-wrap:anywhere] [&_dd]:whitespace-normal [&>div]:min-w-0"
            >
              <div class="col-span-full">
                <dt class="text-muted-foreground">Names</dt>
                <dd>{Object.values(facts.names).filter(Boolean).join(' · ')}</dd>
              </div>
              <div class="col-span-full">
                <dt class="text-muted-foreground">Address</dt>
                <dd class="break-words whitespace-normal">
                  {selectedAddress || 'Not provided'}
                </dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Phone</dt>
                <dd>{facts.phoneNumber?.join(' · ') || 'Not provided'}</dd>
                {#if !facts.phoneNumber?.length && item.phoneNumber?.length}
                  <p class="text-info mt-2 text-sm">
                    {item.phoneNumber.join(' · ')}
                  </p>
                {/if}
              </div>
              <div>
                <dt class="text-muted-foreground">Brand</dt>
                <dd>
                  {facts.brands
                    .map(
                      brand =>
                        brand.names.en || Object.values(brand.names).find(Boolean),
                    )
                    .join(' · ') || 'Not provided'}
                </dd>
              </div>
            </dl>
            {#if detailFailure}
              <div role="alert" class="mt-3">
                {detailFailure}<Button
                  onClick={() => void select(selected.id)}
                  disabled={linking}
                  text="Retry details"
                />
              </div>
            {/if}
            <div
              class="bg-panel sticky -bottom-4 mt-auto -mb-4 flex shrink-0 items-center justify-end gap-2 py-3"
            >
              <span class="text-muted-foreground mr-1 text-xs tabular-nums">
                {selectedIndex + 1}
                / {candidates.length}
              </span>
              <Button
                size="sm"
                text="Previous"
                iconComponent={PreviousIcon}
                disabled={linking || searching || selectedIndex <= 0}
                onClick={() => stepOption(-1)}
              />
              <Button
                size="sm"
                text="Next"
                iconComponent={NextIcon}
                disabled={linking ||
                  searching ||
                  selectedIndex >= candidates.length - 1}
                onClick={() => stepOption(1)}
              />
            </div>
          </section>
        {:else}
          <section
            aria-label="Upstream Location"
            class="border-border bg-panel/95 pointer-events-auto rounded-lg border p-4 shadow-lg"
          >
            <h2 class="font-semibold">Upstream Location</h2>
            <p class="text-muted-foreground mt-2 text-sm">
              Select a match to compare its details.
            </p>
          </section>
        {/if}
      </div>
    </section>
  {/if}
</div>
