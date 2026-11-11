<script lang="ts">
// SVELTE
import { onDestroy, tick, untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import { locationSyncMode } from '#lib/locations/associationSync.js'
import LocationSyncSelect from './LocationSyncSelect.svelte'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
import {
  searchBuildingNames,
  searchBuildingNamesPage,
} from '#lib/locations/buildingSearch.js'
import { groupDraftSearchResults } from '#lib/locations/draftSearchGroups.js'
import { createDraftSearchFilter } from '#lib/locations/draftSearchFilter.js'
import { hasPlaceSearchCategory } from '#lib/locations/placeSearchFilters.js'
import LocationAssociationHeading from './LocationAssociationHeading.svelte'
import LocationAssociationPicker from './LocationAssociationPicker.svelte'
import { searchAssociationCandidates } from '#lib/locations/associationSearch.js'
import AddressSearchParts from './AddressSearchParts.svelte'
import PlaceSearchFiltersPanel from './PlaceSearchFilters.svelte'
import {
  locationDistance,
  placeTaxonomyLabel,
  locationSearchColor,
} from '#lib/locations/searchPresentation.js'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import ReplaceIcon from 'virtual:icons/lucide/replace'
import { createPlaceAddressWorker } from '#lib/addresses/placeAddressWorker.js'
import BackIcon from 'virtual:icons/lucide/arrow-left'
import SearchIcon from 'virtual:icons/lucide/search'
import ClearIcon from 'virtual:icons/lucide/x'
import WarningIcon from 'virtual:icons/lucide/triangle-alert'
import FilterIcon from 'virtual:icons/lucide/list-filter'
// API
import { searchTargetLocations } from '#lib/api/locationAssociation.remote.js'
import { getSharedLocationIdBySource } from '#lib/api/locationDirectory.remote.js'
import {
  searchDraftLocations,
  searchNearbyDraftLocations,
} from '#lib/api/draftLocation.remote.js'
import {
  geocodeAddressCandidates,
  geocodeAddressPage,
  GeocodeRequestError,
} from '#lib/api/external/geocoding.js'
// ADDRESS
import {
  loadAddressNames,
  structurePlaceAddress,
} from '#lib/addresses/nameCatalogue.js'
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
// TAXONOMY
import { expandLocationMatchingTypes } from '#lib/locations/taxonomy.js'
// I18N
import { getLocale, getLocaleKey, m } from '#lib/i18n.js'
// TYPES
import type {
  DraftLocationSearchResult as Result,
  DraftLocationSearchProgress,
} from './draftLocationSearch.types.js'
import type { PlaceSearchFilters } from '#lib/locations/placeSearchFilters.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

import type { ParsedReverseGeocodeResult } from '#lib/utils/geocoding.types.js'

// DOMAIN

const placeAddressWorker = createPlaceAddressWorker()

const searchKinds = ['establishment', 'building', 'address'] as const

let {
  active,
  allowedLocationKinds: configuredLocationKinds,
  suggestionKinds,
  preferredKind,
  initialMode = 'search',
  searchRequest,
  allowManualEntry = true,
  resolutionOrigin = 'new-feature',
  onExitResolution,
  projectId,
  canReturnToResults = true,
  locationName,
  currentAddress,
  currentNameMode,
  focusRequest,
  onSelect,
  onPreview,
  onAcceptedChange,
  onResolutionPendingChange,
  onAssociationSpaceNeeded,
  onReturnToResults,
  onSelectionStart,
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
  allowedLocationKinds?: readonly string[]
  suggestionKinds?: readonly string[]
  preferredKind?: string
  initialMode?: 'search' | 'pin'
  searchRequest?: {
    id: number
    mode: 'search' | 'pin'
    query: string
    seeds?: import('#lib/locations/matchSeed.js').LocationMatchSeed[]
  } | null
  allowManualEntry?: boolean
  resolutionOrigin?: 'new-feature' | 'existing-feature'
  onExitResolution?: () => void
  projectId?: string
  canReturnToResults?: boolean
  locationName?: string
  currentAddress?: FeatureAddress
  currentNameMode?: Result['nameMode']
  focusRequest: number
  onUnlink?: () => void
  onPreview?: (result: Result, preserveZoom?: boolean) => void
  onAcceptedChange?: (accepted: boolean) => void
  onAssociationSpaceNeeded?: (overflow: number) => void
  onReturnToResults?: () => void
  onSelectionStart?: () => void
  onResolutionPendingChange?: (pending: boolean) => void
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
  children?: Snippet<[Snippet<[Snippet?]>, Snippet, Snippet, Snippet<[boolean?]>]>
} = $props()
const allowedLocationKinds = $derived(
  configuredLocationKinds
    ? expandLocationMatchingTypes(configuredLocationKinds)
    : undefined,
)

let input: HTMLInputElement | undefined = $state()
let searchOutline = $state<HTMLDivElement>()
let query = $state('')
let nearbyFilter = $state('')
let findMode = $state<'search' | 'pin'>(untrack(() => initialMode))
$effect(() => {
  const mode = initialMode
  untrack(() => {
    if (!selected) findMode = mode
  })
})
let nearbyButton: HTMLButtonElement | undefined = $state()
$effect(() => onModeChange?.(findMode))
/** Switch discovery controls and direct attention to the selected input.
 * @param mode Search by text or by a map pin.
 * @returns Nothing.
 */
function setFindMode(mode: 'search' | 'pin'): void {
  clearSearch()
  findMode = mode
  if (mode === 'pin') {
    onDropPin?.()
    if (resolutionOrigin === 'existing-feature' && hasPin && coordinates)
      void search(true)
  }
  void tick().then(() => {
    const target = mode === 'search' ? input : nearbyButton
    target?.focus()
    const outline = mode === 'search' ? searchOutline : nearbyButton
    if (!prefersReducedMotion.current)
      outline?.animate(
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
const filterCount = $derived(
  Object.entries(filters).filter(
    ([key, value]) =>
      Boolean(value) && !(key === 'operatingStatus' && value === 'open'),
  ).length,
)
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
  if (hasPlaceSearchCategory(value)) includeShops = true
  expandedGroup = null
  selected = null
  accepted = false
  closeFilters()
  if (nearbyMode) {
    clearTimeout(timer)
    timer = undefined
    void search(true)
  } else schedule()
}
/** Clear query, pending work, results and map previews while retaining chosen filters.
 * @returns Nothing.
 */
function clearSearch(): void {
  query = ''
  nearbyFilter = ''
  if (localRows.length) localRows = []
  localSearchFailed = false
  localSearchLimited = false
  schedule(false, false)
  previousRows = []
  previousQuery = ''
  hovered = null
  nearbyMode = false
  void tick().then(() => {
    if (findMode === 'search') input?.focus()
  })
}
let radius = $state(300)
let nearbyMode = $state(false)
let resultsElement: HTMLElement | undefined = $state()
let includeShops = $state(true)
let includeAddresses = $state(true)
let includeBuildings = $state(true)
$effect(() => {
  const kinds = suggestionKinds
  if (kinds)
    untrack(() => {
      includeShops = kinds.includes('establishment')
      includeBuildings = kinds.includes('building')
      includeAddresses = kinds.includes('address')
    })
})
const searchBuildings = $derived(includeBuildings)
const hasPlaceCategory = $derived(hasPlaceSearchCategory(filters))
const searchAddresses = $derived(includeAddresses && !hasPlaceCategory)
let subsetBackButton: HTMLButtonElement | undefined = $state()
const hasSearchTypes = $derived(includeShops || searchAddresses || searchBuildings)
// Category-only searches use Places; buildings and addresses still require text.
const textSearchKinds = $derived(
  findMode === 'search'
    ? searchKinds.filter(kind =>
        kind === 'establishment'
          ? includeShops && (Boolean(query.trim()) || hasPlaceCategory)
          : Boolean(query.trim()) &&
            (kind === 'building' ? searchBuildings : searchAddresses),
      )
    : [],
)
const canSearch = $derived(textSearchKinds.length > 0)
let showSearchTypePrompt = $state(false)
// Allow quick inclusion changes before replacing the search control with guidance.
$effect(() => {
  showSearchTypePrompt = false
  if (hasSearchTypes) return
  const promptTimer = setTimeout(() => {
    showSearchTypePrompt = true
  }, 2000)
  return () => clearTimeout(promptTimer)
})
let associationOrigin = $state<Result | null>(null)
let associationOpen = $state(false)
let selected = $state<Result | null>(null)
let associationPreview = $state<Result | null>(null)
let selectedResultNumber = $state<number | undefined>()
let associationRequest = 0
// Keep every save entry point blocked while the user reviews the association and marker.
$effect(() => {
  onResolutionPendingChange?.(associationOpen)
})
/** Invalidate late matches and clear preview markers when discovery changes. @returns Nothing. */
function invalidateAssociationLookup(): void {
  associationRequest++
  associationPreview = null
}
// Changes made after acceptance invalidate an in-flight name or address lookup.
$effect(() => {
  JSON.stringify([currentAddress, locationName])
  untrack(() => {
    associationRequest++
  })
})
let accepted = $state(false)
// Source previews need a persisted shared identity before linking to HYPE details.
const selectedLocationLookup = $derived(
  accepted && selected?.source?.ssId && !selected.identity?.locationId
    ? getSharedLocationIdBySource({ ssId: selected.source.ssId })
    : null,
)
const selectedLocationId = $derived(
  selected?.identity?.locationId ?? selectedLocationLookup?.current ?? null,
)
const selectedLocationHref = $derived(
  selectedLocationId
    ? `/admin/locations/${encodeURIComponent(selectedLocationId)}`
    : selected?.buildingSource
      ? `/admin/locations/building/${encodeURIComponent(selected.buildingSource.id)}?${new URLSearchParams({ release: selected.buildingSource.release, ...(selected.buildingSource.addressId ? { address: selected.buildingSource.addressId } : {}) })}`
      : null,
)
let linked = $state(false)
let expandedGroup = $state<string | null>(null)
$effect(() => onAcceptedChange?.(accepted))
$effect(() => onResultsChange?.(rows.length > 0))
let previousRows: Result[] = []
let previousQuery = ''
let previousScrollTop = 0
let receivedRows = $state.raw<Result[]>([])
let localRows = $state.raw<Result[]>([])
let localSearchFailed = $state(false)
let localSearchLimited = $state(false)
const providerRevisions: Record<Result['kind'], number> = {
  establishment: 0,
  service_point: 0,
  premises: 0,
  building: 0,
  building_part: 0,
  infrastructure: 0,
  street: 0,
  natural: 0,
  built: 0,
  structure: 0,
  landform: 0,
  coastal_feature: 0,
  water_feature: 0,
  address: 0,
}
let cachedKinds = new Set<Result['kind']>()
// Keep provider ranking within each kind while late responses reorder both list and map.
const rows = $derived(
  [
    ...localRows,
    ...receivedRows.filter(row => !localRows.some(local => local.id === row.id)),
  ]
    .filter(row => !suggestionKinds || suggestionKinds.includes(row.kind))
    .filter(row =>
      row.kind === 'establishment'
        ? includeShops
        : row.kind === 'building'
          ? searchBuildings
          : searchAddresses,
    )
    .toSorted(
      (a, b) =>
        (a.kind === preferredKind ? -1 : 0) - (b.kind === preferredKind ? -1 : 0) ||
        searchKinds.indexOf(
          a.kind === 'establishment' || a.kind === 'address' ? a.kind : 'building',
        ) -
          searchKinds.indexOf(
            b.kind === 'establishment' || b.kind === 'address' ? b.kind : 'building',
          ),
    ),
)
// Filter a retained snapshot; local typing must never replace provider results or start a search.
const filterNearbyRows = createDraftSearchFilter<Result>()
let nearbyMatches = $state.raw<Result[] | null>(null)
$effect(() => {
  const snapshot = rows
  const text = nearbyFilter.trim()
  const mode = findMode
  let current = true
  if (mode !== 'pin' || !text) nearbyMatches = null
  else {
    void filterNearbyRows(snapshot, text, () => current).then(matches => {
      if (current && matches) nearbyMatches = matches
    })
  }
  return () => {
    current = false
  }
})
const groups = $derived(
  groupDraftSearchResults(
    findMode === 'pin' && nearbyFilter.trim() ? (nearbyMatches ?? rows) : rows,
  ).map(group => ({
    ...group,
    representative:
      group.members.find(row => row.id === focusedResult) ?? group.representative,
  })),
)
const currentGroup = $derived(
  groups.find(group => group.members.some(row => row.id === expandedGroup)),
)
const visibleRows = $derived(
  currentGroup?.members ?? groups.map(group => group.representative),
)
let loading = $state(false)
let pendingKinds = $state<Set<Result['kind']>>(new Set())
let placesFailed = $state(false)
let placesPartial = $state(false)
let placesLimited = $state(false)
let addressesFailed = $state(false)
let buildingsFailed = $state(false)
let buildingsLimited = $state(false)
let hovered = $state<string | null>(null)
let focusedResult = $state<string | null>(null)
const highlightedResult = $derived(hovered ?? focusedResult)
/** Centre a result without moving keyboard focus off its row or action.
 * @param row Result wrapper in the scrollable list.
 * @param revealOnly Leave fully visible rows in place and animate offscreen reveals.
 * @returns Nothing.
 */
function centreResult(row: HTMLElement, revealOnly = false): void {
  if (!resultsElement || !resultsElement.contains(row)) return
  const bounds = row.getBoundingClientRect()
  const top = resultsElement.getBoundingClientRect().top + resultsElement.clientTop
  if (
    revealOnly &&
    bounds.top >= top &&
    bounds.bottom <= top + resultsElement.clientHeight
  )
    return
  resultsElement.scrollTo({
    top:
      resultsElement.scrollTop +
      bounds.top -
      top -
      (resultsElement.clientHeight - bounds.height) / 2,
    behavior:
      revealOnly && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'smooth'
        : 'instant',
  })
}
// Follow the stable highlighted ID after streamed rows reorder, not pointer movement.
let previousVisibleIds: string[] = []
$effect(() => {
  const visibleIds = visibleRows.map(row => row.id)
  const previousIds = previousVisibleIds
  previousVisibleIds = visibleIds
  const id = untrack(() => highlightedResult)
  if (!id || !visibleIds.includes(id)) return
  const oldIndex = previousIds.indexOf(id)
  // Appending below the highlighted row must not pull a user back from the scroll end.
  if (
    oldIndex >= 0 &&
    previousIds
      .slice(0, oldIndex + 1)
      .every((value, index) => visibleIds[index] === value)
  )
    return
  let cancelled = false
  void tick().then(async () => {
    const row = Array.from(
      resultsElement?.querySelectorAll<HTMLElement>('[data-search-result]') ?? [],
    ).find(element => element.dataset.searchResult === id)
    if (!row || cancelled) return
    // FLIP temporarily reports the old visual position; use the settled geometry.
    await Promise.allSettled(row.getAnimations().map(animation => animation.finished))
    if (!cancelled && highlightedResult === id) centreResult(row)
  })
  return () => {
    cancelled = true
  }
})
let searched = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined
let version = 0
let addressController: AbortController | undefined
let buildingAddressController: AbortController | undefined
let addressPaging = $state<DraftLocationSearchProgress['addressPaging']>(null)
let addressLoadingMore = $state(false)
let addressPageError = $state<'failed' | 'expired' | null>(null)
let placePaging = $state<DraftLocationSearchProgress['placePaging']>(null)
let buildingPaging = $state<DraftLocationSearchProgress['buildingPaging']>(null)
let moreLoading = $state({ establishment: false, building: false })
let moreErrors = $state<
  Record<'establishment' | 'building', 'failed' | 'expired' | null>
>({ establishment: null, building: null })

$effect(() => {
  if (active && focusRequest && input) void tick().then(() => input?.focus())
})
// Fence pending providers when the editor closes without discarding an accepted selection.
$effect(() => {
  if (active) return
  untrack(() => {
    version++
    buildingAddressController?.abort()
    addressController?.abort()
    clearTimeout(timer)
    pendingKinds = new Set()
    loading = false
  })
})
let fallbackSeeds: import('#lib/locations/matchSeed.js').LocationMatchSeed[] = []
let fallbackStatus = $state('')
let consumedSearchRequest = 0
$effect(() => {
  const request = searchRequest
  if (!active || !request || request.id === consumedSearchRequest) return
  consumedSearchRequest = request.id
  untrack(() => {
    clearSearch()
    selected = null
    accepted = linked = false
    associationOpen = false
    associationOrigin = null
    findMode = request.mode
    query = request.query
    fallbackSeeds = [...(request.seeds ?? [])]
    fallbackStatus = ''
    filters = {}
    void search(request.mode === 'pin')
  })
})
const filterCachedRows = createDraftSearchFilter<Result>()
/** Check cached names and address text before fresh provider evidence arrives.
 * @param request Version of the typed query that owns this filter.
 * @param text Current typed query.
 * @returns Completion of the cooperative filter, with obsolete snapshots ignored.
 * @remarks Matching is asynchronous; unchanged rows retain their array identity so
 * typing does not repeatedly regroup results, rebuild markers or trigger layout.
 */
async function filterMatches(request: number, text: string): Promise<void> {
  const snapshot = receivedRows
  const isCurrent = (): boolean => request === version && receivedRows === snapshot
  const matches = await filterCachedRows(snapshot, text, isCurrent)
  if (matches && isCurrent() && matches.length !== snapshot.length)
    receivedRows = matches
}
/** Debounce typed search and invalidate older responses immediately.
 * @param retainMatches Keep cached text matches while a typed query is refreshed.
 * @param runSearch Schedule discovery; explicit Clear only resets the current results.
 * @returns Nothing.
 */
function schedule(retainMatches = false, runSearch = true): void {
  fallbackSeeds = []
  fallbackStatus = ''
  associationOpen = false
  associationOrigin = null
  addressPaging = null
  addressLoadingMore = false
  addressPageError = null
  placePaging = buildingPaging = null
  moreLoading = { establishment: false, building: false }
  moreErrors = { establishment: null, building: null }
  invalidateAssociationLookup()
  focusedResult = null
  hovered = null
  clearTimeout(timer)
  timer = undefined
  selected = null
  accepted = false
  expandedGroup = null
  version++
  cachedKinds = new Set()
  buildingAddressController?.abort()
  addressController?.abort()
  // Keep keystrokes cheap; filter the retained snapshot in cancellable background batches.
  if (retainMatches && query.trim() && !nearbyMode) void filterMatches(version, query)
  else receivedRows = []
  placesFailed = false
  placesPartial = false
  placesLimited = false
  addressesFailed = false
  buildingsFailed = false
  buildingsLimited = false
  searched = false
  loading = runSearch && canSearch
  pendingKinds = new Set(loading ? textSearchKinds : [])
  if (loading)
    timer = setTimeout(() => {
      timer = undefined
      void search()
    }, 300)
}
/** Search Places and building/address evidence independently, retaining partial results.
 * @param nearby Discover around the current pin instead of the typed query.
 * @param onlyKind Fetch only an uncached type without disturbing other providers.
 * @returns Completion of the latest read-only search.
 */
async function search(nearby = false, onlyKind?: Result['kind']): Promise<void> {
  nearbyMode = nearby
  const request = onlyKind ? version : ++version
  if (!onlyKind) cachedKinds = new Set()
  const q = query.trim()
  if (!onlyKind) {
    if (localRows.length) localRows = []
    localSearchFailed = false
    localSearchLimited = false
  }
  if ((!nearby && !canSearch) || (nearby && !coordinates) || !hasSearchTypes) {
    if (!onlyKind) {
      addressController?.abort()
      loading = false
      pendingKinds = new Set()
    }
    return
  }
  const requestedKinds = new Set(
    (nearby ? searchKinds : textSearchKinds).filter(
      kind =>
        (!onlyKind || kind === onlyKind) &&
        (kind === 'establishment'
          ? includeShops
          : kind === 'building'
            ? searchBuildings
            : searchAddresses),
    ),
  )
  const revisions = { ...providerRevisions }
  for (const kind of requestedKinds) revisions[kind] = ++providerRevisions[kind]
  const isCurrent = (kind: Result['kind']): boolean =>
    request === version && revisions[kind] === providerRevisions[kind]
  pendingKinds = new Set([...(onlyKind ? pendingKinds : []), ...requestedKinds])
  loading = pendingKinds.size > 0
  if (!onlyKind || onlyKind === 'address') {
    addressController?.abort()
    addressController = new AbortController()
    addressPaging = null
    addressLoadingMore = false
    addressPageError = null
    addressesFailed = false
  }
  if (nearby && !onlyKind) receivedRows = []
  if (!onlyKind || onlyKind === 'establishment') {
    placePaging = null
    moreLoading.establishment = false
    moreErrors.establishment = null
    placesFailed = false
    placesPartial = false
    placesLimited = false
  }
  if (!onlyKind || onlyKind === 'building') {
    buildingPaging = null
    moreLoading.building = false
    moreErrors.building = null
    buildingsFailed = false
    buildingsLimited = false
  }
  if (!onlyKind) searched = false
  // Replace only the responding provider; other matching rows remain usable while pending.
  const replaceRows = (kind: Result['kind'], freshRows: Result[]): void => {
    if (!isCurrent(kind)) return
    // Only a successful response, including zero matches, is a reusable provider cache.
    cachedKinds.add(kind)
    const retained = receivedRows.filter(row => row.kind !== kind)
    // An empty provider with no cached rows must not regroup the other kinds.
    if (!freshRows.length && retained.length === receivedRows.length) return
    receivedRows = [...retained, ...freshRows]
  }
  // Publish each provider immediately; a slow provider must not hide usable results.
  const finish = (kind: Result['kind']): void => {
    if (!isCurrent(kind)) return
    pendingKinds = new Set([...pendingKinds].filter(item => item !== kind))
    loading = pendingKinds.size > 0
    searched = true
  }
  if (nearby && requestedKinds.has('building')) {
    buildingAddressController?.abort()
    buildingAddressController = new AbortController()
  }
  const reverse =
    nearby &&
    coordinates &&
    (requestedKinds.has('building') || requestedKinds.has('address'))
      ? geocodeAddressCandidates(
          { lng: coordinates[0], lat: coordinates[1] },
          {
            signal: requestedKinds.has('building')
              ? buildingAddressController?.signal
              : addressController?.signal,
            maxDistance: radius,
            limit: 50,
            candidateCoordinates: true,
          },
        )
      : null
  // Building discovery uses names extracted from map addresses, constrained to the same circle.
  const nearbyBuildings = async () => {
    const candidates = await reverse!
    const names = new Set(
      candidates.flatMap(item => {
        const address = item.addressMeta.address
        if (!address) return []
        const fields = getAddressLocale(address, getLocaleKey())
        return typeof fields.buildingName === 'string' && fields.buildingName.trim()
          ? [fields.buildingName.trim()]
          : []
      }),
    )
    if (!isCurrent('building')) return { rows: [], total: 0, nextCursor: null }
    if (names.size > 12) buildingsLimited = true
    const found = await Promise.allSettled(
      [...names].slice(0, 12).map(name =>
        searchBuildingNames(name, getLocaleKey(), () => isCurrent('building'), {
          coordinates,
          maxDistance: radius,
          candidateLimit: 30,
          onLimited: () => {
            if (isCurrent('building')) buildingsLimited = true
          },
        }),
      ),
    )
    if (isCurrent('building') && found.some(result => result.status === 'rejected'))
      buildingsFailed = true
    const unique = new Map(
      found
        .flatMap(result => (result.status === 'fulfilled' ? result.value : []))
        .map(row => [row.id, row]),
    )
    return { rows: [...unique.values()], total: unique.size, nextCursor: null }
  }
  await Promise.allSettled([
    preferredKind && projectId && q && !onlyKind
      ? searchTargetLocations({ projectId, kind: preferredKind as Result['kind'], q })
          .then(found => {
            if (request !== version) return
            localSearchLimited = Boolean(found.nextCursor)
            localRows = found.data.flatMap(row =>
              row.facts &&
              row.revisionId &&
              row.state !== 'redirect' &&
              row.kind !== 'unknown'
                ? [
                    {
                      id: `location:${row.id}`,
                      kind: row.kind,
                      names: row.facts.names,
                      identity: {
                        locationId: row.id,
                        revisionId: row.revisionId,
                        ...(row.ssId ? { ssId: row.ssId } : {}),
                      },
                      address: {
                        version: 1 as const,
                        source: row.facts.location.address,
                        coordinates: row.facts.location.geometry.coordinates,
                        matchStatus: row.facts.location.address.status,
                        overrides: {},
                      },
                    },
                  ]
                : [],
            )
          })
          .catch(() => {
            if (request === version) localSearchFailed = true
          })
      : Promise.resolve(),
    requestedKinds.has('building')
      ? (nearby
          ? nearbyBuildings()
          : searchBuildingNamesPage(q, getLocaleKey(), () => isCurrent('building'))
        )
          .then(page => {
            if (!isCurrent('building')) return
            buildingPaging = {
              query: q,
              locale: getLocaleKey(),
              total: page.total,
              nextCursor: page.nextCursor,
            }
            replaceRows('building', page.rows)
          })
          .catch(() => {
            if (isCurrent('building')) buildingsFailed = true
          })
          .finally(() => finish('building'))
      : Promise.resolve(),
    requestedKinds.has('establishment')
      ? Promise.resolve(
          nearby && coordinates
            ? searchNearbyDraftLocations({ coordinates, radius, filters })
            : searchDraftLocations({ q, locale: getLocale(), limit: 20, filters }),
        )
          .then(async places => {
            if (!isCurrent('establishment')) return
            const fresh = await placeSearchRows(places.rows)
            if (!isCurrent('establishment')) return
            placesPartial = places.partial
            placesLimited = 'limited' in places && places.limited === true
            placePaging = nearby
              ? null
              : {
                  query: q,
                  locale: getLocale(),
                  filters: { ...filters },
                  nextCursor:
                    'nextCursor' in places && typeof places.nextCursor === 'string'
                      ? places.nextCursor
                      : null,
                }
            replaceRows('establishment', fresh)
          })
          .catch(() => {
            if (isCurrent('establishment')) placesFailed = true
          })
          .finally(() => finish('establishment'))
      : Promise.resolve(),
    requestedKinds.has('address')
      ? (nearby
          ? reverse!.then(rows => ({
              rows,
              nextCursor: null,
              total: rows.length,
              releaseSet: '',
            }))
          : geocodeAddressPage({ address: q }, { signal: addressController!.signal })
        )
          .then(page => {
            if (!isCurrent('address')) return
            const addresses = page.rows
            addressPaging = nearby
              ? null
              : {
                  query: q,
                  total: page.total,
                  nextCursor: page.nextCursor,
                  releaseSet: page.releaseSet,
                }
            replaceRows('address', addressSearchRows(addresses, nearby))
          })
          .catch(() => {
            if (isCurrent('address')) addressesFailed = true
          })
          .finally(() => finish('address'))
      : Promise.resolve(),
  ])
  // Only complete, current, empty discovery can advance the viewer's component hints.
  if (
    !nearby &&
    !onlyKind &&
    request === version &&
    query.trim() === q &&
    fallbackSeeds[0]?.query === q &&
    fallbackSeeds.length > 1 &&
    !receivedRows.length &&
    !placesFailed &&
    !placesPartial &&
    !placesLimited &&
    !buildingsFailed &&
    !buildingsLimited &&
    !addressesFailed &&
    !placePaging?.nextCursor &&
    !buildingPaging?.nextCursor &&
    !addressPaging?.nextCursor
  ) {
    const previous = fallbackSeeds.shift()!
    const next = fallbackSeeds[0]!
    const label = (
      kind: import('#lib/locations/matchSeed.js').LocationMatchSeed['kind'],
    ): string => locationKindLabel(kind)
    fallbackStatus = m.location_search_fallback({
      previous: label(previous.kind),
      next: label(next.kind),
    })
    query = next.query
    await search()
  }
}
/** Project a Place page into the same rows used by initial discovery and map markers.
 * @param places Verified source previews.
 * @returns Stable result identities with structured address labels.
 */
async function placeSearchRows(
  places: Awaited<ReturnType<typeof searchDraftLocations>>['rows'],
): Promise<Result[]> {
  const addresses = await placeAddressWorker.structure(
    places.map(place => ({
      version: 1 as const,
      source: place.facts.location.address,
      coordinates: place.facts.location.geometry.coordinates,
      matchStatus: place.facts.location.address.status,
      overrides: {},
    })),
  )
  return places.map((place, index) => ({
    id: `place:${place.id}`,
    kind: 'establishment',
    source: { ssId: place.id, resourceReleaseId: place.resourceReleaseId },
    names: place.facts.names,
    taxonomyLabel: placeTaxonomyLabel(place.facts.classification),
    address: addresses[index],
  }))
}
/** Project every fetched address without changing provider order or canonical identity.
 * @param addresses Parsed candidates from one page.
 * @param nearby Enforce the active pin radius for reverse discovery.
 * @returns Editable address previews in the existing result shape.
 */
function addressSearchRows(
  addresses: ParsedReverseGeocodeResult[],
  nearby = false,
): Result[] {
  return addresses.flatMap(result => {
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
                (value): value is string => typeof value === 'string' && Boolean(value),
              ) || '',
            ]
          }),
        ),
      },
    ]
  })
}

