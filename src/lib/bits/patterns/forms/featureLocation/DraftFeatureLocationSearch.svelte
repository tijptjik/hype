<script lang="ts">
// SVELTE
import { onDestroy, tick, untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import { searchBuildingNames } from '#lib/locations/buildingSearch.js'
import { groupDraftSearchResults } from '#lib/locations/draftSearchGroups.js'
import AddressSearchParts from './AddressSearchParts.svelte'
import PlaceSearchFiltersPanel from './PlaceSearchFilters.svelte'
import {
  locationDistance,
  placeTaxonomyLabel,
  locationSearchColor,
} from '#lib/locations/searchPresentation.js'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// ICONS
import { loadAddressNames, structurePlaceAddress } from '#lib/addresses/nameCatalogue.js'
import UnlinkIcon from 'virtual:icons/lucide/unlink'
import BackIcon from 'virtual:icons/lucide/arrow-left'
import SearchIcon from 'virtual:icons/lucide/search'
import ClearIcon from 'virtual:icons/lucide/x'
import FilterIcon from 'virtual:icons/lucide/list-filter'
// API
import {
  searchDraftLocations,
  searchNearbyDraftLocations,
} from '#lib/api/draftLocation.remote.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
// I18N
import { getLocale, getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type { PlaceSearchFilters } from '#lib/locations/placeSearchFilters.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

const searchKinds = ['establishment', 'building', 'address'] as const

type Result = {
  id: string
  kind: 'establishment' | 'building' | 'address'
  names: Record<string, string>
  taxonomyLabel?: string
  source?: { ssId: string; resourceReleaseId: string }
  nameMode?: 'independent' | 'inherit'
  address: FeatureAddress
}
let {
  active,
  focusRequest,
  onSelect,
  onPreview,
  onAcceptedChange,
  onResultsChange,
  onResultsEnd,
  onUnlink,
  onBack,
  onFilterPanelChange,
  onMapCandidates,
  onDropPin,
  onManualEntry,
  onModeChange,
  hasPin = false,
  coordinates,
  children,
}: {
  active: boolean
  focusRequest: number
  onUnlink?: () => void
  onPreview?: (result: Result) => void
  onAcceptedChange?: (accepted: boolean) => void
  onResultsChange?: (hasResults: boolean) => void
  onResultsEnd?: () => boolean
  onSelect: (result: Result) => void
  onBack?: () => void
  onFilterPanelChange?: (panel: Snippet | undefined) => void
  onMapCandidates?: (
    markers: import('#lib/locations/searchPresentation.js').LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  onManualEntry?: () => void
  onModeChange?: (mode: 'search' | 'pin') => void
  onDropPin?: () => void
  hasPin?: boolean
  coordinates?: [number, number]
  children?: Snippet<[Snippet<[Snippet?]>, Snippet, Snippet]>
} = $props()
let input: HTMLInputElement | undefined = $state()
let query = $state('')
let findMode = $state<'search' | 'pin'>('search')
let nearbyButton: HTMLButtonElement | undefined = $state()
$effect(() => onModeChange?.(findMode))
/** Switch discovery controls and direct attention to the selected input.
 * @param mode Search by text or by a map pin.
 * @returns Nothing.
 */
function setFindMode(mode: 'search' | 'pin'): void {
  clearSearch()
  findMode = mode
  if (mode === 'pin') onDropPin?.()
  void tick().then(() => {
    const target = mode === 'search' ? input : nearbyButton
    target?.focus()
    if (!prefersReducedMotion.current) target?.animate(
      [
        { boxShadow: '0 0 0 0 transparent', offset: 0 },
        { boxShadow: '0 0 0 5px var(--color-primary)', offset: 0.2 },
        { boxShadow: '0 0 0 5px var(--color-primary)', offset: 0.5 },
        { boxShadow: '0 0 0 0 transparent' },
      ],
      { duration: 380, iterations: 2 },
    )
  })
}
let filters = $state<PlaceSearchFilters>({ operatingStatus: 'open' })
let filtersOpen = $state(false)
let filterButton: HTMLButtonElement | undefined = $state()
const filterCount = $derived(Object.entries(filters).filter(([key, value]) => Boolean(value) && !(key === 'operatingStatus' && value === 'open')).length)
$effect(() => {
  onFilterPanelChange?.(filtersOpen ? filterPanel : undefined)
})
$effect(() => {
  if (!active) filtersOpen = false
})
/** Close the panel without applying draft edits and restore keyboard focus.
 * @returns Nothing.
 */
function closeFilters(): void {
  filtersOpen = false
  void tick().then(() => filterButton?.focus())
}
/** Apply all filters together; stale results are invalidated before rerunning.
 * @param value Accepted category and status filters. @returns Nothing.
 */
function applyFilters(value: PlaceSearchFilters): void {
  filters = { ...value }
  if (value.basicCategory || value.taxonomyPrimary || value.taxonomyCategory) includeShops = true
  expandedGroup = null
  selected = null
  accepted = false
  closeFilters()
  if (nearbyMode) {
    clearTimeout(timer)
    void search(true)
  } else schedule()
}
/** Clear query, pending work, results and map previews while retaining chosen filters.
 * @returns Nothing.
 */
function clearSearch(): void {
  query = ''
  schedule()
  previousRows = []
  previousQuery = ''
  hovered = null
  nearbyMode = false
  void tick().then(() => { if (findMode === 'search') input?.focus() })
}
let radius = $state(300)
let nearbyMode = $state(false)
let resultsElement: HTMLElement | undefined = $state()
let includeShops = $state(true)
let includeAddresses = $state(true)
let includeBuildings = $state(true)
const searchBuildings = $derived(includeBuildings && findMode === 'search')
const hasPlaceCategory = $derived(Boolean(filters.basicCategory || filters.taxonomyPrimary || filters.taxonomyCategory))
const searchAddresses = $derived(includeAddresses && !hasPlaceCategory)
let subsetBackButton: HTMLButtonElement | undefined = $state()
const hasSearchTypes = $derived(includeShops || searchAddresses || searchBuildings)
let showSearchTypePrompt = $state(false)
// Allow quick inclusion changes before replacing the search control with guidance.
$effect(() => {
  showSearchTypePrompt = false
  if (hasSearchTypes) return
  const promptTimer = setTimeout(() => { showSearchTypePrompt = true }, 2000)
  return () => clearTimeout(promptTimer)
})
let selected = $state<Result | null>(null)
let accepted = $state(false)
let linked = $state(false)
let expandedGroup = $state<string | null>(null)
$effect(() => onAcceptedChange?.(accepted))
$effect(() => onResultsChange?.(rows.length > 0))
let previousRows: Result[] = []
let previousQuery = ''
let previousScrollTop = 0
let receivedRows = $state.raw<Result[]>([])
let requestedKinds = new Set<Result['kind']>()
// Keep provider ranking within each kind while late responses reorder both list and map.
const rows = $derived(
  receivedRows.filter(row => row.kind === 'establishment' ? includeShops : row.kind === 'building' ? searchBuildings : searchAddresses).toSorted(
    (a, b) => searchKinds.indexOf(a.kind) - searchKinds.indexOf(b.kind),
  ),
)
const groups = $derived(groupDraftSearchResults(rows))
const currentGroup = $derived(
  groups.find(group => group.members.some(row => row.id === expandedGroup)),
)
const visibleRows = $derived(
  currentGroup?.members ?? groups.map(group => group.representative),
)
let loading = $state(false)
let placesFailed = $state(false)
let placesPartial = $state(false)
let placesLimited = $state(false)
let addressesFailed = $state(false)
let buildingsFailed = $state(false)
let hovered = $state<string | null>(null)
let searched = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined
let version = 0
let addressController: AbortController | undefined
$effect(() => {
  if (active && focusRequest && input) void tick().then(() => input?.focus())
})
/** Debounce typed search and invalidate older responses immediately.
 * @returns Nothing.
 */
function schedule(): void {
  clearTimeout(timer)
  selected = null
  accepted = false
  expandedGroup = null
  version++
  addressController?.abort()
  receivedRows = []
  placesFailed = false
  placesPartial = false
  placesLimited = false
  addressesFailed = false
  buildingsFailed = false
  searched = false
  loading = Boolean(query.trim()) && hasSearchTypes
  if (query.trim() && hasSearchTypes) timer = setTimeout(() => void search(), 300)
}
/** Search Places and building/address evidence independently, retaining partial results.
 * @returns Completion of the latest read-only search.
 */
async function search(nearby = false): Promise<void> {
  nearbyMode = nearby
  const request = ++version
  const q = query.trim()
  if ((!nearby && !q) || (nearby && !coordinates) || !hasSearchTypes) {
    loading = false
    return
  }
  loading = true
  requestedKinds = new Set(searchKinds.filter(kind => kind === 'establishment' ? includeShops : kind === 'building' ? searchBuildings && !nearby : searchAddresses))
  addressController?.abort()
  addressController = new AbortController()
  receivedRows = []
  placesFailed = false
  placesPartial = false
  placesLimited = false
  addressesFailed = false
  buildingsFailed = false
  searched = false
  let pending = Number(includeShops) + Number(searchAddresses) + Number(searchBuildings && !nearby)
  // Publish each provider immediately; a slow provider must not hide usable results.
  const finish = (): void => {
    if (request !== version) return
    pending--
    loading = pending > 0
    searched = true
  }
  await Promise.allSettled([
    searchBuildings && !nearby
      ? searchBuildingNames(q, getLocaleKey(), () => request === version)
          .then(buildings => { if (request === version) receivedRows = [...receivedRows, ...buildings] })
          .catch(() => { if (request === version) buildingsFailed = true })
          .finally(finish)
      : Promise.resolve(),
    includeShops
      ? Promise.resolve(
          nearby && coordinates
            ? searchNearbyDraftLocations({ coordinates, radius, filters })
            : searchDraftLocations({ q, locale: getLocale(), limit: 5, filters }),
        )
          .then(async places => {
            const streets = await loadAddressNames('streets').catch(() => [])
            if (request !== version) return
            placesPartial = places.partial
            placesLimited = 'limited' in places && places.limited === true
            receivedRows = [
              ...receivedRows,
              ...places.rows.map(place => ({
                id: `place:${place.id}`,
                kind: 'establishment' as const,
                source: { ssId: place.id, resourceReleaseId: place.resourceReleaseId },
                names: place.facts.names,
                taxonomyLabel: placeTaxonomyLabel(place.facts.classification),
                address: structurePlaceAddress({
                  version: 1 as const,
                  source: place.facts.location.address,
                  coordinates: place.facts.location.geometry.coordinates,
                  matchStatus: place.facts.location.address.status,
                  overrides: {},
                }, streets),
              })),
            ]
          })
          .catch(() => {
            if (request === version) placesFailed = true
          })
          .finally(finish)
      : Promise.resolve(),
    searchAddresses
      ? geocodeAddressCandidates(
          nearby && coordinates
            ? { lng: coordinates[0], lat: coordinates[1] }
            : { address: q },
          {
            signal: addressController.signal,
            ...(nearby
              ? { maxDistance: radius, limit: 50, candidateCoordinates: true }
              : {}),
          },
        )
          .then(addresses => {
            if (request !== version) return
            receivedRows = [
              ...receivedRows,
              ...addresses.flatMap(result => {
                const address = result.addressMeta.address
                if (
                  !address ||
                  (nearby &&
                    coordinates &&
                    address.coordinates &&
                    locationDistance(coordinates, address.coordinates) > radius)
                )
                  return []
                return [
                  {
                    id: `address:${address.source.address2dId || getAddressDisplay(address, getLocaleKey())}:${address.coordinates?.join(',') || ''}`,
                    kind: 'address' as const,
                    address,
                    names: Object.fromEntries(
                      Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => {
                        const values = getAddressLocale(
                          address,
                          locale as keyof typeof ADDRESS_LOCALES,
                        )
                        return [
                          tag,
                          [values.buildingName, values.premisesName].find(
                            (value): value is string =>
                              typeof value === 'string' && Boolean(value),
                          ) || '',
                        ]
                      }),
                    ),
                  },
                ]
              }),
            ]
          })
          .catch(() => {
            if (request === version) addressesFailed = true
          })
          .finally(finish)
      : Promise.resolve(),
  ])
}
/** Highlight previews without changing the draft's accepted marker.
 * @returns Nothing.
 */
function publishMarkers(): void {
  const markers = visibleRows.flatMap((result, index) =>
    result.address.coordinates
      ? [
          {
            id: result.id,
            kind: result.kind,
            number: index + 1,
            coordinates: result.address.coordinates,
            label:
              result.names[getLocale()] ||
              result.names.en ||
              Object.values(result.names).find(value => value?.trim()) ||
              getAddressDisplay(result.address, getLocaleKey()),
            highlighted: hovered === result.id,
            selected: selected?.id === result.id,
            previewOnly: !accepted,
            hidden: Boolean(accepted && selected && selected.id !== result.id),
          },
        ]
      : [],
  )
  untrack(() =>
    onMapCandidates?.(markers, id => {
      const result = rows.find(row => row.id === id)
      if (result) {
        choose(result)
        void tick().then(() => {
          const row = Array.from(resultsElement?.querySelectorAll<HTMLElement>('[data-result-id]') ?? []).find(element => element.dataset.resultId === id)
          if (row && resultsElement) resultsElement.scrollTo({
            top: resultsElement.scrollTop + row.getBoundingClientRect().top - resultsElement.getBoundingClientRect().top - (resultsElement.clientHeight - row.clientHeight) / 2,
            behavior: prefersReducedMotion.current ? 'instant' : 'smooth',
          })
        })
      }
    }),
  )
}
$effect(publishMarkers)

/** Preview a result while retaining every candidate marker until acceptance.
 * @param result Selected row. @returns Nothing.
 */
function choose(result: Result): void {
  filtersOpen = false
  version++
  addressController?.abort()
  clearTimeout(timer)
  loading = false
  searched = false
  previousScrollTop = resultsElement?.scrollTop ?? 0
  previousRows = receivedRows
  previousQuery = query
  selected = result
  hovered = null
  accepted = false
  onPreview?.(result)
}
/** Accept an explicit inline action, independently choosing name inheritance.
 * @param result Source row. @param nameMode Whether names follow the linked place.
 * @returns Nothing.
 */
async function acceptResult(result: Result, nameMode: 'independent' | 'inherit'): Promise<void> {
  if (selected?.id !== result.id) choose(result)
  if (result.kind === 'establishment') {
    let streets: Awaited<ReturnType<typeof loadAddressNames>> = []
    try { streets = await loadAddressNames('streets') } catch { /* Preserve source text when the catalogue is unavailable. */ }
    if (selected?.id !== result.id || accepted) return
    result = { ...result, address: structurePlaceAddress(result.address, streets) }
    selected = result
  }
  onSelect({ ...result, nameMode })
  accepted = true
  linked = result.kind === 'establishment'
}

/** Restore the last result set and let the owner undo only the selected Location.
 * @returns Nothing; no new request is needed to recover the previous choices.
 */
export function backToResults(): void {
  const selectedId = selected?.id
  const scrollTop = previousScrollTop
  version++
  addressController?.abort()
  clearTimeout(timer)
  if (accepted) onBack?.()
  accepted = false
  selected = null
  query = previousQuery
  receivedRows = previousRows
  searched = true
  loading = false
  void tick().then(() => {
    const button = [
      ...(resultsElement?.querySelectorAll<HTMLButtonElement>('[data-result-id]') ??
        []),
    ].find(row => row.dataset.resultId === selectedId)
    if (button) button.focus({ preventScroll: true })
    else (findMode === 'pin' ? nearbyButton : input)?.focus()
    if (resultsElement) resultsElement.scrollTop = scrollTop
  })
}

/** Reveal manual fields without creating or retaining an establishment association.
 * @returns Nothing.
 */
export function addManualLocation(): void {
  clearSearch()
  selected = null
  accepted = true
}

/** Expand grouped addresses before previewing an individual source record.
 * @param result Visible source row. @returns Nothing.
 */
function openResult(result: Result): void {
  const group = groups.find(group => group.representative.id === result.id)
  if (!currentGroup && group && group.expandable) {
    expandedGroup = result.id
    void tick().then(() =>
      resultsElement?.querySelector<HTMLButtonElement>('[data-result-id]')?.focus(),
    )
    return
  }
  // A second click confirms an already previewed address; establishments keep their explicit name choices.
  if (selected?.id === result.id && result.kind !== 'establishment') {
    void acceptResult(result, 'independent')
    return
  }
  choose(result)
}

/** Separate the primary name from its address without repeating the same line.
 * @param result Source candidate. @returns Primary and secondary display labels.
 */
function resultLabels(result: Result): { title: string; detail: string } {
  const display = getAddressDisplay(result.address, getLocaleKey())
  const name =
    result.names[getLocale()]?.trim() ||
    result.names.en?.trim() ||
    Object.values(result.names).find(value => value?.trim()) ||
    ''
  const title =
    name ||
    display.split(/[,，]/)[0] ||
    display ||
    (result.kind === 'address'
      ? m.location_type_address()
      : m.location_type_establishment())
  const detail = display.startsWith(title)
    ? display.slice(title.length).replace(/^[,，\s]+/, '')
    : display
  return { title, detail }
}
onDestroy(() => {
  onFilterPanelChange?.(undefined)
  version++
  addressController?.abort()
  clearTimeout(timer)
})
/** Hand forward Tab from the final result control to the manual-entry action.
 * @param event Keyboard event from a result or its acceptance controls.
 * @param index Visible result index.
 * @returns Nothing; Shift+Tab retains the normal reverse order.
 */
function handleResultTab(event: KeyboardEvent, index: number): void {
  if (event.key !== 'Tab' || event.shiftKey || index !== visibleRows.length - 1) return
  const target = event.currentTarget as HTMLButtonElement
  const controls = target.closest('[data-search-result]')?.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([tabindex="-1"])')
  if (controls?.[controls.length - 1] === target && onResultsEnd?.()) event.preventDefault()
}
</script>
{#snippet filterPanel()}
  <PlaceSearchFiltersPanel
    value={filters}
    onApply={applyFilters}
    onClose={closeFilters}
  />
{/snippet}
{#snippet searchControl(coordinatesControl?: Snippet)}
  {#if selected && accepted}
    <div class="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onclick={backToResults}
        class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-panel px-3 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <BackIcon class="size-4" aria-hidden="true" />
        {m.feature_start_back_results()}
      </button>
      <LocationIcon
        kind={selected.kind}
        class="size-5 shrink-0 text-muted-foreground"
      />
      <span class="min-w-0 truncate font-medium">{resultLabels(selected).title}</span>
      {#if linked}
        <button type="button" class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onclick={() => { linked = false; onUnlink?.() }}>
          <UnlinkIcon class="size-4" aria-hidden="true" />{m.account__unlink()}
        </button>
      {/if}
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      <fieldset
        class="flex shrink-0 items-center gap-2"
        aria-label={m.feature_search_include()}
      >
        <legend class="sr-only">{m.feature_search_include()}</legend>
        <span class="text-sm text-muted-foreground" aria-hidden="true"
          >{m.feature_search_include()}</span
        >
        <div
          class="inline-flex items-center gap-1 rounded-lg border border-border bg-panel p-1"
        >
          {#each searchKinds as kind}
            {@const enabled =
              kind === 'establishment'
                ? includeShops
                : kind === 'address'
                  ? includeAddresses
                  : includeBuildings && findMode === 'search'}
            {@const label =
              kind === 'establishment'
                ? m.feature_search_shops()
                : kind === 'building'
                  ? m.location_type_building()
                  : m.location_type_address()}
            <button
              type="button"
              style:--search-color={locationSearchColor(kind)}
              aria-label={label}
              aria-pressed={enabled}
              title={kind === 'building' && findMode === 'pin'
                ? m.feature_search_buildings_name_only()
                : label}
              disabled={kind === 'building' && findMode === 'pin'}
              onclick={() => {
                if (kind === 'establishment') {
                  includeShops = !includeShops
                  if (!includeShops) filtersOpen = false
                }
                if (kind === 'building') includeBuildings = !includeBuildings
                if (kind === 'address') includeAddresses = !includeAddresses
                // Existing provider results stay cached while type toggles filter list and map.
                if (receivedRows.length && (enabled || requestedKinds.has(kind))) {
                  selected = null
                  hovered = null
                  expandedGroup = null
                  searched = true
                } else if (findMode === 'pin') void search(true)
                else schedule()
              }}
              class="flex size-9 items-center justify-center rounded-md text-muted-foreground dark:text-white transition-colors hover:bg-muted aria-pressed:bg-[var(--search-color)] aria-pressed:text-white focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30"
            >
              <LocationIcon {kind} class="size-5" />
            </button>
          {/each}
        </div>
      </fieldset>
      <div class="flex min-w-0 basis-64 flex-1 items-center justify-center gap-3">
        {#if showSearchTypePrompt && !hasSearchTypes}
          <p role="status" class="flex min-h-12 w-full items-center justify-center text-center text-sm text-muted-foreground">
            {m.feature_search_select_types()}
          </p>
        {:else if findMode === 'search'}
        <div class="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-panel focus-within:ring-2 focus-within:ring-primary">
          <input
            bind:this={input}
            bind:value={query}
            oninput={schedule}
            maxlength="200"
            aria-label={m.feature_start_search()}
            placeholder={m.feature_start_search()}
            class="w-full min-w-0 flex-1 rounded-lg bg-transparent py-3 pl-4 pr-2 text-foreground outline-none"
            onkeydown={event => {
              if (event.key === 'Tab' && !event.shiftKey && rows.length) {
                const first =
                  resultsElement?.querySelector<HTMLButtonElement>('[data-result-id]')
                if (first) {
                  event.preventDefault()
                  first.focus()
                }
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                clearTimeout(timer)
                void search()
              }
            }}
          >
          {#if !loading && (rows.length || searched)}
            <span role="status" class="shrink-0 px-2 text-xs text-muted-foreground">{m.feature_search_result_count({ count: visibleRows.length })}</span>
          {/if}
          <button
            type="button"
            aria-label={searched || rows.length
              ? m.feature_search_clear()
              : m.feature_search_submit()}
            title={searched || rows.length
              ? m.feature_search_clear()
              : m.feature_search_submit()}
            disabled={!searched && !rows.length && (!query.trim() || !hasSearchTypes)}
            onclick={() => {
              if (searched || rows.length) clearSearch()
              else {
                clearTimeout(timer)
                void search()
              }
            }}
            class="mr-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
          >
            {#if searched || rows.length}
              <ClearIcon class="size-5" aria-hidden="true" />
            {:else}
              <SearchIcon class="size-5" aria-hidden="true" />
            {/if}
          </button>
        </div>
        {:else if hasPin && coordinates}
          <button
            type="button"
            class="min-h-14 shrink-0 rounded-lg bg-primary px-7 py-4 text-base font-semibold text-white disabled:opacity-40"
            bind:this={nearbyButton}
            disabled={loading || !hasSearchTypes}
            onclick={() => void search(true)}
          >
            {m.feature_search_nearby()}
          </button>
          {#if !loading && (rows.length || searched)}
            <span role="status" class="shrink-0 text-xs text-muted-foreground">{m.feature_search_result_count({ count: visibleRows.length })}</span>
          {/if}
        {/if}
      <button
        bind:this={filterButton}
        type="button"
        aria-label={m.feature_search_filters()}
        title={m.feature_search_filters()}
        aria-expanded={filtersOpen}
        disabled={!includeShops}
        onclick={() => (filtersOpen = !filtersOpen)}
        class="relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-panel text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"
      >
        <FilterIcon class="size-5" aria-hidden="true" />
        {#if filterCount}
          <span
            class="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
            >{filterCount}</span
          >
        {/if}
      </button>
      </div>
      {#if findMode === 'pin' && coordinatesControl}
        <div class="min-w-0 shrink-0">{@render coordinatesControl()}</div>
      {/if}
      <fieldset  aria-label={m.feature_find_by()} class="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-1">
        {#each ['search', 'pin'] as mode}
          <button type="button" aria-label={mode === 'search' ? `${m.feature_find_by()} ${m.feature_find_search()}` : m.feature_find_pin()} aria-pressed={findMode === mode} disabled={mode === 'pin' && !onDropPin} onclick={() => setFindMode(mode as 'search' | 'pin')} class="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors aria-pressed:bg-panel aria-pressed:text-foreground aria-pressed:shadow-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40">{mode === 'search' ? m.feature_find_search() : m.feature_find_pin()}</button>
        {/each}
      </fieldset>
    </div>
    {#if filtersOpen && !onFilterPanelChange}
      <div class="mt-3 h-112">{@render filterPanel()}</div>
    {/if}
  {/if}
{/snippet}
{#snippet searchResults()}
  {#if !accepted && !loading && !searched && !rows.length}
    <section aria-label={m.feature_find_by()} class="flex flex-1 items-center justify-center px-6 py-10">
      <div class="grid w-full max-w-4xl gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/60">
        {#each ['search', 'pin', 'manual'] as choice}
          <div class="flex flex-col items-center gap-4 px-6 text-center">
            <p class="max-w-64 text-sm leading-relaxed text-muted-foreground">
              <strong class="mb-2 block text-lg font-semibold leading-snug text-foreground">{choice === 'search' ? m.feature_find_search_lead() : choice === 'pin' ? m.feature_find_pin_lead() : m.feature_find_manual_lead()}</strong>
              {choice === 'search' ? m.feature_find_search_detail() : choice === 'pin' ? m.feature_find_pin_detail() : m.feature_find_manual_detail()}
            </p>
            <button type="button" disabled={choice !== 'search' && !onDropPin} onclick={() => choice === 'manual' ? onManualEntry?.() : setFindMode(choice as 'search' | 'pin')} class="mt-auto rounded-lg px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40">{choice === 'search' ? m.feature_find_name() : choice === 'pin' ? m.feature_find_location() : m.feature_search_manual_location()}</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
  {#if !accepted && (loading || searched || rows.length)}
    <div class="flex min-h-0 flex-1 flex-col px-6" aria-busy={loading}>
      {#if loading && !rows.length}
        <div
          role="status"
          aria-label={m.resource_loading()}
          class="space-y-3 py-3 motion-safe:animate-pulse"
        >
          {#each [0, 1, 2] as placeholder (placeholder)}
            <div aria-hidden="true" class="flex h-12 items-center gap-3">
              <div class="size-6 rounded-full bg-muted"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-2/3 rounded bg-muted"></div>
                <div class="h-3 w-1/2 rounded bg-muted"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if placesFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_places_failed()}</p>
      {/if}
      {#if placesPartial && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_partial()}</p>
      {/if}
      {#if placesLimited && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_places_limited()}</p>
      {/if}
      {#if buildingsFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_search_buildings_failed()}</p>
      {/if}
      {#if addressesFailed && searched}
        <p role="status" class="py-2 text-sm">{m.feature_start_addresses_failed()}</p>
      {/if}
      {#if currentGroup}
        <div class="flex items-center" transition:slide={{ duration: prefersReducedMotion.current ? 0 : 160 }}>
          <button
            bind:this={subsetBackButton}
            type="button"
            class="flex items-center gap-2 py-2 text-sm"
            onclick={() => {
              selected = null
              hovered = null
              expandedGroup = null
              void tick().then(() => input?.focus())
            }}
          >
            <BackIcon class="size-4" /> {m.feature_start_back_results()}
          </button>
        </div>
      {/if}
      <section
        bind:this={resultsElement}
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-py-12 pt-3 pb-16"
        aria-label={m.feature_start_search()}
      >
        {#each visibleRows as result, index (result.id)}
          {@const labels = resultLabels(result)}
          <div
            data-search-result={result.id}
            class="relative flex items-center gap-3 rounded-md border-b border-border/50 transition-colors hover:bg-muted focus-within:bg-primary/10 last:border-0 [&:has([data-result-actions])_[data-division-class=town]]:invisible"
            animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}
          >
            <button
              type="button"
              class="group flex min-h-20 min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-6 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              data-result-id={result.id}
              data-result-number={index + 1}
              data-result-kind={result.kind}
              onmouseenter={() => (hovered = result.id)}
              onmouseleave={() => (hovered = null)}
              onkeydown={event => {
                handleResultTab(event, index)
                if (event.key === 'Tab' && event.shiftKey && index === 0) {
                  event.preventDefault()
                  if (currentGroup) subsetBackButton?.focus()
                  else (findMode === 'pin' ? nearbyButton : input)?.focus()
                }
              }}
              onfocus={event => {
                hovered = result.id
                const row = event.currentTarget
                if (resultsElement)
                  resultsElement.scrollTo({
                    top:
                      resultsElement.scrollTop +
                      row.getBoundingClientRect().top -
                      resultsElement.getBoundingClientRect().top -
                      (resultsElement.clientHeight - row.clientHeight) / 2,
                    behavior: 'instant',
                  })
              }}
              onblur={() => (hovered = null)}
              onclick={() => openResult(result)}
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-sm"
                style:background-color={locationSearchColor(result.kind)}
                >{index + 1}</span
              >
              <LocationIcon
                kind={result.kind}
                class="size-5 shrink-0 text-muted-foreground"
              />
              <span class="relative min-w-0 flex-1">
                <AddressSearchParts address={result.address} numberSummary={currentGroup ? undefined : groups.find(group => group.representative.id === result.id)?.numberRange} establishmentTitle={result.kind === 'establishment' ? labels.title : undefined} taxonomyLabel={result.taxonomyLabel} primaryName={result.kind === 'building' ? labels.title : undefined} collapsed={!currentGroup && result.kind === 'address' && Boolean(groups.find(group => group.representative.id === result.id)?.expandable)} />
                {#if !currentGroup &&
                  groups.find(
                    group =>
                      group.representative.id === result.id && group.expandable,
                  )}
                  <span class="absolute left-0 top-full mt-1 text-xs text-muted-foreground"
                    >{m.feature_search_group_count({
                      count:
                        groups.find(group => group.representative.id === result.id)
                          ?.members.length ?? 1,
                    })}</span
                  >
                {/if}
              </span>
            </button>
            {#if selected?.id === result.id && (currentGroup || !groups.some(group => group.representative.id === result.id && group.expandable))}
              <div class={["flex shrink-0 flex-wrap justify-end gap-2 pr-3", result.kind !== 'establishment' && 'absolute right-0 top-1/2 -translate-y-1/2']} data-result-actions={result.id}>
                {#if result.kind === 'establishment'}
                  <button type="button" onkeydown={event => handleResultTab(event, index)} tabindex={selected?.id === result.id ? 0 : -1} class="rounded-md border border-primary bg-white px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-white" onclick={() => acceptResult(result, 'independent')}>{m.feature_search_link_place()}</button>
                  <button type="button" onkeydown={event => handleResultTab(event, index)} tabindex={selected?.id === result.id ? 0 : -1} class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white" onclick={() => acceptResult(result, 'inherit')}>{m.feature_search_link_name()}</button>
                {:else}
                  <button type="button" onkeydown={event => handleResultTab(event, index)} tabindex={selected?.id === result.id ? 0 : -1} class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white" onclick={() => acceptResult(result, 'independent')}>{m.feature_search_use_address()}</button>
                {/if}
              </div>

            {/if}
          </div>
        {/each}
      </section>
      {#if searched && !loading && !rows.length && !placesFailed && !placesPartial && !placesLimited && !addressesFailed && !buildingsFailed}
        <p class="py-3 text-sm">{m.feature_start_empty()}</p>
      {/if}

    </div>
  {/if}
{/snippet}
{#snippet mapControls()}
  {#if findMode === 'pin' && hasPin && !selected}
    <label
      class="flex w-52 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground shadow-sm"
    >
      {m.feature_location_radius()}
      <output class="tabular-nums">{radius} m</output>
      <input
        type="range"
        min="50"
        max="1000"
        step="50"
        bind:value={radius}
        disabled={loading}
        aria-label={m.feature_location_radius()}
        class="h-4 w-full cursor-pointer accent-primary"
      >
    </label>
  {/if}
{/snippet}
{#if children}
  {@render children(searchControl, searchResults, mapControls)}
{:else}
  {@render searchControl()}{@render searchResults()}
{/if}
