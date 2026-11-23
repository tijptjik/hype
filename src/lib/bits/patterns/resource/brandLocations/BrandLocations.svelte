<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { goto, replaceState, afterNavigate } from '$app/navigation'
import { page } from '$app/state'
import {
  readBrandLocationUrl,
  writeBrandLocationUrl,
} from '#lib/locations/brandLocationUrl.js'
// API
import {
  getBrandLocations,
  discoverBrandLocations,
  addBrandLocationCandidate,
} from '#lib/api/brandLocations.remote.js'
import { getLocations } from '#lib/api/locationDirectory.remote.js'
import { readFreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import EmptyIcon from 'virtual:icons/lucide/map-pin-off'
import { SimpleTooltip } from '#lib/bits/core/tooltip/index.js'
import SaanSeoiMarkIcon from '#lib/bits/patterns/cards/resourceCard/components/SaanSeoiMarkIcon.svelte'
import { BRAND_LOCATION_STATES } from '#lib/locations/brandLocationMap.js'
import HypeMarkIcon from '#lib/bits/patterns/cards/resourceCard/components/HypeMarkIcon.svelte'
import LinkedIcon from 'virtual:icons/lucide/link'
import UnlinkedIcon from 'virtual:icons/lucide/unlink'
import AddIcon from 'virtual:icons/lucide/map-pin-plus'
import type { Component } from 'svelte'
import { Button } from '#lib/bits/core/index.js'
import { TextInput } from '#lib/bits/custom/form/index.js'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import BrandLocationFilterBar from './BrandLocationFilterBar.svelte'
import BrandLocationMap from './BrandLocationMap.svelte'
import MapIcon from 'virtual:icons/lucide/map'
import ListIcon from 'virtual:icons/lucide/list'
import {
  hasMapCoordinates,
  type BrandLocationMapPoint,
} from '#lib/locations/brandLocationMap.js'
import ResourceIcon from '#lib/bits/custom/resourceIcon/ResourceIcon.svelte'
import { FirstClassResource } from '#lib/enums.js'
import { ResourceIndexUi } from '#lib/context/resourceIndexUi.svelte.js'
import Row from '#lib/bits/custom/rows/Row.svelte'
import LocationIcon from 'virtual:icons/lucide/map-pinned'
import LocationIdentityReviewSection from '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// DOMAIN
import { getLocaleKey } from '#lib/i18n.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { placeTaxonomy, type PlaceTaxonomyNode } from '#lib/locations/placeTaxonomy.js'

import type { IdentityCatalogueRecord } from '#lib/locations/identityCatalogue.js'
import type { LocationResource } from '#lib/locations/resource.js'

let {
  brand,
  organisationId,
}: { brand: IdentityCatalogueRecord; organisationId?: string } = $props()
const header = getHeaderCtrl(),
  admin = getAdminCtx()
const listUi = new ResourceIndexUi()
// Sidebar navigation changes the shallow URL, while page.url retains the loaded route.
const currentUrl = $derived(page.shallow?.url ?? page.url)
const initialView = untrack(() =>
  readBrandLocationUrl(currentUrl.searchParams, {
    q: brand.discovery?.terms[0] ?? brand.i18n.en.name,
    category: brand.discovery?.category ?? '',
  }),
)
listUi.state.isControlBarVisible.location = initialView.filters
let q = $state(initialView.q)
let category = $state(initialView.category)
let hype = $state<boolean | null>(initialView.hype),
  upstream = $state<boolean | null>(initialView.upstream),
  linked = $state<boolean | null>(initialView.linked)
let busy = $state(false),
  failure = $state(''),
  searched = $state(false)
let localTotal = $state<number | null>(null)
let cachedLocalRows = $state<LocationResource[]>([])
let localLoaded = $state(false)
let sourceLoaded = $state(false)
type Candidate = Awaited<ReturnType<typeof discoverBrandLocations>>['rows'][number]
let cachedSourceRows = $state<Candidate[]>([])
const localRows = $derived(
  cachedLocalRows.filter(
    row =>
      hype !== false &&
      (upstream === null || Boolean(row.ssId) === upstream) &&
      (linked === null || Boolean(row.hasLinkedFeatures) === linked),
  ),
)
const sourceRows = $derived(
  cachedSourceRows.filter(
    row =>
      upstream !== false &&
      (hype === null || Boolean(row.locationId) === hype) &&
      (linked === null || row.linked === linked),
  ),
)
type CachedSearch = {
  local: LocationResource[]
  source: Candidate[]
  localLoaded: boolean
  sourceLoaded: boolean
  localCursor: string | null
  sourceCursor: string | null
  total: number | null
}
const searchCache = new Map<string, CachedSearch>()
let activeSearchKey = ''
let localCursor = $state<string | null>(null),
  sourceCursor = $state<string | null>(null)
let targetSearch = $state(''),
  targetId = $state(''),
  selectedCandidate = $state<Candidate | null>(null)
let review = $state<{ locationId: string; reviewId: string } | null>(null)
let mapView = $state(initialView.map)
// Shallow URL updates keep cached results and the mounted map intact.
$effect(() => {
  const state = {
    q,
    category,
    hype,
    upstream,
    linked,
    filters: listUi.state.isControlBarVisible.location,
    map: mapView,
  }
  untrack(() => {
    if (currentUrl.searchParams.get('facet') !== 'locations') return
    const next = writeBrandLocationUrl(currentUrl, state)
    if (next.href !== currentUrl.href) replaceState(next, page.state)
  })
})
// Restore controls when navigating to another saved discovery URL in this component.
afterNavigate(() => {
  if (currentUrl.searchParams.get('facet') !== 'locations') return
  const state = readBrandLocationUrl(currentUrl.searchParams, {
    q: brand.discovery?.terms[0] ?? brand.i18n.en.name,
    category: brand.discovery?.category ?? '',
  })
  q = state.q
  category = state.category
  hype = state.hype
  upstream = state.upstream
  linked = state.linked
  mapView = state.map
  listUi.state.isControlBarVisible.location = state.filters
})
let selectedMapId = $state<string | null>(null)
const mapPoints = $derived.by(() => {
  const points: BrandLocationMapPoint[] = []
  for (const row of localRows) {
    const coordinates = row.facts?.location.geometry.coordinates
    if (hasMapCoordinates(coordinates))
      points.push({
        id: `hype:${row.id}`,
        name:
          row.facts?.names[canonicalContentTag(getLocaleKey())] ??
          row.facts?.names.en ??
          row.id,
        coordinates,
        hype: true,
        upstream: Boolean(row.ssId),
        linked: Boolean(row.hasLinkedFeatures),
      })
  }
  for (const row of sourceRows) {
    if (localRows.some(local => local.id === row.locationId)) continue
    if (hasMapCoordinates(row.coordinates))
      points.push({
        id: `source:${row.ssId}`,
        name: row.name,
        coordinates: row.coordinates,
        hype: Boolean(row.locationId),
        upstream: true,
        linked: row.linked,
      })
  }
  return points
})
const missingMapCoordinates = $derived(
  localRows.length +
    sourceRows.filter(row => !localRows.some(local => local.id === row.locationId))
      .length -
    mapPoints.length,
)
// Map mode consumes all matching pages without refitting the user-controlled camera.
$effect(() => {
  if (mapView && searched && !busy && !failure) {
    if (hype !== false && localCursor) void search('local')
    else if (upstream !== false && sourceCursor) void search('source')
  }
})
$effect(() => {
  const showingMap = mapView
  const text = showingMap ? 'Show list' : 'Show map'
  // Late catalogue metadata resets header actions; retain ownership of this embedded view.
  if (
    header.state.meta.viewActions.some(
      action => action.id === 'brand-location-map' && action.text === text,
    )
  )
    return
  header.setViewActions([
    {
      id: 'brand-location-map',
      text,
      icon: showingMap ? ListIcon : MapIcon,
      color: 'neutral',
      style: 'ghost',
      class: 'px-4',
      alwaysHideLabel: true,
      onClick: () => {
        mapView = !mapView
      },
    },
  ])
})
// Cached map results are revealed in small list batches, avoiding hundreds of mounted action rows.
let listLimit = $state(60)
const hasCachedListRows = $derived(
  localRows.length +
    sourceRows.filter(row => !localRows.some(local => local.id === row.locationId))
      .length >
    listLimit,
)
$effect(() => {
  void mapView
  void q
  void category
  void hype
  void upstream
  void linked
  listLimit = 60
})
let generation = 0
let continuation = $state<HTMLDivElement>()
// Reobserve after each page so short or filtered-empty pages keep loading while visible.
$effect(() => {
  if (
    !continuation ||
    busy ||
    failure ||
    (!hasCachedListRows &&
      !(hype !== false && localCursor) &&
      !(upstream !== false && sourceCursor))
  )
    return
  const observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect()
        if (hasCachedListRows) listLimit += 60
        else void search(hype !== false && localCursor ? 'local' : 'source')
      }
    },
    { rootMargin: '300px' },
  )
  observer.observe(continuation)
  return () => observer.disconnect()
})
/** Flatten the existing taxonomy for the standard category picker. @param nodes Taxonomy subtree. @returns Selectable identifiers. */
function categories(nodes: PlaceTaxonomyNode[]): string[] {
  return nodes.flatMap(node => [node.name, ...categories(node.children ?? [])])
}
const categoryOptions = categories(placeTaxonomy)
const targetRequest = $derived(
  selectedCandidate && targetSearch.trim()
    ? getLocations({ q: targetSearch, organisationId, includeCount: false })
    : null,
)
$effect(() => {
  header.setSearch({
    query: q,
    indexView: true,
    resourceType: FirstClassResource.location,
    listUi,
    placeholder: 'Search locations',
    onFilter: value => {
      q = value.slice(0, 200)
    },
  })
})
// Status toggles filter retained evidence synchronously; only a different search scope resets it.
$effect(() => {
  const key = JSON.stringify([brand.id, organisationId, q, category, getLocaleKey()])
  generation++
  activeSearchKey = key
  const saved = searchCache.get(key)
  cachedLocalRows = saved?.local ?? []
  cachedSourceRows = saved?.source ?? []
  localLoaded = saved?.localLoaded ?? false
  sourceLoaded = saved?.sourceLoaded ?? false
  localCursor = saved?.localCursor ?? null
  sourceCursor = saved?.sourceCursor ?? null
  localTotal = saved?.total ?? null
  searched = Boolean(saved)
  failure = ''
  if (saved) {
    busy = false
    return
  }
  busy = true
  const timer = setTimeout(() => {
    busy = false
    void search()
  }, 300)
  return () => clearTimeout(timer)
})
// A new toggle can need an unread stream, but never refetches already loaded pages.
$effect(() => {
  if (
    !busy &&
    !failure &&
    ((hype !== false && !localLoaded) ||
      (upstream !== false && (q.trim() || category.trim()) && !sourceLoaded))
  )
    void search()
})
$effect(() => {
  header.setControlBar(
    BrandLocationFilterBar,
    {
      hype,
      upstream,
      linked,
      category,
      categories: categoryOptions,
      count:
        searched &&
        !failure &&
        (hype === false || (localLoaded && !localCursor)) &&
        (upstream === false ||
          !(q.trim() || category.trim()) ||
          (sourceLoaded && !sourceCursor))
          ? localRows.length +
            sourceRows.filter(
              row => !localRows.some(local => local.id === row.locationId),
            ).length
          : null,
      busy,
      onHype: value => {
        hype = value
      },
      onUpstream: value => {
        upstream = value
      },
      onLinked: value => {
        linked = value
      },
      onCategory: value => {
        category = value
      },
      onReset: () => {
        hype = null
        upstream = null
        linked = null
        category = ''
      },
    },
    { isVisible: listUi.state.isControlBarVisible.location },
  )
})
onDestroy(() => {
  generation++
  header.setSearch(null)
  header.clearControlBar()
  header.setViewActions([])
})
/** Navigate without losing the organisation access context. @param id Location identity. @returns Detail URL. */
function href(id: string): string {
  return `/admin/locations/${encodeURIComponent(id)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`
}
/** Execute independent local/source pages and preserve explicit continuations. @param more Optional page stream. @returns Completion after all requested reads. */
async function search(more?: 'local' | 'source'): Promise<void> {
  const fetchLocal =
    hype !== false && more !== 'source' && (more === 'local' || !localLoaded)
  const fetchSource =
    upstream !== false &&
    Boolean(q.trim() || category.trim()) &&
    more !== 'local' &&
    (more === 'source' || !sourceLoaded)
  if (busy || (!fetchLocal && !fetchSource)) return
  const token = ++generation
  const cacheKey = activeSearchKey
  busy = true
  failure = ''
  try {
    const [localResult, sourceResult] = await Promise.allSettled([
      fetchLocal
        ? readFreshRemoteQuery(
            getBrandLocations({
              brandId: brand.id,
              organisationId,
              q,
              taxonomyCategory: category || undefined,
              after: more === 'local' ? (localCursor ?? undefined) : undefined,
            }),
            true,
          )
        : null,
      fetchSource
        ? readFreshRemoteQuery(
            discoverBrandLocations({
              brandId: brand.id,
              organisationId,
              q,
              locale:
                getLocaleKey() === 'zhHant'
                  ? 'zh-hant'
                  : getLocaleKey() === 'zhHans'
                    ? 'zh-hans'
                    : 'en',
              filters: category ? { taxonomyCategory: category } : undefined,
              cursor: more === 'source' ? (sourceCursor ?? undefined) : undefined,
            }),
            true,
          )
        : null,
    ])
    if (token !== generation) return
    const local = localResult.status === 'fulfilled' ? localResult.value : null
    const source = sourceResult.status === 'fulfilled' ? sourceResult.value : null
    if (localResult.status === 'rejected' || sourceResult.status === 'rejected') {
      failure = `${localResult.status === 'rejected' ? 'Hype' : 'SaanSeoi'} search failed. Retry the search.`
    }
    if (local) {
      if (local.totalCount !== null) localTotal = local.totalCount
      cachedLocalRows = more ? [...cachedLocalRows, ...local.data] : local.data
      localLoaded = true
      localCursor = local.nextCursor
    }
    if (source) {
      cachedSourceRows = [
        ...new Map(
          [...(more ? cachedSourceRows : []), ...source.rows].map(row => [
            row.ssId,
            row,
          ]),
        ).values(),
      ]
      sourceCursor = source.nextCursor
      sourceLoaded = true
    }
    searchCache.set(cacheKey, {
      local: cachedLocalRows,
      source: cachedSourceRows,
      localLoaded,
      sourceLoaded,
      localCursor,
      sourceCursor,
      total: localTotal,
    })
    if (searchCache.size > 12) searchCache.delete(searchCache.keys().next().value!)
    searched = true
  } catch {
    if (token === generation) failure = 'Unable to load locations. Retry the search.'
  } finally {
    if (token === generation) busy = false
  }
}
/** Add exact evidence or open the existing identity comparison. @param candidate Explicit user selection. @param locationId Optional target. @returns Completion. */
async function add(candidate: Candidate, locationId?: string): Promise<void> {
  busy = true
  failure = ''
  try {
    const result = await addBrandLocationCandidate({
      brandId: brand.id,
      organisationId,
      ssId: candidate.ssId,
      resourceReleaseId: candidate.resourceReleaseId,
      locationId,
    })
    if (result.reviewId)
      review = { locationId: result.locationId, reviewId: result.reviewId }
    else await goto(href(result.locationId))
  } catch {
    failure = 'Unable to add this candidate. Its source may have changed; search again.'
  } finally {
    busy = false
  }
}
let selectedBarWidth = $state(0)
const compactMapBar = $derived(mapView && selectedBarWidth < 640)
let mapMounted = $state(false)
$effect(() => {
  if (mapView) mapMounted = true
})
</script>