/** Append the next cached search slice; retry keeps the same cursor and existing rows.
 * @returns Completion of the latest page request, with stale replies ignored.
 */
async function loadMoreAddresses(): Promise<void> {
  const paging = addressPaging
  if (
    !paging?.nextCursor ||
    addressLoadingMore ||
    selected ||
    currentGroup ||
    !searchAddresses ||
    pendingKinds.has('address')
  )
    return
  const request = version
  const revision = providerRevisions.address
  addressLoadingMore = true
  addressPageError = null
  try {
    const page = await geocodeAddressPage(
      { address: paging.query },
      {
        cursor: paging.nextCursor,
        releaseSet: paging.releaseSet,
        signal: addressController?.signal,
      },
    )
    if (request !== version || revision !== providerRevisions.address) return
    const existing = new Set(receivedRows.map(row => row.id))
    receivedRows = [
      ...receivedRows,
      ...addressSearchRows(page.rows).filter(row => !existing.has(row.id)),
    ]
    addressPaging = {
      query: paging.query,
      total: page.total,
      nextCursor: page.nextCursor,
      releaseSet: page.releaseSet,
    }
  } catch (cause) {
    if (request === version && revision === providerRevisions.address)
      addressPageError =
        cause instanceof GeocodeRequestError && cause.status === 410
          ? 'expired'
          : 'failed'
  } finally {
    if (request === version && revision === providerRevisions.address)
      addressLoadingMore = false
  }
}
/** Continue one provider while preserving the other providers, scroll position and retry cursor.
 * @param kind Place or Building provider whose end has entered the viewport.
 * @returns Completion of the current page; obsolete responses never publish.
 */
async function loadMoreLocations(kind: 'establishment' | 'building'): Promise<void> {
  const paging = kind === 'establishment' ? placePaging : buildingPaging
  if (
    !paging?.nextCursor ||
    moreLoading[kind] ||
    pendingKinds.has(kind) ||
    selected ||
    currentGroup ||
    !(kind === 'establishment' ? includeShops : searchBuildings)
  )
    return
  const request = version
  const revision = providerRevisions[kind]
  const isCurrent = (): boolean =>
    request === version && revision === providerRevisions[kind]
  moreLoading[kind] = true
  moreErrors[kind] = null
  try {
    let fresh: Result[]
    if (kind === 'establishment' && placePaging) {
      const current = placePaging
      const page = await searchDraftLocations({
        q: current.query,
        locale: current.locale,
        filters: current.filters,
        limit: 20,
        cursor: current.nextCursor!,
      })
      if (!isCurrent()) return
      fresh = await placeSearchRows(page.rows)
      if (!isCurrent()) return
      placePaging = { ...current, nextCursor: page.nextCursor }
      placesPartial ||= page.partial
    } else if (kind === 'building' && buildingPaging) {
      const current = buildingPaging
      const page = await searchBuildingNamesPage(
        current.query,
        current.locale,
        isCurrent,
        current.nextCursor!,
      )
      if (!isCurrent()) return
      fresh = page.rows
      buildingPaging = { ...current, nextCursor: page.nextCursor, total: page.total }
    } else return
    const existing = new Set(receivedRows.map(row => row.id))
    receivedRows = [
      ...receivedRows,
      ...fresh.filter(row => {
        if (existing.has(row.id)) return false
        existing.add(row.id)
        return true
      }),
    ]
  } catch (cause) {
    if (isCurrent())
      moreErrors[kind] =
        cause && typeof cause === 'object' && 'status' in cause && cause.status === 410
          ? 'expired'
          : 'failed'
  } finally {
    if (isCurrent()) moreLoading[kind] = false
  }
}
/** Prefetch when each provider's final row enters view, including empty filtered pages.
 * @returns Nothing; hidden kinds, grouped subsets and selected previews do not load.
 */