{#snippet statusIcon(
  Icon: Component<{ class?: string }>,
  label: string,
  positive = false,
  palette = { yes: '#237b70', no: '#a65363' },
)}
  <SimpleTooltip>
    {#snippet trigger()}
      <button
        type="button"
        class="relative inline-flex"
        style:color={positive ? palette.yes : palette.no}
        aria-label={label}
        onclick={event => event.stopPropagation()}
        onkeydown={event => event.stopPropagation()}
      >
        <Icon class="size-5" />
        {#if !positive}
          <svg
            class="pointer-events-none absolute inset-0 size-5"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M3 17L17 3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        {/if}
      </button>
    {/snippet}
    {#snippet children()}
      {label}
    {/snippet}
  </SimpleTooltip>
{/snippet}

<div
  class={mapView
    ? '@container relative h-full min-h-0 w-full overflow-hidden'
    : 'flex w-full flex-col gap-1.5 px-4 py-3'}
  data-brand-locations
>
  {#if failure && !mapView}
    <p role="alert">{failure}</p>
  {/if}
  {#if mapMounted}
    <div class={mapView ? 'absolute inset-0' : 'hidden'}>
      <BrandLocationMap
        active={mapView}
        points={mapPoints}
        missing={missingMapCoordinates}
        {busy}
        {failure}
        onretry={() =>
          search(localCursor ? 'local' : sourceCursor ? 'source' : undefined)}
        selected={selectedMapId}
        onselect={id => (selectedMapId = id)}
      />
    </div>
  {/if}
  {#if !mapView && busy && (localRows.length || sourceRows.length)}
    <span role="status" aria-label="Loading locations" class="sr-only"
      >Updating locations</span
    >
  {:else if busy && !mapView}
    <div role="status" aria-label="Loading locations" class="grid gap-1.5">
      <span class="sr-only">Loading locations</span>
      {#each Array(localRows.length || sourceRows.length ? 2 : 6) as _, index}
        <div aria-hidden="true" data-location-row-skeleton>
          <Row
            {index}
            variant="resource"
            interactive={false}
            isFocusable={false}
            onclick={() => undefined}
            onkeydown={() => undefined}
            class="grid-cols-[minmax(0,1fr)_auto] pr-4"
          >
            <div class="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
              <Skeleton class="size-16 rounded-md" />
              <div class="grid min-w-0 gap-2 py-2">
                <Skeleton class="h-4 w-40 max-w-full" />
                <Skeleton class="h-3 w-80 max-w-full" />
              </div>
            </div>
            <div class="grid grid-cols-[10rem_20rem] items-center gap-x-8 gap-y-2 py-1">
              <div class="flex items-center gap-4">
                {#each [0, 1, 2] as icon (icon)}
                  <Skeleton class="size-5 rounded-full" />
                {/each}
              </div>
              <div class="flex gap-2">
                <Skeleton class="h-8 w-32 rounded-xl" />
                {#if hype !== true}
                  <Skeleton class="h-8 w-32 rounded-xl" />
                {/if}
              </div>
            </div>
          </Row>
        </div>
      {/each}
    </div>
  {/if}
  <div
    bind:clientWidth={selectedBarWidth}
    data-map-selection={mapView || undefined}
    class={mapView
      ? 'absolute inset-x-3 bottom-32 z-10 max-h-[35%] overflow-auto @min-[700px]:right-52 @min-[700px]:bottom-3'
      : 'contents'}
  >
    {#if searched}
      {#each localRows.filter((row, index) =>
        mapView ? selectedMapId === `hype:${row.id}` : index < listLimit,
      ) as row, index (row.id)}
        <Row
          {index}
          variant="resource"
          entityId={row.id}
          title={mapView
            ? ''
            : (row.facts?.names?.[canonicalContentTag(getLocaleKey())] ??
              row.facts?.names?.en ??
              row.id)}
          description=""
          class="grid-cols-[minmax(0,1fr)_auto] pr-4"
          onclick={() => goto(href(row.id))}
          onkeydown={event => {
            if (event.key === 'Enter') void goto(href(row.id))
          }}
        >
          {#snippet imageFallback()}
            <ResourceIcon src={brand.logo} class="m-2 size-12" />
          {/snippet}
          {#if mapView}
            <div
              class="flex min-w-0 items-center gap-3"
              title={row.facts?.names?.[canonicalContentTag(getLocaleKey())] ??
                row.facts?.names?.en ??
                row.id}
            >
              <ResourceIcon src={brand.logo} class="m-2 size-12 shrink-0" />
              {#if !compactMapBar}
                <span class="min-w-0 font-semibold break-words whitespace-normal"
                  >{row.facts?.names?.[canonicalContentTag(getLocaleKey())] ??
                    row.facts?.names?.en ??
                    row.id}</span
                >
              {/if}
            </div>
          {/if}
          <div
            class={mapView
              ? 'flex shrink-0 items-center justify-end gap-2'
              : 'grid grid-cols-[10rem_20rem] items-center gap-8'}
          >
            {#if !mapView}
              <div class="flex items-center gap-4">
                {@render statusIcon(
                  HypeMarkIcon,
                  'Available in Hype',
                  true,
                  BRAND_LOCATION_STATES[0],
                )}
                {@render statusIcon(
                  SaanSeoiMarkIcon,
                  row.ssId ? 'Available in SaanSeoi' : 'No SaanSeoi record',
                  Boolean(row.ssId),
                  BRAND_LOCATION_STATES[1],
                )}
                {@render statusIcon(
                  row.hasLinkedFeatures ? LinkedIcon : UnlinkedIcon,
                  row.hasLinkedFeatures ? 'Has linked features' : 'No linked features',
                  Boolean(row.hasLinkedFeatures),
                  BRAND_LOCATION_STATES[2],
                )}
              </div>
            {/if}
            <Button
              class="justify-self-end"
              text="Show Location"
              iconComponent={LocationIcon}
              style="outline"
              size="sm"
              href={href(row.id)}
            />
          </div>
        </Row>
      {/each}
      {#each sourceRows
        .filter(
          row =>
            !localRows.some(local => local.id === row.locationId) &&
            (!mapView || selectedMapId === `source:${row.ssId}`),
        )
        .slice(
          0,
          mapView ? undefined : Math.max(0, listLimit - localRows.length),
        ) as row, index (row.ssId)}
        <Row
          index={localRows.length + index}
          entityId={row.ssId}
          variant="resource"
          class="grid-cols-[minmax(0,1fr)_auto] pr-4"
          interactive={Boolean(row.locationId)}
          isFocusable={Boolean(row.locationId)}
          onclick={() => {
            if (row.locationId) void goto(href(row.locationId))
          }}
          onkeydown={event => {
            if (
              event.key === 'Enter' &&
              row.locationId &&
              event.target === event.currentTarget
            )
              void goto(href(row.locationId))
          }}
        >
          <div
            title={mapView ? row.name : undefined}
            class={mapView
              ? 'flex min-w-0 items-center gap-3'
              : 'grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-4'}
          >
            <div
              class="bg-base-200 flex size-16 shrink-0 items-center justify-center rounded-md"
            >
              {#if row.match === 'brand'}
                <ResourceIcon src={brand.logo} class="size-12" />
              {:else}
                <LocationIcon class="size-8" />
              {/if}
            </div>
            {#if !compactMapBar}
              <div class="min-w-0 py-2">
                <div class="text-base font-semibold break-words whitespace-normal">
                  {row.name}
                </div>
                <div
                  class="text-muted-foreground text-sm break-words whitespace-normal"
                >
                  {row.address || row.ssId}
                </div>
              </div>
            {/if}
          </div>
          <div
            class={mapView
              ? 'flex shrink-0 items-center justify-end gap-2 py-1'
              : 'grid grid-cols-[10rem_20rem] items-center gap-x-8 gap-y-2 py-1'}
          >
            {#if !mapView}
              <div class="text-muted-foreground flex items-center gap-4">
                {@render statusIcon(
                  HypeMarkIcon,
                  row.locationId ? 'Available in Hype' : 'Not yet in Hype',
                  Boolean(row.locationId),
                  BRAND_LOCATION_STATES[0],
                )}
                {@render statusIcon(
                  SaanSeoiMarkIcon,
                  'Available in SaanSeoi',
                  true,
                  BRAND_LOCATION_STATES[1],
                )}
                {@render statusIcon(
                  row.linked ? LinkedIcon : UnlinkedIcon,
                  row.linked ? 'Has linked features' : 'No linked features',
                  row.linked,
                  BRAND_LOCATION_STATES[2],
                )}
              </div>
            {/if}
            {#if row.locationId}
              <Button
                class="justify-self-end"
                text="Show Location"
                iconComponent={LocationIcon}
                style="outline"
                size="sm"
                href={href(row.locationId)}
              />
            {:else if admin.view.isSuperAdmin()}
              <div
                class={mapView && selectedBarWidth < 420
                  ? 'flex flex-col items-end gap-2'
                  : 'flex flex-wrap justify-end gap-2'}
              >
                <SimpleTooltip>
                  {#snippet trigger()}
                    <Button
                      text="Link Location"
                      iconComponent={LinkedIcon}
                      size="sm"
                      style="outline"
                      disabled={busy}
                      onClick={() => {
                        selectedCandidate = row
                        targetSearch = row.name
                        targetId = ''
                        review = null
                      }}
                    />
                  {/snippet}
                  {#snippet children()}
                    Choose an existing Hype location and review linking it to this
                    SaanSeoi record.
                  {/snippet}
                </SimpleTooltip>
                <SimpleTooltip>
                  {#snippet trigger()}
                    <Button
                      text="Add Location"
                      iconComponent={AddIcon}
                      size="sm"
                      style="outline"
                      color="primary"
                      disabled={busy}
                      onClick={() => add(row)}
                    />
                  {/snippet}
                  {#snippet children()}
                    Create a Hype location from this SaanSeoi record.
                  {/snippet}
                </SimpleTooltip>
              </div>
            {/if}
          </div>
        </Row>
      {/each}
      {#if !mapView &&
        (hasCachedListRows ||
          (hype !== false && localCursor) ||
          (upstream !== false && sourceCursor))}
        <div
          bind:this={continuation}
          class="h-8 shrink-0"
          data-location-continuation
        ></div>
        {#if failure}
          <Button
            text="Retry loading locations"
            onClick={() => search(localCursor ? 'local' : 'source')}
          />
        {/if}
      {/if}
      {#if !mapView &&
        !busy &&
        !failure &&
        !(hype !== false && localCursor) &&
        !(upstream !== false && sourceCursor) &&
        !localRows.length &&
        !sourceRows.length}
        <div
          class="text-muted-foreground flex min-h-[calc(100dvh-12rem)] flex-1 items-center justify-center"
          role="status"
          aria-label="No matching locations"
        >
          <div class="bg-base-200/50 rounded-full p-8">
            <EmptyIcon class="size-16 opacity-60" />
          </div>
        </div>
      {/if}
    {/if}
  </div>
  {#if selectedCandidate}
    <section
      class={`border-border grid gap-4 rounded-lg border p-5 ${mapView ? 'bg-panel absolute inset-x-3 top-3 z-20 max-h-[80%] overflow-auto' : ''}`}
      aria-label="Link existing Location"
    >
      <h3>Link {selectedCandidate.name}</h3>
      <TextInput label="Find existing Location" bind:value={targetSearch} />
      <SearchSelect
        label="Existing Location"
        plain
        items={(targetRequest?.current?.data ?? [])
          .filter(row => row.state !== 'manual')
          .map(row => ({ value: row.id, label: row.facts?.names?.en ?? row.id }))}
        value={targetId}
        onSelect={value => (targetId = value ?? '')}
      />
      <div class="flex gap-3">
        <Button
          text="Review link"
          disabled={busy || !targetId}
          onClick={() => selectedCandidate && add(selectedCandidate, targetId)}
        /><Button
          text="Cancel"
          style="ghost"
          onClick={() => {
            selectedCandidate = null
            review = null
          }}
        />
      </div>
      {#if review}
        <LocationIdentityReviewSection
          featureId=""
          locationId={review.locationId}
          initialReviewId={review.reviewId}
          isDirty={false}
          onCommitted={async () => {
            if (review) await goto(href(review.locationId))
          }}
        />
      {/if}
    </section>
  {/if}
</div>