function maybeLoadMoreLocations(): void {
  if (
    !active ||
    !resultsElement ||
    resultsElement.clientHeight <= 0 ||
    selected ||
    currentGroup
  )
    return
  const viewport = resultsElement.getBoundingClientRect()
  for (const kind of searchKinds) {
    const sentinel = resultsElement.querySelector<HTMLElement>(
      `[data-pagination-kind="${kind}"]`,
    )
    if (!sentinel) continue
    const bounds = sentinel.getBoundingClientRect()
    if (bounds.top > viewport.bottom + 160 || bounds.bottom < viewport.top - 160)
      continue
    if (kind === 'address') {
      if (!addressPageError) void loadMoreAddresses()
    } else if (!moreErrors[kind]) void loadMoreLocations(kind)
  }
}
// Recheck provider boundaries after appending, filtering or returning to the results.
$effect(() => {
  addressPaging?.nextCursor
  placePaging?.nextCursor
  buildingPaging?.nextCursor
  visibleRows.length
  addressLoadingMore
  moreLoading.establishment
  moreLoading.building
  loading
  active
  selected
  currentGroup
  includeShops
  searchAddresses
  searchBuildings
  void tick().then(maybeLoadMoreLocations)
})

/** Capture discovery choices without retaining live requests or DOM references.
 * @returns JSON-compatible state for the owning form.
 */
export function getProgress(): DraftLocationSearchProgress {
  return {
    associationOrigin,
    associationOpen,
    query,
    nearbyFilter,
    findMode,
    filters,
    radius,
    nearbyMode,
    includeShops,
    includeAddresses,
    includeBuildings,
    selected,
    selectedResultNumber,
    accepted,
    linked,
    expandedGroup,
    receivedRows,
    previousRows,
    previousQuery,
    previousScrollTop,
    searched,
    addressPaging,
    placePaging,
    buildingPaging,
  }
}

/** Synchronise an explicitly accepted address correction with the selected result toolbar.
 * @param address Corrected or exactly matched address, after any marker-move confirmation.
 * @returns Nothing; the owner retains its association intent and controls persistence.
 */
export function adoptAddressChange(address: FeatureAddress): void {
  invalidateAssociationLookup()
  selected = {
    id: selected?.id ?? `address:${address.source.address2dId ?? 'custom'}`,
    kind: 'address',
    localKind: 'address',
    names: {},
    address,
  }
  accepted = linked = true
}

/** Synchronize an edited address with its existing numbered discovery marker.
 * @param address Accepted address fields and marker destination.
 * @returns Nothing; identity type and acceptance remain owned by the enclosing form.
 */
export function syncSelectedAddress(address: FeatureAddress): void {
  if (selected) selected = { ...selected, address }
}

/** Resume discovery without replaying selection callbacks or remote mutations.
 * @param progress Previously captured state, or null to start fresh.
 * @returns Nothing; stale requests are invalidated before restoring choices.
 */
export function restoreProgress(progress: DraftLocationSearchProgress | null): void {
  invalidateAssociationLookup()
  version++
  cachedKinds = new Set()
  buildingAddressController?.abort()
  addressController?.abort()
  clearTimeout(timer)
  timer = undefined
  loading = false
  pendingKinds = new Set()
  placesFailed =
    placesPartial =
    placesLimited =
    addressesFailed =
    buildingsFailed =
      false
  filtersOpen = false
  hovered = focusedResult = null
  associationOrigin = progress?.associationOrigin ?? null
  associationOpen = progress?.associationOpen ?? false
  query = progress?.query ?? ''
  nearbyFilter = progress?.nearbyFilter ?? ''
  findMode = progress?.findMode ?? 'search'
  filters = progress?.filters ?? { operatingStatus: 'open' }
  radius = progress?.radius ?? 300
  nearbyMode = progress?.nearbyMode ?? false
  includeShops = progress?.includeShops ?? true
  includeAddresses = progress?.includeAddresses ?? true
  includeBuildings = progress?.includeBuildings ?? true
  selected = progress?.selected ?? null
  selectedResultNumber = progress?.selectedResultNumber
  accepted = progress?.accepted ?? false
  linked = progress?.linked ?? false
  expandedGroup = progress?.expandedGroup ?? null
  receivedRows = progress?.receivedRows ?? []
  addressPaging = progress?.addressPaging ?? null
  placePaging = progress?.placePaging ?? null
  buildingPaging = progress?.buildingPaging ?? null
  moreLoading = { establishment: false, building: false }
  moreErrors = { establishment: null, building: null }
  addressController = new AbortController()
  addressLoadingMore = false
  addressPageError = null
  previousRows = progress?.previousRows ?? []
  previousQuery = progress?.previousQuery ?? ''
  previousScrollTop = progress?.previousScrollTop ?? 0
  searched = progress?.searched ?? false
}

/** Highlight previews without changing the draft's accepted marker.
 * @returns Nothing.
 */
function publishMarkers(): void {
  if (associationOpen) return
  const markerRows = visibleRows.map(row =>
    accepted && linked && selected?.id === row.id ? selected : row,
  )
  const extra = associationPreview ?? (accepted && linked ? selected : null)
  if (extra && !markerRows.some(row => row.id === extra.id)) markerRows.push(extra)
  const markers = markerRows.flatMap((result, index) =>
    result.address.coordinates
      ? [
          {
            id: result.id,
            kind: result.kind,
            ...(currentGroup ? { fitGroup: expandedGroup ?? undefined } : {}),
            number:
              result.id === associationPreview?.id
                ? visibleRows.findIndex(row => row.id === result.id) + 1
                : result.id === selected?.id && selectedResultNumber !== undefined
                  ? selectedResultNumber
                  : index + 1,
            color:
              (result.id === associationPreview?.id &&
                visibleRows.findIndex(row => row.id === result.id) + 1 === 0) ||
              (result.id === selected?.id && selectedResultNumber === 0)
                ? '#3b82f6'
                : undefined,
            coordinates: result.address.coordinates,
            label:
              result.names[getLocale()] ||
              result.names.en ||
              Object.values(result.names).find(value => value?.trim()) ||
              getAddressDisplay(result.address, getLocaleKey()),
            highlighted:
              highlightedResult === result.id || associationPreview?.id === result.id,
            selected: selected?.id === result.id,
            previewOnly: !accepted,
            hidden: Boolean(
              accepted &&
                selected &&
                selected.id !== result.id &&
                associationPreview?.id !== result.id,
            ),
          },
        ]
      : [],
  )
  untrack(() =>
    onMapCandidates?.(markers, id => {
      if (associationPreview?.id === id) {
        onPreview?.(associationPreview)
        return
      }
      const row = Array.from(
        resultsElement?.querySelectorAll<HTMLElement>('[data-search-result]') ?? [],
      ).find(element => element.dataset.searchResult === id)
      if (row) {
        const result = markerRows.find(result => result.id === id)
        if (!result) return
        choose(result)
        focusedResult = id
        // Reveal after the selected row's actions have changed its layout.
        void tick().then(() => {
          if (selected?.id === id) centreResult(row, true)
        })
        return
      }
      const result = markerRows.find(row => row.id === id)
      if (result) choose(result)
    }),
  )
}
$effect(publishMarkers)

/** Preview a result while retaining every candidate marker until acceptance.
 * @param result Selected row. @returns Nothing.
 */
function choose(result: Result): void {
  onSelectionStart?.()
  moreLoading = { establishment: false, building: false }
  moreErrors = { establishment: null, building: null }
  addressLoadingMore = false
  addressPageError = null
  invalidateAssociationLookup()
  filtersOpen = false
  version++
  cachedKinds = new Set()
  buildingAddressController?.abort()
  addressController?.abort()
  clearTimeout(timer)
  timer = undefined
  loading = false
  pendingKinds = new Set()
  searched = false
  previousScrollTop = resultsElement?.scrollTop ?? 0
  previousRows = receivedRows
  previousQuery = query
  const resultIndex = visibleRows.findIndex(row => row.id === result.id)
  const groupIndex = groups.findIndex(group =>
    group.members.some(member => member.id === result.id),
  )
  selectedResultNumber =
    resultIndex >= 0 ? resultIndex + 1 : groupIndex >= 0 ? groupIndex + 1 : 0
  selected = result
  hovered = null
  accepted = false
  onPreview?.(result)
  // Identity resolution begins only when the user opens the association picker.
}
/** Accept only an explicit location action; name linking belongs to Profile.
 * @param result Source row.
 * @returns Nothing.
 */
async function acceptResult(result: Result): Promise<void> {
  if (allowedLocationKinds && !allowedLocationKinds.includes(result.kind)) {
    openAssociation(result, false)
    return
  }
  if (selected?.id !== result.id) choose(result)
  const request = ++version
  if (
    result.kind === 'establishment' &&
    !result.localKind &&
    !result.associationConfirmed
  ) {
    // Reviewed association choices already have structured values; preserve legacy source text when either catalogue is unavailable.
    const [streets, buildings] = await Promise.all([
      loadAddressNames('streets').catch(() => []),
      loadAddressNames('buildings').catch(() => []),
    ])
    if (selected?.id !== result.id || request !== version) return
    result = {
      ...result,
      address: structurePlaceAddress(result.address, streets, buildings),
    }
    selected = result
  }
  // Address-only choices use the same deferred creation/link path as other local identities.
  if (result.kind === 'address') {
    result = {
      ...result,
      localKind: 'address',
      address: {
        ...result.address,
        association: {
          originKind: result.address.association?.originKind ?? result.kind,
          kind: 'address',
          mode: 'manual',
          lookup: 'not-checked',
          names: {},
        },
      },
    }
    selected = result
  }
  onSelect({
    ...result,
    localKind: result.source ? undefined : result.localKind,
    ...(result.kind === 'establishment'
      ? {
          localKind: result.source ? undefined : (result.localKind ?? result.kind),
          associationConfirmed: true,
        }
      : {}),
    nameMode: 'independent',
  })
  accepted = true
  linked = true
}

let autoAcceptSpecific = $state(false)
let createNewAssociation = $state(false)
/** Open association review, allowing an explicit selection to skip redundant confirmation.
 * @param result Starting record. @param explicitSelection User chose Locate feature here.
 * @returns Nothing; any accepted identity remains a draft until the Feature is saved.
 */
function openAssociation(
  result: Result,
  explicitSelection = false,
  createNew = false,
): void {
  if (
    explicitSelection &&
    !createNew &&
    result.kind === 'establishment' &&
    (!allowedLocationKinds || allowedLocationKinds.includes(result.kind))
  ) {
    void acceptResult(result)
    return
  }
  createNewAssociation =
    createNew ||
    Boolean(allowedLocationKinds && !allowedLocationKinds.includes(result.kind))
  autoAcceptSpecific = explicitSelection && !createNewAssociation
  onSelectionStart?.()
  if (selected?.id !== result.id) choose(result)
  associationOrigin = {
    ...result,
    nameMode: currentNameMode ?? result.nameMode,
    ...(accepted && currentAddress ? { address: currentAddress } : {}),
  }
  associationOpen = true
}

/** Leave review through the header without changing a saved association.
 * @returns Nothing; unsaved discovery retains its existing return-to-results behavior.
 */
function leaveAssociation(): void {
  if (canReturnToResults) {
    backToResults()
    return
  }
  associationOpen = false
  associationPreview = null
  if (selected) onPreview?.(selected)
}
/** Complete a reviewed association without reparsing its component choices.
 * @param result Reviewed identity, names and Feature-owned address. @returns Nothing.
 */
function acceptAssociation(result: Result): void {
  selected = result
  associationOpen = false
  associationPreview = null
  onSelect(result)
  accepted = linked = true
}

/** Reconcile edited entity names quietly, revealing the picker only when candidates exist.
 * @param address Current Feature address. @param names Edited localized entity names.
 * @returns Completion; manual address mode and stale responses never open suggestions.
 */
export async function resolveAssociation(
  address: FeatureAddress,
  names: Record<string, string>,
): Promise<void> {
  const choice = selected
  if (!choice || choice.kind === 'address' || address.association?.mode === 'manual')
    return
  const request = ++associationRequest
  const found = await searchAssociationCandidates({
    kind: choice.kind,
    names,
    coordinates: address.coordinates,
    projectId,
    locale: getLocaleKey(),
    cached: receivedRows,
  }).catch(() => null)
  if (request !== associationRequest || selected?.id !== choice.id) return
  const lookup =
    !found || found.incomplete
      ? 'failed'
      : found.candidates.length > 1
        ? 'ambiguous'
        : found.candidates.length
          ? 'matched'
          : 'no-match'
  const reviewed: Result = {
    ...choice,
    names,
    associationConfirmed: true,
    address: {
      ...address,
      association: {
        ...address.association,
        originKind: address.association?.originKind ?? choice.kind,
        kind: choice.kind,
        mode: address.association?.mode ?? 'unlinked',
        lookup,
        checkedAt: new Date().toISOString(),
        names,
      },
    },
  }
  // Preserve the result of quiet checks on authored records without changing an accepted identity.
  if (reviewed.address.association?.mode === 'unlinked') {
    selected = reviewed
    onSelect(reviewed)
  }
  if (!found?.candidates.length) return
  associationOrigin = {
    ...reviewed,
    source: undefined,
    identity: undefined,
    buildingSource: undefined,
  }
  associationOpen = true
}

/** Detach the selected place or building while retaining the accepted address and result history.
 * @returns Nothing; the owner removes the pending association without resetting draft fields.
 */
function unlinkResult(): void {
  linked = false
  onUnlink?.()
}

/** Turn sync back on without renaming the Location or discarding edited address components.
 * @returns Nothing; source identity decides synced versus open to sync.
 */
function enableSync(): void {
  if (!selected) return
  const address = currentAddress ?? selected.address
  const mode = locationSyncMode(undefined, selected)
  const names = Object.values(address.association?.names ?? {}).some(Boolean)
    ? address.association!.names
    : selected.names
  selected = {
    ...selected,
    names,
    associationConfirmed: true,
    address: {
      ...address,
      association: {
        ...address.association,
        originKind: address.association?.originKind ?? selected.kind,
        kind: selected.kind,
        names,
        mode,
        lookup: mode === 'linked' ? 'matched' : 'not-checked',
        targetId: selected.address.association?.targetId,
      },
    },
  }
  linked = true
  onSelect({ ...selected, nameMode: 'independent' })
}

/** Restore the last result set and let the owner undo only the selected Location.
 * @returns Nothing; saved selections cannot restore their previous choices.
 */
export function backToResults(): void {
  associationOpen = false
  associationOrigin = null
  invalidateAssociationLookup()
  if (!canReturnToResults || !selected) return
  const selectedId = selected?.id
  const scrollTop = previousScrollTop
  version++
  cachedKinds = new Set()
  buildingAddressController?.abort()
  addressController?.abort()
  addressController = new AbortController()
  moreLoading = { establishment: false, building: false }
  moreErrors = { establishment: null, building: null }
  clearTimeout(timer)
  timer = undefined
  if (accepted) onBack?.()
  accepted = false
  linked = false
  selected = null
  query = previousQuery
  receivedRows = previousRows
  // Return to the building/group overview, not its individual street alternatives.
  expandedGroup = null
  selectedResultNumber = undefined
  searched = true
  loading = false
  pendingKinds = new Set()
  void tick().then(() => {
    onReturnToResults?.()
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
  if (preferredKind && currentAddress?.coordinates) {
    const kind = preferredKind as Result['kind']
    const address = { ...currentAddress, association: undefined }
    const result: Result = {
      id: `manual:${crypto.randomUUID()}`,
      kind,
      localKind: kind,
      names: {},
      address,
    }
    choose(result)
    openAssociation(result, false)
    return
  }
  associationOpen = false
  associationOrigin = null
  invalidateAssociationLookup()
  clearSearch()
  selected = null
  linked = false
  accepted = true
}

/** Expand grouped addresses before previewing an individual source record.
 * @param result Visible source row. @returns Nothing; row activation never accepts a choice.
 */
function openResult(result: Result): void {
  const group = groups.find(group => group.representative.id === result.id)
  if (!currentGroup && group && group.expandable) {
    selected = null
    hovered = focusedResult = null
    expandedGroup = result.id
    void tick().then(() =>
      resultsElement?.querySelector<HTMLButtonElement>('[data-result-id]')?.focus(),
    )
    return
  }
  // Repeated clicks and Enter only preview; an explicit action is always required.
  choose(result)
}

/** Separate the primary name from its address without repeating the same line.
 * @param result Source candidate. @returns Primary and secondary display labels.
 */
function resultLabels(result: Result): { title: string; detail: string } {
  const display = getAddressDisplay(result.address, getLocaleKey())
  // Draft edits belong only to the accepted identity, never discovery candidates.
  const useDraftName =
    accepted &&
    selected?.id === result.id &&
    (result.localKind || (result.kind === 'building' && !result.source)) &&
    locationName !== undefined
  const name = useDraftName
    ? locationName?.trim()
    : result.names[getLocale()]?.trim() ||
      result.names.en?.trim() ||
      Object.values(result.names).find(value => value?.trim()) ||
      ''
  const title =
    name ||
    (result.kind === 'address'
      ? display || m.location_type_address()
      : result.kind === 'building'
        ? m.feature_search_nameless_building()
        : m.feature_search_nameless_establishment())
  const detail = display.startsWith(title)
    ? display.slice(title.length).replace(/^[,，\s]+/, '')
    : display
  return { title, detail }
}
onDestroy(() => {
  placeAddressWorker.destroy()
  invalidateAssociationLookup()
  onFilterPanelChange?.(undefined)
  version++
  cachedKinds = new Set()
  buildingAddressController?.abort()
  addressController?.abort()
  clearTimeout(timer)
  timer = undefined
})
/** Hand forward Tab from the final result control to the manual-entry action.
 * @param event Keyboard event from a result or its acceptance controls.
 * @param index Visible result index.
 * @returns Nothing; Shift+Tab retains the normal reverse order.
 */
function handleResultTab(event: KeyboardEvent, index: number): void {
  if (event.key !== 'Tab' || event.shiftKey || index !== visibleRows.length - 1) return
  const target = event.currentTarget as HTMLButtonElement
  const controls = target
    .closest('[data-search-result]')
    ?.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([tabindex="-1"])')
  if (controls?.[controls.length - 1] === target && onResultsEnd?.())
    event.preventDefault()
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
  {#if associationOpen}
    <div
      class="relative flex min-w-0 flex-1 items-center px-10"
      data-association-toolbar
    >
      <button
        type="button"
        aria-label={canReturnToResults
          ? m.feature_start_back_results()
          : m.association_back_editor()}
        class="text-primary hover:bg-primary/10 focus-visible:outline-primary absolute top-1/2 left-0 flex size-8 -translate-y-1/2 items-center justify-center rounded focus-visible:outline-2"
        onclick={leaveAssociation}
      >
        <BackIcon class="size-5" />
      </button>
      <LocationAssociationHeading />
    </div>
  {:else if accepted}
    {#if selected}
      <div class="flex min-w-0 items-center gap-2">
        {#if canReturnToResults}
          <SimpleTooltip
            >{#snippet trigger()}
              <button
                type="button"
                aria-label={selected?.kind === 'address' && !associationOrigin
                  ? m.feature_start_back_results()
                  : m.association_back_proposal()}
                class="text-primary hover:bg-primary/10 focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded focus-visible:outline-2"
                onclick={() => {
                  if (selected?.kind === 'address' && !associationOrigin)
                    backToResults()
                  else if (selected) openAssociation(selected)
                }}
              >
                <BackIcon class="size-5" />
              </button>
            {/snippet}
            {selected?.kind === 'address' && !associationOrigin
              ? m.feature_start_back_results()
              : m.association_back_proposal()}</SimpleTooltip
          >
        {/if}
        {#if selectedLocationHref}
          <a
            href={selectedLocationHref}
            class="group/location-details text-primary focus-visible:outline-primary grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <SimpleTooltip
              triggerProps={{ tabindex: -1 }}
              triggerClass="shrink-0"
              contentProps={{ side: 'top', align: 'center' }}
            >
              {#snippet trigger()}
                <LocationIcon
                  kind={selected?.kind}
                  class="text-muted-foreground size-6 shrink-0"
                />
              {/snippet}
              {locationKindLabel(selected.kind)}
            </SimpleTooltip>
            <span
              class="decoration-primary/40 group-hover/location-details:decoration-primary min-w-0 break-words whitespace-normal underline underline-offset-4"
              >{resultLabels(selected).title}</span
            >
          </a>
        {:else}
          <SimpleTooltip
            triggerProps={{ tabindex: -1 }}
            triggerClass="shrink-0"
            contentProps={{ side: 'top', align: 'center' }}
          >
            {#snippet trigger()}
              <LocationIcon
                kind={selected?.kind}
                class="text-muted-foreground size-6 shrink-0"
              />
            {/snippet}
            {locationKindLabel(selected.kind)}
          </SimpleTooltip>
          <span class="min-w-0 text-base font-medium break-words whitespace-normal"
            >{resultLabels(selected).title}</span
          >
        {/if}
        <SimpleTooltip triggerProps={{ tabindex: -1 }}
          >{#snippet trigger()}
            <button
              type="button"
              aria-label={m.association_change()}
              class="text-primary hover:bg-primary/10 focus-visible:outline-primary inline-flex size-8 shrink-0 items-center justify-center rounded focus-visible:outline-2"
              onclick={() => selected && openAssociation(selected)}
            >
              <ReplaceIcon class="size-4" />
            </button>
          {/snippet}
          {m.association_change()}</SimpleTooltip
        >
      </div>
    {/if}
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      {#if resolutionOrigin === 'existing-feature' && onExitResolution}
        <button
          type="button"
          aria-label={m.association_back_editor()}
          class="text-primary hover:bg-primary/10 focus-visible:outline-primary flex shrink-0 items-center gap-2 rounded px-2 py-2 text-sm focus-visible:outline-2"
          onclick={onExitResolution}
        >
          <BackIcon class="size-5" aria-hidden="true" />
          <span>{m.association_back_editor()}</span>
        </button>
      {/if}
      {#if currentGroup}
        <button
          bind:this={subsetBackButton}
          type="button"
          aria-label={m.feature_start_back_results()}
          class="group text-primary hover:bg-primary/10 focus-visible:outline-primary flex shrink-0 items-center gap-2 rounded px-2 py-2 transition-colors focus-visible:outline-2"
          onclick={() => {
            selected = null
            hovered = focusedResult = null
            expandedGroup = null
            void tick().then(() => input?.focus())
          }}
        >
          <BackIcon class="size-5" />
          <span
            class="max-w-0 overflow-hidden text-xs whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-40 group-hover:opacity-100 group-focus-visible:max-w-40 group-focus-visible:opacity-100 motion-reduce:transition-none"
            >{m.feature_start_back_results()}</span
          >
        </button>
      {/if}
      <fieldset
        class="flex shrink-0 items-center gap-2"
        aria-label={m.feature_search_include()}
      >
        <legend class="sr-only">{m.feature_search_include()}</legend>
        <span class="text-muted-foreground text-sm" aria-hidden="true"
          >{m.feature_search_include()}</span
        >
        <div
          class="border-border bg-panel inline-flex items-center gap-1 rounded-lg border p-1"
        >
          {#each searchKinds as kind}
            {@const enabled =
              kind === 'establishment'
                ? includeShops
                : kind === 'address'
                  ? includeAddresses
                  : includeBuildings}
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
              disabled={Boolean(suggestionKinds && !suggestionKinds.includes(kind))}
              aria-busy={pendingKinds.has(kind)}
              data-tooltip={label}
              onclick={() => {
                const wasEnabled = enabled
                if (kind === 'establishment') {
                  includeShops = !includeShops
                  if (!includeShops) filtersOpen = false
                }
                if (kind === 'building') includeBuildings = !includeBuildings
                if (kind === 'address') includeAddresses = !includeAddresses
                // Type toggles preserve caches, other requests, paging and selection state.
                if (wasEnabled) {
                  providerRevisions[kind]++
                  if (kind !== 'address') moreLoading[kind] = false
                  if (kind === 'address') {
                    addressController?.abort()
                    addressLoadingMore = false
                  }
                  pendingKinds = new Set(
                    [...pendingKinds].filter(item => item !== kind),
                  )
                  loading = pendingKinds.size > 0
                } else if (cachedKinds.has(kind)) {
                  // Resume pagination from the retained cursor with a live abort signal.
                  if (kind === 'address') addressController = new AbortController()
                } else if (!timer) {
                  void search(findMode === 'pin', kind)
                } else {
                  pendingKinds = new Set(
                    findMode === 'search' ? textSearchKinds : [...pendingKinds, kind],
                  )
                  loading = pendingKinds.size > 0
                }
              }}
              class="text-muted-foreground hover:bg-muted focus-visible:outline-primary flex size-9 items-center justify-center rounded-md transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30 aria-pressed:bg-[var(--search-color)] aria-pressed:text-white dark:text-white"
            >
              <LocationIcon
                {kind}
                class={pendingKinds.has(kind)
                  ? 'size-5 motion-safe:animate-pulse motion-safe:[animation-duration:1.5s]'
                  : 'size-5'}
              />
            </button>
          {/each}
        </div>
      </fieldset>
      <div class="flex min-w-0 flex-1 basis-64 items-center justify-center gap-3">
        {#if showSearchTypePrompt && !hasSearchTypes}
          <p
            role="status"
            class="text-muted-foreground flex min-h-12 w-full items-center justify-center text-center text-sm"
          >
            {m.feature_search_select_types()}
          </p>
        {:else if findMode === 'search'}
          <div
            bind:this={searchOutline}
            class="border-border bg-panel focus-within:ring-primary flex min-w-0 flex-1 items-center rounded-lg border focus-within:ring-2"
          >
            <input
              bind:this={input}
              bind:value={query}
              oninput={() => schedule(true)}
              maxlength="200"
              aria-label={m.feature_start_search()}
              placeholder={m.feature_start_search()}
              class="text-foreground w-full min-w-0 flex-1 rounded-lg border-0! bg-transparent py-3 pr-2 pl-4 shadow-none! ring-0! outline-none!"
              onkeydown={event => {
                if (event.key === 'Escape' && !event.isComposing) {
                  event.preventDefault()
                  event.stopPropagation()
                  clearSearch()
                  return
                }
                if (event.key === 'Tab' && !event.shiftKey && rows.length) {
                  const first =
                    resultsElement?.querySelector<HTMLButtonElement>('[data-result-id]')
                  if (first) {
                    event.preventDefault()
                    first.focus()
                  }
                }
                if (event.key === 'Enter' && !event.isComposing) {
                  event.preventDefault()
                  if (event.repeat) return
                  if (visibleRows.length) {
                    resultsElement
                      ?.querySelector<HTMLButtonElement>('[data-result-id]')
                      ?.focus()
                    openResult(visibleRows[0])
                  } else {
                    clearTimeout(timer)
                    timer = undefined
                    void search()
                  }
                }
              }}
            >
            {#if !loading && !addressLoadingMore && (rows.length || searched)}
              <span role="status" class="text-muted-foreground shrink-0 px-2 text-xs"
                >{m.feature_search_result_count({ count: visibleRows.length })}</span
              >
            {/if}
            <button
              type="button"
              aria-label={searched || rows.length
                ? m.feature_search_clear()
                : m.feature_search_submit()}
              data-tooltip={searched || rows.length
                ? m.feature_search_clear()
                : m.feature_search_submit()}
              disabled={!searched && !rows.length && !canSearch}
              onclick={() => {
                if (searched || rows.length) clearSearch()
                else {
                  clearTimeout(timer)
                  timer = undefined
                  void search()
                }
              }}
              class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-primary mr-1 flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 disabled:opacity-40"
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
            class="bg-primary min-h-11 shrink-0 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            bind:this={nearbyButton}
            disabled={loading || !hasSearchTypes}
            onclick={() => void search(true)}
          >
            {m.feature_search_nearby()}
          </button>
          <div
            class="border-border bg-panel focus-within:ring-primary flex min-w-0 flex-1 items-center rounded-lg border focus-within:ring-2"
          >
            <input
              bind:value={nearbyFilter}
              disabled={!nearbyMode}
              aria-label="Filter nearby results"
              placeholder="Filter nearby results"
              maxlength="200"
              class="text-foreground min-h-11 w-full min-w-0 flex-1 rounded-lg bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-40"
              oninput={() => {
                expandedGroup = null
              }}
              onkeydown={event => {
                if (event.key === 'Enter') event.preventDefault()
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  nearbyFilter = ''
                }
              }}
            >
            {#if nearbyMode && !loading}
              <span role="status" class="text-muted-foreground shrink-0 px-2 text-xs"
                >{m.feature_search_result_count({ count: visibleRows.length })}</span
              >
            {/if}
            {#if nearbyFilter}
              <button
                type="button"
                aria-label="Clear nearby filter"
                class="text-muted-foreground hover:bg-muted mr-1 flex size-9 shrink-0 items-center justify-center rounded-md"
                onclick={() => (nearbyFilter = '')}
              >
                <ClearIcon class="size-4" />
              </button>
            {/if}
          </div>
        {/if}
        <button
          bind:this={filterButton}
          type="button"
          aria-label={m.feature_search_filters()}
          data-tooltip={m.feature_search_filters()}
          aria-expanded={filtersOpen}
          disabled={!includeShops}
          onclick={() => (filtersOpen = !filtersOpen)}
          class="border-border bg-panel text-muted-foreground hover:bg-muted focus-visible:outline-primary relative flex size-11 shrink-0 items-center justify-center rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        >
          <FilterIcon class="size-5" aria-hidden="true" />
          {#if filterCount}
            <span
              class="bg-primary absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-xs font-semibold text-white"
              >{filterCount}</span
            >
          {/if}
        </button>
      </div>
      {#if findMode === 'pin' && coordinatesControl}
        <div class="min-w-0 shrink-0">{@render coordinatesControl()}</div>
      {/if}
      <fieldset
        aria-label={m.feature_find_by()}
        class="border-border bg-muted/40 inline-flex shrink-0 rounded-lg border p-1"
      >
        {#each ['search', 'pin'] as mode}
          <button
            type="button"
            aria-label={mode === 'search'
              ? `${m.feature_find_by()} ${m.feature_find_search()}`
              : m.feature_find_pin()}
            aria-pressed={findMode === mode}
            disabled={mode === 'pin' && !onDropPin && !(hasPin && coordinates)}
            onclick={() => setFindMode(mode as 'search' | 'pin')}
            class="text-muted-foreground aria-pressed:bg-panel aria-pressed:text-foreground hover:text-foreground focus-visible:outline-primary rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 disabled:opacity-40 aria-pressed:shadow-sm"
          >
            {mode === 'search' ? m.feature_find_search() : m.feature_find_pin()}
          </button>
        {/each}
      </fieldset>
    </div>
    {#if filtersOpen && !onFilterPanelChange}
      <div class="mt-3 h-112">{@render filterPanel()}</div>
    {/if}
  {/if}
{/snippet}
{#snippet pagination(kind: (typeof searchKinds)[number])}
  {@const enabled =
    kind === 'establishment'
      ? includeShops
      : kind === 'building'
        ? searchBuildings
        : searchAddresses}
  {@const paging =
    kind === 'establishment'
      ? placePaging
      : kind === 'building'
        ? buildingPaging
        : addressPaging}
  {@const busy = kind === 'address' ? addressLoadingMore : moreLoading[kind]}
  {@const pageError = kind === 'address' ? addressPageError : moreErrors[kind]}
  {@const addressCount =
    kind === 'address' ? rows.filter(row => row.kind === 'address').length : 0}
  {#if enabled &&
    paging &&
    !currentGroup &&
    (busy || pageError || paging.nextCursor || addressCount > 0)}
    <div
      role="status"
      data-pagination-kind={kind}
      data-address-pagination={kind === 'address' ? '' : undefined}
      class={[
        'text-muted-foreground flex w-full flex-wrap items-center justify-center gap-3 text-xs',
        !busy && 'py-4',
      ]}
      aria-live="polite"
      aria-label={locationKindLabel(kind)}
    >
      {#if busy}
        <div
          role="status"
          aria-label={m.resource_loading()}
          aria-busy="true"
          class="flex min-h-20 w-full items-center gap-3 px-3 py-6"
        >
          <Skeleton class="size-9 shrink-0 rounded-full" />
          <Skeleton class="size-5 shrink-0" />
          <div class="min-w-0 flex-1 space-y-2">
            <Skeleton class="h-3 w-2/3" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      {:else if addressCount > 0 && addressPaging}
        <span
          >{m.feature_search_addresses_loaded({
            count: addressCount,
            total: addressPaging.total,
          })}</span
        >
      {/if}
      {#if pageError}
        <span role="status"
          >{pageError === 'expired'
            ? m.feature_search_address_expired()
            : m.feature_search_page_failed()}</span
        >
        <button
          type="button"
          class="text-primary hover:bg-muted focus-visible:outline-primary rounded-md px-3 py-2 focus-visible:outline-2"
          onclick={() =>
            pageError === 'expired'
              ? schedule()
              : kind === 'address'
                ? loadMoreAddresses()
                : loadMoreLocations(kind)}
        >
          {pageError === 'expired'
            ? m.feature_search_address_restart()
            : m.feature_search_address_retry()}
        </button>
      {:else if paging.nextCursor && !busy}
        <button
          type="button"
          class="text-primary hover:bg-muted focus-visible:outline-primary rounded-md px-3 py-2 focus-visible:outline-2"
          onclick={() =>
            kind === 'address' ? loadMoreAddresses() : loadMoreLocations(kind)}
        >
          {m.feature_search_load_more()}
        </button>
      {/if}
    </div>
  {/if}
{/snippet}
{#snippet searchResults()}
  {#if localSearchFailed}
    <p role="status" class="text-muted-foreground px-6 py-2 text-sm">
      {m.location_local_unavailable()}
    </p>
  {/if}
  {#if localSearchLimited}
    <p role="status" class="text-muted-foreground px-6 py-2 text-sm">
      {m.location_local_more()}
    </p>
  {/if}
  {#if fallbackStatus && !accepted && !associationOpen}
    <p role="status" class="text-muted-foreground text-sm">{fallbackStatus}</p>
  {/if}
  {#if associationOpen && associationOrigin}
    {#key associationOrigin}
      <LocationAssociationPicker
        {allowedLocationKinds}
        showHeading={false}
        {autoAcceptSpecific}
        createNew={createNewAssociation}
        {onMapCandidates}
        markerNumberFor={result =>
          result.id === selected?.id && selectedResultNumber !== undefined
            ? selectedResultNumber
            : visibleRows.findIndex(row => row.id === result.id) + 1}
        onSpaceNeeded={onAssociationSpaceNeeded}
        origin={associationOrigin}
        cached={receivedRows}
        {projectId}
        search={searchAssociationCandidates}
        onAccept={acceptAssociation}
        onCancel={leaveAssociation}
        onPreview={(result, preserveZoom) => {
          associationPreview = result
          if (preserveZoom) onPreview?.(result, true)
          else onPreview?.(result)
        }}
      />
    {/key}
  {/if}
  {#if resolutionOrigin === 'new-feature' &&
    !associationOpen &&
    !accepted &&
    !loading &&
    !searched &&
    !rows.length}
    <section
      aria-label={m.feature_find_by()}
      class="flex flex-1 items-center justify-center px-6 py-10"
    >
      <div
        class="sm:divide-border/60 grid w-full max-w-4xl gap-8 sm:grid-cols-2 sm:gap-0 sm:divide-x"
      >
        {#each ['search', 'pin'] as choice}
          <div class="flex flex-col items-center gap-4 px-6 text-center">
            <p class="text-muted-foreground max-w-64 text-sm leading-relaxed">
              <strong
                class="text-foreground mb-2 block text-lg leading-snug font-semibold"
                >{choice === 'search'
                  ? m.feature_find_search_lead()
                  : m.feature_find_pin_lead()}</strong
              >
              {choice === 'search'
                ? m.feature_find_search_detail()
                : m.feature_find_pin_detail()}
            </p>
            <button
              type="button"
              disabled={choice === 'pin' && !coordinates && !onDropPin}
              onclick={() => setFindMode(choice as 'search' | 'pin')}
              class="text-primary hover:bg-primary/10 focus-visible:outline-primary mt-auto rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 disabled:opacity-40"
            >
              {choice === 'search' ? m.feature_find_name() : m.feature_find_location()}
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
  {#if !associationOpen && !accepted && (loading || searched || rows.length)}
    <div class="flex min-h-0 flex-1 flex-col px-6" aria-busy={loading}>
      {#if loading && !rows.length}
        <div
          role="status"
          aria-label={m.resource_loading()}
          class="space-y-3 py-3 motion-safe:animate-pulse"
        >
          {#each [0, 1, 2] as placeholder (placeholder)}
            <div aria-hidden="true" class="flex h-12 items-center gap-3">
              <div class="bg-muted size-6 rounded-full"></div>
              <div class="flex-1 space-y-2">
                <div class="bg-muted h-3 w-2/3 rounded"></div>
                <div class="bg-muted h-3 w-1/2 rounded"></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <section
        bind:this={resultsElement}
        onscroll={maybeLoadMoreLocations}
        class={[
          'min-h-0 flex-1 scroll-py-12 overflow-y-auto overscroll-contain pt-3 pb-16',
          !rows.length && 'flex flex-col',
        ]}
        aria-label={m.feature_start_search()}
      >
        {#if findMode === 'pin' &&
          nearbyFilter.trim() &&
          !visibleRows.length &&
          !loading}
          <p role="status" class="text-muted-foreground px-6 py-10 text-center text-sm">
            No nearby results match this filter.
          </p>
        {/if}
        {#each visibleRows as result, index (result.id)}
          {@const labels = resultLabels(result)}
          <div
            data-search-result={result.id}
            data-highlighted={highlightedResult === result.id}
            onfocusin={() => (focusedResult = result.id)}
            onfocusout={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                focusedResult = null
            }}
            class="border-border/50 data-[highlighted=true]:bg-primary/10 relative flex flex-wrap items-center gap-3 rounded-md border-b transition-colors last:border-0"
            animate:flip={{ duration: prefersReducedMotion.current ? 0 : 180 }}
          >
            {#if preferredKind &&
              (index === 0 ||
                (visibleRows[index - 1].kind === preferredKind) !==
                  (result.kind === preferredKind) ||
                (visibleRows[index - 1].kind === 'establishment') !==
                  (result.kind === 'establishment'))}
              <p class="text-muted-foreground w-full pt-4 pb-2 text-sm font-medium">
                {result.kind === preferredKind
                  ? m.location_matching()
                  : result.kind === 'establishment' && preferredKind === 'building_part'
                    ? m.location_space_via_establishment()
                    : m.location_starting_evidence()}
              </p>
            {/if}

            <button
              type="button"
              class="group flex min-h-20 min-w-0 flex-1 basis-64 items-center gap-3 rounded-md px-3 py-6 text-left outline-none"
              data-result-id={result.id}
              data-result-number={index + 1}
              data-result-kind={result.kind}
              onmouseenter={() => (hovered = result.id)}
              onmouseleave={() => (hovered = null)}
              onkeydown={event => {
                if (event.key === 'Enter' && !event.isComposing) {
                  event.preventDefault()
                  if (event.repeat) return
                  openResult(result)
                  return
                }
                handleResultTab(event, index)
                if (event.key === 'Tab' && event.shiftKey && index === 0) {
                  event.preventDefault()
                  if (currentGroup) subsetBackButton?.focus()
                  else (findMode === 'pin' ? nearbyButton : input)?.focus()
                }
              }}
              onfocus={event => {
                const row =
                  event.currentTarget.closest<HTMLElement>('[data-search-result]')
                // Pointer focus happens before click; scrolling here can cancel that click.
                if (row && event.currentTarget.matches(':focus-visible'))
                  centreResult(row)
              }}
              onclick={() => openResult(result)}
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-sm"
                style:background-color={locationSearchColor(result.kind)}
                >{index + 1}</span
              >
              <SimpleTooltip
                triggerProps={{
                  tabindex: -1,
                  onclick: event => event.stopPropagation(),
                }}
              >
                {#snippet trigger()}
                  <LocationIcon
                    kind={result.kind}
                    class="text-muted-foreground size-5 shrink-0"
                  />
                {/snippet}
                {locationKindLabel(result.kind)}
              </SimpleTooltip>
              <span class="relative min-w-0 flex-1">
                <AddressSearchParts
                  address={result.address}
                  numberSummary={currentGroup
                    ? undefined
                    : groups.find(group => group.representative.id === result.id)
                        ?.numberRange}
                  establishmentTitle={result.kind === 'establishment'
                    ? labels.title
                    : undefined}
                  taxonomyLabel={result.taxonomyLabel}
                  primaryName={result.kind !== 'address' &&
                  result.kind !== 'establishment'
                    ? labels.title
                    : undefined}
                  collapsed={!currentGroup &&
                    result.kind === 'address' &&
                    Boolean(
                      groups.find(group => group.representative.id === result.id)
                        ?.expandable,
                    )}
                />
                {#if !currentGroup &&
                  groups.find(
                    group => group.representative.id === result.id && group.expandable,
                  )}
                  <span
                    class="text-muted-foreground absolute top-full left-0 mt-1 text-xs"
                    >{m.feature_search_group_count({
                      count:
                        groups.find(group => group.representative.id === result.id)
                          ?.members.length ?? 1,
                    })}</span
                  >
                {/if}
              </span>
            </button>
            {#if selected?.id === result.id &&
              (currentGroup ||
                !groups.some(
                  group => group.representative.id === result.id && group.expandable,
                ))}
              <div
                class="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 px-3 py-3"
                data-result-actions={result.id}
              >
                <button
                  type="button"
                  class="bg-primary focus-visible:outline-primary rounded-md px-3 py-2 text-sm font-medium text-white focus-visible:outline-2"
                  onkeydown={event => handleResultTab(event, index)}
                  onclick={() => openAssociation(result, true)}
                >
                  {allowedLocationKinds && !allowedLocationKinds.includes(result.kind)
                    ? m.location_create_here()
                    : m.location_use_existing()}
                </button>
                {#if !allowedLocationKinds || allowedLocationKinds.includes('address')}
                  <button
                    type="button"
                    class="border-secondary bg-secondary text-secondary-content focus-visible:outline-secondary rounded-md border px-3 py-2 text-sm font-medium hover:bg-[color-mix(in_oklab,var(--color-secondary)_92%,black)] focus-visible:outline-2 dark:text-white"
                    onkeydown={event => handleResultTab(event, index)}
                    disabled={Boolean(
                      allowedLocationKinds && !allowedLocationKinds.includes('address'),
                    )}
                    onclick={() =>
                      acceptResult({
                        ...result,
                        kind: 'address',
                        source: undefined,
                        identity: undefined,
                        buildingSource: undefined,
                        names: {},
                        address: {
                          ...result.address,
                          association: {
                            originKind: result.kind,
                            kind: 'address',
                            mode: 'manual',
                            lookup: 'not-checked',
                            names: {},
                          },
                        },
                      })}
                  >
                    {m.feature_search_use_address()}
                  </button>
                {/if}
              </div>
            {/if}
            {#if visibleRows[index + 1]?.kind !== result.kind}
              {@render pagination(
                result.kind === 'establishment' || result.kind === 'address'
                  ? result.kind
                  : 'building',
              )}
            {/if}
          </div>
        {/each}
        {#each searchKinds as kind}
          {#if !visibleRows.some(row => row.kind === kind)}
            {@render pagination(kind)}
          {/if}
        {/each}
        {#if searched &&
          !loading &&
          !addressLoadingMore &&
          !rows.length &&
          !placesFailed &&
          !placesPartial &&
          !placesLimited &&
          !addressesFailed &&
          !buildingsFailed &&
          !buildingsLimited &&
          !placePaging?.nextCursor &&
          !buildingPaging?.nextCursor &&
          !addressPaging?.nextCursor}
          <div
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
          >
            <span
              class="bg-primary/5 text-primary/60 flex size-14 items-center justify-center rounded-full"
              aria-hidden="true"
            >
              <SearchIcon class="size-6" />
            </span>
            <p class="text-muted-foreground max-w-sm text-base font-medium">
              {m.feature_start_empty()}
            </p>
          </div>
        {/if}
      </section>
    </div>
  {/if}
  {#if allowManualEntry &&
    onManualEntry &&
    !onResultsEnd &&
    !associationOpen &&
    !accepted &&
    rows.length}
    <div class="flex justify-center px-6 py-4">
      <button
        type="button"
        class="text-primary hover:bg-primary/10 focus-visible:outline-primary rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2"
        onclick={onManualEntry}
      >
        {m.feature_search_manual_location()}
      </button>
    </div>
  {/if}
{/snippet}
{#snippet mapControls()}
  {#if !associationOpen &&
    !accepted &&
    searched &&
    (placesFailed ||
      placesPartial ||
      (placesLimited && !placePaging?.nextCursor) ||
      buildingsFailed ||
      buildingsLimited ||
      addressesFailed)}
    <div
      role="status"
      aria-live="polite"
      data-location-search-notice
      class="pointer-events-none! absolute inset-x-0 bottom-3 flex justify-center px-3"
    >
      <div
        class="border-border/60 bg-panel/95 text-muted-foreground max-w-lg space-y-1 rounded-lg border px-3 py-2 text-center text-xs shadow-sm backdrop-blur-sm"
      >
        {#if placesFailed}
          <p class="flex items-center justify-center gap-2">
            <WarningIcon class="size-4 shrink-0" aria-hidden="true" />
            <span>{m.feature_start_places_failed()}</span>
          </p>
        {/if}
        {#if placesPartial}
          <p>{m.feature_start_partial()}</p>
        {/if}
        {#if placesLimited && !placePaging?.nextCursor}
          <p>{m.feature_start_places_limited()}</p>
        {/if}
        {#if buildingsLimited}
          <p>{m.feature_search_buildings_limited()}</p>
        {/if}
        {#if buildingsFailed}
          <p>{m.feature_search_buildings_failed()}</p>
        {/if}
        {#if addressesFailed}
          <p>{m.feature_start_addresses_failed()}</p>
        {/if}
      </div>
    </div>
  {/if}
  {#if findMode === 'pin' && hasPin && !selected}
    <label
      class="border-border bg-panel text-foreground flex w-52 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm"
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
        class="accent-primary h-4 w-full cursor-pointer"
      >
    </label>
  {/if}
{/snippet}
{#snippet syncControl(disabled = false)}
  {#if accepted && selected}
    <LocationSyncSelect
      value={locationSyncMode(
        linked ? selected.address.association?.mode : 'manual',
        selected,
      )}
      enabledMode={locationSyncMode(undefined, selected) === 'linked'
        ? 'linked'
        : 'unlinked'}
      {disabled}
      onChange={mode => (mode === 'manual' ? unlinkResult() : enableSync())}
    />
  {/if}
{/snippet}
{#if children}
  {@render children(searchControl, searchResults, mapControls, syncControl)}
{:else}
  {@render mapControls()}{@render searchControl()}{@render syncControl()}
  {@render searchResults()}
{/if}
