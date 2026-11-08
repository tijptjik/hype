<script lang="ts">
// SVELTE
import { onDestroy, untrack, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
import LocationIcon from 'virtual:icons/lucide/store'
import AddressIcon from 'virtual:icons/lucide/map-pin-house'
import CreateLocationIcon from 'virtual:icons/lucide/plus'
import SearchIcon from 'virtual:icons/proicons/search'
// LOCATION
import {
  DEFAULT_DISCOVERY_TYPES,
  type AvailableDiscoveryType,
  type LocationKind,
} from '#lib/locations/kinds.js'
import {
  discoverLocations,
  type LocationCandidatePage,
} from '#lib/locations/combinedDiscovery.js'
import LocationTypeFilter from './LocationTypeFilter.svelte'
import {
  locationDistance,
  locationName,
  type LocationSearchMarker,
} from '#lib/locations/searchPresentation.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
import { geocodeAddressCandidates } from '#lib/api/external/geocoding.js'
import {
  scoreDiscovery,
  textAgreement,
  DiscoveryRadiusSchema,
} from '#lib/locations/discovery.js'
import { prepareLocalLocationAddress } from '#lib/addresses/locationDraft.js'
// DOMAIN
import { getAddressDisplay } from '#lib/addresses/featureAddress.js'
// API
import {
  getFeatureLocation,
  getFeatureLocationDiscoverySettings,
  searchFeatureNearbyLocations,
  searchFeatureNearbyLocalLocations,
  getFeatureLocationDiscoveryDetails,
  getLocalLocationCreationAccess,
  getFeatureLocationCandidate,
  importFeatureLocationCandidate,
  linkFeatureLocation,
  relinkFeatureLocation,
  searchFeatureLocations,
  searchFeatureLocalLocations,
} from '#lib/api/location.remote.js'
// COMPONENTS
import LocationLifecycleFields from '../localLocationAddress/LocationLifecycleFields.svelte'
import CreateLocalLocation from './CreateLocalLocation.svelte'
import FormDisclosureGroup from '#lib/bits/patterns/forms/formDisclosureGroup/FormDisclosureGroup.svelte'
import LocationBrandEditor from './LocationBrandEditor.svelte'
import LocationResetFields from './LocationResetFields.svelte'
import LocationReviewSection from './LocationReviewSection.svelte'
import LocationIdentityReviewSection from './LocationIdentityReviewSection.svelte'
import type { LocationReset } from '#lib/locations/reset.js'
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'
// TYPES
import type { LocationSearchCandidate } from '#lib/locations/sourceClient.js'
import type { LocalLocationCandidate } from '#lib/db/services/locationCandidate.js'
import type { LocationFacts } from '#lib/locations/model.js'
type Selection =
  | { status: 'source-import-needed' }
  | { status: 'ready'; locationId: string; revisionId: string; facts: LocationFacts }

let {
  address,
  featureName = '',
  children,
  onMapCandidates,
  featureId,
  projectId,
  coordinates,
  modifiedAt,
  isEditing,
  isDirty,
  brandEdit,
  onBrandEdit,
  reset,
  onResetFields,
  onUnlink,
  onSourceUpdate,
  onAddressSelected,
}: {
  address: FeatureAddress
  onAddressSelected: (address: FeatureAddress) => void
  featureName?: string
  children: Snippet<
    [
      Snippet | undefined,
      Snippet,
      boolean,
      boolean,
      ((query?: string) => void) | undefined,
      Snippet,
      Snippet,
    ]
  >
  onMapCandidates: (
    markers: LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  featureId: string
  projectId: string
  coordinates: number[]
  modifiedAt: string
  isEditing: boolean
  isDirty: boolean
  brandEdit?: unknown
  onBrandEdit: (edit: LocationBrandEdit) => void
  reset?: unknown
  onResetFields: (reset: LocationReset | undefined) => void
  onUnlink: (expectedRevision: string) => Promise<void>
  onSourceUpdate: () => Promise<void>
} = $props()
const accepted = $derived(getFeatureLocation({ featureId }))
let tasksCollapsed = $state(true)
let settingsCollapsed = $state(true)
let creating = $state(false)
let discoveryMode = $state<'idle' | 'text' | 'nearby' | 'matches'>('idle')
let discoveryTypes = $state<AvailableDiscoveryType[]>([...DEFAULT_DISCOVERY_TYPES])
let radius = $state(300)
let radiusEdited = $state(false)
let limited = $state(false)
let chosenAddress = $state<FeatureAddress | undefined>()
let matchChecked = $state(false)
let addressStaged = $state(false)
const discoverySettings = $derived(
  isEditing ? getFeatureLocationDiscoverySettings({ featureId }) : null,
)
$effect(() => {
  if (!radiusEdited && discoverySettings?.current)
    radius = discoverySettings.current.radius
})
const radiusValid = $derived(DiscoveryRadiusSchema.safeParse(radius).success)
let creationLookup = $state<{ query: string; revision: number } | undefined>()
/** Re-geocode only the Location proposal, never the Feature draft.
 * @param query Current toolbar query. @returns Nothing.
 */
function lookupCreation(query?: string): void {
  creationLookup = {
    query: query ?? getAddressDisplay(address, getLocaleKey()),
    revision: (creationLookup?.revision ?? 0) + 1,
  }
}
let query = $state('')
const localeTag = $derived(
  getLocaleKey() === 'zhHant'
    ? 'zh-hant'
    : getLocaleKey() === 'zhHans'
      ? 'zh-hans'
      : 'en',
)
const creationAccess = $derived(getLocalLocationCreationAccess({ projectId }))
type Result = {
  id: string
  facts: LocationFacts
  kind: LocationKind | 'address'
  source?: LocationSearchCandidate
  local?: LocalLocationCandidate
  address?: FeatureAddress
}
let searchRows = $state<Result[]>([])
let selectedRow = $state<string | null>(null)
let hoveredRow = $state<string | null>(null)
let focusedRow = $state<string | null>(null)
/** Adapt Location facts to the shared address presentation contract.
 * @param facts Preview facts. @returns Address suitable for ranking and localized display.
 */
function resultAddress(facts: LocationFacts): FeatureAddress {
  return {
    version: 1,
    source: facts.location.address,
    coordinates: facts.location.geometry.coordinates,
    matchStatus: facts.location.address.status,
    overrides: {},
  }
}
const rankedRows = $derived(
  searchRows
    .map(row => ({
      ...row,
      evidence: scoreDiscovery(
        chosenAddress ?? address,
        row.address ?? resultAddress(row.facts),
        coordinates,
        radius || 300,
      ),
    }))
    .sort((a, b) => b.evidence.score - a.evidence.score || a.id.localeCompare(b.id)),
)
const displayedRows = $derived(
  discoveryMode === 'matches' ? rankedRows.slice(0, 5) : rankedRows,
)
const markers = $derived(
  displayedRows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    number: index + 1,
    coordinates: row.facts.location.geometry.coordinates,
    label: row.address
      ? getAddressDisplay(row.address, getLocaleKey())
      : locationName(row.facts, localeTag),
    selected: selectedRow === row.id,
    highlighted: (hoveredRow ?? focusedRow) === row.id,
  })),
)
$effect(() => {
  onMapCandidates(isEditing && !creating ? markers : [], selectRow)
})
/** Select the same result from a row or its numbered map marker.
 * @param id Stable preview key. @returns Nothing; source imports require the explicit preview action.
 */
function selectRow(id: string): void {
  if (busy || !isEditing) return
  const row = searchRows.find(row => row.id === id)
  if (!row) return
  selectedRow = id
  if (row.address) {
    chosenAddress = row.address
    selected = null
    return
  }
  if (row.local) selected = { status: 'ready', ...row.local }
  else if (row.source) void preview(row.source)
}

let results = $state<LocationSearchCandidate[] | null>(null)
let localResults = $state<LocalLocationCandidate[] | null>(null)
let selected = $state<Selection | null>(null)
let busy = $state(false)
let failed = $state(false)
let searchFailed = $state(false)
let requestVersion = 0
onDestroy(() => {
  requestVersion++
})
let replacementRevision = $state<string | null>(null)
let discoveryContext = ''

// A moved pin, new Feature or changed radius invalidates the previous search circle.
$effect(() => {
  const context = `${featureId}:${coordinates.join(',')}:${radius}`
  if (discoveryContext && discoveryContext !== context) untrack(cancelDiscovery)
  discoveryContext = context
})

/** Discard pending discovery and ignore its late responses, retaining the saved association.
 * @returns Nothing; no Feature values or Location records are written.
 */
function cancelDiscovery(): void {
  requestVersion++
  busy = false
  creating = false
  results = null
  searchRows = []
  selected = null
  selectedRow = null
  chosenAddress = undefined
  matchChecked = false
  searchFailed = false
  failed = false
  limited = false
  discoveryMode = 'idle'
}

// Leaving edit mode discards discovery UI, never the accepted Feature address.
$effect(() => {
  if (isEditing) return
  requestVersion++
  busy = false
  creating = false
  results = null
  localResults = null
  searchRows = []
  selected = null
  selectedRow = null
  replacementRevision = null
  discoveryMode = 'idle'
  chosenAddress = undefined
  matchChecked = false
})

/** Preserve values through the parent-owned unlink command and refresh the regular form. */
async function unlink(expectedRevision: string): Promise<void> {
  if (busy || !isEditing || isDirty) return
  busy = true
  failed = false
  try {
    await onUnlink(expectedRevision)
    await accepted.refresh()
    replacementRevision = null
    selected = null
    results = null
    localResults = null
    searchRows = []
    selectedRow = null
    creating = false
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Search source and organisation-local Locations independently, retaining settled results while loading. */
async function search(): Promise<void> {
  if (!query.trim() || busy || !isEditing) return
  const version = ++requestVersion
  discoveryMode = 'text'
  matchChecked = false
  limited = false
  searchFailed = false
  busy = true
  failed = false
  selected = null
  selectedRow = null
  creating = false
  searchRows = []
  try {
    const sourceQuery = searchFeatureLocations({
      featureId,
      q: query.trim(),
      locale: localeTag,
    })
    const localQuery = searchFeatureLocalLocations({ featureId, q: query.trim() })
    const [source, local] = await Promise.allSettled([
      sourceQuery.refresh().then(() => sourceQuery),
      localQuery.refresh().then(() => localQuery),
    ])
    if (version === requestVersion) {
      results = source.status === 'fulfilled' ? source.value.candidates : null
      localResults = local.status === 'fulfilled' ? local.value : null
      searchFailed = source.status === 'rejected' || local.status === 'rejected'
      const localRows: Result[] = (localResults ?? []).map(row => ({
        id: `local:${row.locationId}`,
        facts: row.facts,
        kind: row.kind,
        local: row,
      }))
      searchRows = localRows
      // Read latest-source display details in bounded groups; stale searches cannot replace current results.
      const sourceRows: Result[] = []
      for (let start = 0; start < (results?.length ?? 0); start += 3) {
        const group = (results ?? []).slice(start, start + 3)
        const resolved = await Promise.allSettled(
          group.map(async candidate => {
            const details = await getFeatureLocationDiscoveryDetails({
              featureId,
              ssId: candidate.placeId,
              resourceReleaseId: candidate.resourceReleaseId,
            })
            return {
              id: `source:${candidate.placeId}`,
              facts: details.facts,
              kind: 'establishment' as const,
              source: candidate,
            }
          }),
        )
        if (version !== requestVersion) return
        for (const result of resolved) {
          if (result.status === 'fulfilled') sourceRows.push(result.value)
          else searchFailed = true
        }
        searchRows = [...localRows, ...sourceRows]
      }
    }
  } catch {
    if (version === requestVersion) failed = true
  } finally {
    if (version === requestVersion) busy = false
  }
}

/** Resolve source preview details in small groups without persisting discovery results.
 * @param candidates Source identities. @param version Current request generation.
 * @returns Identity/release-checked preview rows; failures are retained as an explicit partial-search state.
 */
async function hydrate(
  candidates: LocationSearchCandidate[],
  version: number,
): Promise<Result[]> {
  const rows: Result[] = []
  for (let offset = 0; offset < candidates.length; offset += 3) {
    if (version !== requestVersion) return []
    const settled = await Promise.allSettled(
      candidates.slice(offset, offset + 3).map(async candidate => {
        const details = await getFeatureLocationDiscoveryDetails({
          featureId,
          ssId: candidate.placeId,
          resourceReleaseId: candidate.resourceReleaseId,
        })
        return {
          id: `source:${candidate.placeId}`,
          facts: details.facts,
          kind: 'establishment' as const,
          source: candidate,
        }
      }),
    )
    if (version !== requestVersion) return []
    for (const row of settled) {
      if (row.status === 'fulfilled') rows.push(row.value)
      else searchFailed = true
    }
  }
  return rows
}

/** Retrieve bounded address previews without turning them into entity identities.
 * @returns Address rows and explicit truncation; errors propagate to the combined search.
 */
async function nearbyAddresses(): Promise<LocationCandidatePage<Result>> {
  const found = await geocodeAddressCandidates(
    { lng: coordinates[0], lat: coordinates[1] },
    { maxDistance: radius, limit: 50, candidateCoordinates: true },
  )
  const unique = new Map<string, Result>()
  for (const item of found) {
    const candidate = item.addressMeta.address
    if (
      !candidate?.coordinates ||
      !candidate.source.address2dId ||
      locationDistance(coordinates, candidate.coordinates) > radius
    )
      continue
    const id = `address:${candidate.source.address2dId}`
    unique.set(id, {
      id,
      kind: 'address',
      address: candidate,
      facts: {
        names: {},
        brands: [],
        phoneNumber: [],
        location: {
          geometry: { type: 'Point', coordinates: candidate.coordinates },
          address: candidate.source,
        },
      },
    })
  }
  return { rows: [...unique.values()], partial: false, limited: found.length >= 50 }
}

/** Search source establishments and reusable local identities, preserving coverage failures.
 * @param mode Nearby discovery or pre-creation duplicate suggestions.
 * @param version Request generation fencing source hydration.
 * @returns Candidate rows, not confirmed matches.
 */
async function nearbyEstablishments(
  mode: 'nearby' | 'matches',
  version: number,
): Promise<LocationCandidatePage<Result>> {
  const nearbyQuery = searchFeatureNearbyLocations({
    featureId,
    coordinates: [coordinates[0], coordinates[1]],
    radius,
  })
  const name = featureName.trim().slice(0, 200)
  const textQuery =
    mode === 'matches' && name
      ? searchFeatureLocations({ featureId, q: name, locale: localeTag })
      : null
  const localQuery = searchFeatureNearbyLocalLocations({
    featureId,
    coordinates: [coordinates[0], coordinates[1]],
    radius,
  })
  const [near, text, local] = await Promise.allSettled([
    nearbyQuery.refresh().then(() => nearbyQuery),
    textQuery ? textQuery.refresh().then(() => textQuery) : Promise.resolve(null),
    localQuery.refresh().then(() => localQuery),
  ])
  if (version !== requestVersion) return { rows: [], partial: false, limited: false }
  let partial = [near, text, local].some(result => result.status === 'rejected')
  let truncated = false
  const candidates = new Map<string, LocationSearchCandidate>()
  if (near.status === 'fulfilled') {
    truncated = near.value.limited
    partial ||= near.value.partial
    for (const row of near.value.candidates)
      candidates.set(row.placeId, {
        ...row,
        locale: localeTag,
        nameText: null,
        brandText: null,
      })
  }
  if (text.status === 'fulfilled')
    for (const row of text.value?.candidates ?? []) candidates.set(row.placeId, row)
  const hydrated = await hydrate([...candidates.values()], version)
  if (version !== requestVersion) return { rows: [], partial: false, limited: false }
  if (local.status === 'fulfilled') truncated ||= local.value.limited
  const localRows: Result[] =
    local.status === 'fulfilled'
      ? local.value.candidates.map(row => ({
          id: `local:${row.locationId}`,
          kind: row.kind,
          facts: row.facts,
          local: row,
        }))
      : []
  const rows = [...localRows, ...hydrated].filter(row => {
    if (locationDistance(coordinates, row.facts.location.geometry.coordinates) > radius)
      return false
    // Names and addresses are evidence for suggestions, never proof of identity.
    // With no name, nearby establishments remain explicitly unverified choices.
    return (
      mode !== 'matches' ||
      !name ||
      Object.values(row.facts.names).some(
        value => textAgreement(name, value) >= 0.35,
      ) ||
      scoreDiscovery(
        chosenAddress ?? address,
        resultAddress(row.facts),
        coordinates,
        radius,
      ).addressAgreement >= 0.3
    )
  })
  return { rows, partial, limited: truncated }
}

/** Search selected supported types together; creation matching always checks establishments.
 * @param mode Discovery or pre-creation duplicate check.
 * @returns Nothing; late responses cannot replace results for a newer pin/filter.
 */
async function nearby(mode: 'nearby' | 'matches'): Promise<void> {
  if (
    busy ||
    !isEditing ||
    !radiusValid ||
    (mode === 'nearby' && !discoveryTypes.length)
  )
    return
  const version = ++requestVersion
  discoveryMode = mode
  matchChecked = false
  busy = true
  failed = false
  searchFailed = false
  limited = false
  creating = false
  selected = null
  selectedRow = null
  searchRows = []
  results = []
  if (mode === 'nearby') chosenAddress = undefined
  try {
    const found = await discoverLocations<Result>(
      mode === 'matches' ? ['establishment'] : discoveryTypes,
      {
        address: nearbyAddresses,
        establishment: () => nearbyEstablishments(mode, version),
      },
    )
    if (version !== requestVersion) return
    searchRows = found.rows
    searchFailed ||= found.partial
    limited = found.limited
    if (mode === 'matches') {
      matchChecked = true
      if (!searchRows.length && !searchFailed && !limited) creating = true
    }
  } catch {
    if (version === requestVersion) searchFailed = true
  } finally {
    if (version === requestVersion) {
      busy = false
      if (mode === 'matches') matchChecked = true
    }
  }
}


/** Start creation only after source matching, retaining the selected address proposal.
 * @returns Nothing; creation still requires an explicit sharing choice.
 */
function startCreate(): void {
  creationLookup = undefined
  void nearby('matches')
}

/** Load verified facts, keeping an unavailable source distinct from an empty search. */
async function preview(candidate: LocationSearchCandidate): Promise<void> {
  if (busy || !isEditing) return
  const version = ++requestVersion
  const input = {
    featureId,
    ssId: candidate.placeId,
    resourceReleaseId: candidate.resourceReleaseId,
  }
  busy = true
  failed = false
  selected = null
  try {
    let resolved = await getFeatureLocationCandidate(input)
    if (version !== requestVersion) return
    if (
      resolved.status === 'source-import-needed' ||
      (resolved.facts.location.address.status !== 'resolved' &&
        Boolean(
          resolved.facts.location.address.address2dId ||
            resolved.facts.location.address.address3dId ||
            resolved.facts.location.address.address3dUnitId,
        ))
    ) {
      resolved = await importFeatureLocationCandidate(input)
    }
    if (version === requestVersion) selected = resolved
  } catch {
    if (version === requestVersion) failed = true
  } finally {
    if (version === requestVersion) busy = false
  }
}

/** Prefer verified structured Address values with the shared locale fallback. */
function addressDisplay(facts: LocationFacts): string {
  const address = {
    version: 1 as const,
    source: facts.location.address,
    coordinates: facts.location.geometry.coordinates,
    matchStatus: facts.location.address.status,
    overrides: {},
  }
  return getAddressDisplay(address, getLocaleKey())
}

/** Link only a persisted clean Feature; the server preserves its existing effective values. */
async function link(): Promise<void> {
  if (busy || !isEditing || isDirty || selected?.status !== 'ready') return
  busy = true
  failed = false
  try {
    const input = {
      featureId,
      locationId: selected.locationId,
      revisionId: selected.revisionId,
      expectedFeatureModifiedAt: modifiedAt,
    }
    if (replacementRevision) {
      await relinkFeatureLocation({ ...input, expectedRevision: replacementRevision })
    } else {
      await linkFeatureLocation(input)
    }
    await accepted.refresh()
    await onSourceUpdate()
    if (chosenAddress) {
      onAddressSelected({
        ...chosenAddress,
        coordinates: [coordinates[0], coordinates[1]],
        source: {
          ...chosenAddress.source,
          authored: prepareLocalLocationAddress(address, chosenAddress),
        },
      })
      chosenAddress = undefined
      addressStaged = true
    }
    discoveryMode = 'idle'
    replacementRevision = null
    selected = null
    results = null
    localResults = null
    searchRows = []
    selectedRow = null
    creating = false
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

{#snippet locationWidget()}
  <div class="flex min-w-0 flex-1 items-center gap-2" data-location-widget>
    {#await accepted}
      <span class="text-sm text-muted-foreground">{m.feature_location_loading()}</span>
    {:then association}
      {#if creating}
        <LocationIcon class="size-6 shrink-0 text-primary" aria-hidden="true" />
        <span class="text-sm font-semibold">{m.feature_location_create()}</span>
      {:else if isEditing && (!association || replacementRevision)}
        {#if replacementRevision}
          <Button
            text={m.feature_location_change_cancel()}
            size="sm"
            style="ghost"
            onClick={() => {
              replacementRevision = null
              searchRows = []
              selected = null
              creating = false
            }}
          />
        {/if}
      {:else}
        <span class="relative shrink-0 text-primary" aria-hidden="true"
          ><LocationIcon class="size-6" />
          {#if !association}
            <span
              class="absolute left-0 top-1/2 h-0.5 w-7 -rotate-45 bg-current"
            ></span>
          {/if}</span
        >
        <div class="min-w-0 flex-1">
          {#if association}
            <a
              href={`/admin/locations/${encodeURIComponent(association.locationId)}`}
              class="block truncate text-sm font-semibold text-primary"
              >{association.effective.names[localeTag] ||
                Object.values(association.effective.names).find(Boolean)}</a
            >
          {:else}
            <span class="text-sm font-medium"
              >{m.feature_location_no_association()}</span
            >
          {/if}
        </div>
        {#if isEditing && association}
          <Button
            text={m.feature_location_change()}
            size="sm"
            style="ghost"
            onClick={() => {
              replacementRevision = association.revision
              selected = null
            }}
            disabled={busy || isDirty}
          />
        {/if}
      {/if}
    {:catch}
      <span role="alert" class="text-sm text-error">{m.feature_location_failed()}</span>
    {/await}
  </div>
{/snippet}
{#snippet locationActions()}
  {#if isEditing && (!accepted.current || replacementRevision)}
    <div class="flex items-center gap-2" data-location-discovery-actions>
      <Button
        text={m.location_find_nearby()}
        iconComponent={SearchIcon}
        hideLabelBelow={1000}
        attrs={{ 'data-tooltip': m.location_find_nearby() }}
        size="sm"
        style="outline"
        class="min-h-11 shrink-0 rounded-lg border-border bg-panel px-3 text-sm font-normal text-foreground"
        disabled={busy || !radiusValid || !discoveryTypes.length}
        onClick={() => nearby('nearby')}
      />
      <LocationTypeFilter
        value={discoveryTypes}
        disabled={busy}
        onChange={value => {
          cancelDiscovery()
          discoveryTypes = value
        }}
      />
      <Button
        text={m.feature_location_find()}
        iconComponent={SearchIcon}
        hideLabelBelow={1000}
        attrs={{ 'data-tooltip': m.feature_location_find() }}
        size="sm"
        style="outline"
        class="min-h-11 shrink-0 rounded-lg border-border bg-panel px-3 text-sm font-normal text-foreground"
        disabled={busy}
        onClick={() => {
          discoveryMode = 'text'
          creating = false
          searchRows = []
          results = null
          selected = null
          limited = false
          searchFailed = false
        }}
      />
      {#await creationAccess then access}
        {#if access.allowed}
          <Button
            text={m.feature_location_create()}
            iconComponent={CreateLocationIcon}
            hideLabelBelow={1000}
            attrs={{ 'data-tooltip': m.feature_location_create() }}
            size="sm"
            style="outline"
            class="min-h-11 shrink-0 rounded-lg border-border bg-panel px-3 text-sm font-normal text-foreground"
            disabled={busy || !radiusValid}
            onClick={startCreate}
          />
        {/if}
      {/await}
    </div>
  {/if}
{/snippet}
{#snippet locationMapControls()}
  {#if isEditing && (!accepted.current || replacementRevision)}
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
        oninput={() => {
          radiusEdited = true
        }}
        disabled={busy}
        aria-label={m.feature_location_radius()}
        class="h-4 w-full cursor-pointer accent-primary"
      >
    </label>
  {/if}
{/snippet}
{#snippet locationNotices()}
  {#if isEditing && (!accepted.current || replacementRevision)}
    {#if !radiusValid}
      <p role="alert" class="text-sm text-error">
        {m.feature_location_radius_help()}
      </p>
    {/if}
    {#if searchFailed}
      <p role="alert" class="text-sm text-muted-foreground">
        {m.feature_location_search_partial()}
      </p>
    {/if}
    {#if limited}
      <p role="status" class="text-sm text-muted-foreground">
        {m.feature_location_discovery_limited()}
      </p>
    {/if}
  {/if}
{/snippet}
{#snippet locationContent()}
  {#if isEditing ||
    creating ||
    results !== null ||
    selected ||
    busy ||
    failed ||
    searchFailed ||
    accepted.current}
    <section class="border-b border-border/60" aria-label={m.feature_location_title()}>
      <div class="space-y-4 px-6 py-5">
        {@render locationNotices()}
        {#if addressStaged}
          <p role="status" class="text-sm text-muted-foreground">
            {m.feature_location_address_staged()}
          </p>
        {/if}
        {#await accepted}
          <p class="text-sm text-muted-foreground" role="status">
            {m.feature_location_loading()}
          </p>
        {:then association}
          {#if association}
            <LocationLifecycleFields
              value={association.effective}
              successorLocationId={association.effective.successorLocationId}
              kind={association.kind}
            />
            {#if isEditing}
              <FormDisclosureGroup
                title={m.feature_location_settings()}
                collapsed={settingsCollapsed}
                onCollapsedChange={value => {
                  settingsCollapsed = value
                }}
              >
                <Button
                  type="button"
                  text={m.feature_location_unlink()}
                  disabled={busy || isDirty}
                  onClick={() => void unlink(association.revision)}
                />
                <LocationResetFields
                  revision={association.revision}
                  {reset}
                  onChange={onResetFields}
                />
                <LocationBrandEditor
                  {association}
                  edit={brandEdit}
                  {isEditing}
                  onChange={onBrandEdit}
                />
              </FormDisclosureGroup>
            {:else if association.effective.brands?.length}
              <p class="text-sm text-muted-foreground">
                {association.effective.brands
                  .map(brand => Object.values(brand.names).find(Boolean))
                  .join(' · ')}
              </p>
            {/if}
          {/if}
          {#if isEditing && (!association || replacementRevision)}
            {#if discoveryMode === 'text' && !creating}
              <div class="flex items-center gap-2">
                <input
                  aria-label={m.feature_location_look_for()}
                  placeholder={m.feature_location_look_for()}
                  bind:value={query}
                  disabled={busy}
                  class="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 text-sm"
                  onkeydown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void search()
                    }
                  }}
                >
                <Button
                  text={m.feature_location_search()}
                  iconComponent={SearchIcon}
                  size="sm"
                  disabled={busy || !query.trim()}
                  onClick={search}
                />
              </div>
            {/if}
            {#if chosenAddress && !creating}
              <p class="text-sm text-muted-foreground">
                {m.feature_location_selected_address()}:
                {getAddressDisplay(chosenAddress, getLocaleKey())}
              </p>
              <Button
                text={m.location_use_address()}
                size="sm"
                style="outline"
                disabled={busy}
                onClick={useAddress}
              />
            {/if}
            {#if discoveryMode === 'matches' && !creating}
              <p class="text-sm text-muted-foreground">
                {m.feature_location_match_help()}
              </p>
              {#if matchChecked && !busy}
                {#await creationAccess then access}
                  {#if access.allowed}
                    <Button
                      text={searchFailed || limited
                        ? m.feature_location_create_unverified()
                        : m.feature_location_create_unmatched()}
                      style="outline"
                      size="sm"
                      labelClasses="max-w-none!"
                      onClick={() => {
                        creating = true
                        selected = null
                      }}
                    />
                  {/if}
                {/await}
              {/if}
            {/if}
            {#if busy}
              <div class="flex items-center gap-3">
                <p role="status" class="text-sm text-muted-foreground">
                  {m.feature_location_loading()}
                </p>
                <Button
                  text={m.feature_location_change_cancel()}
                  size="sm"
                  style="ghost"
                  onClick={cancelDiscovery}
                />
              </div>
            {/if}
            {#if searchRows.length && !creating}
              <ol class="grid gap-2" aria-label={m.feature_location_search()}>
                {#each displayedRows as row, index (row.id)}
                  <li animate:flip={{ duration: 180 }}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selectedRow === row.id}
                      class="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-primary/5 {selectedRow ===
                      row.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border'}"
                      onmouseenter={() => (hoveredRow = row.id)}
                      onmouseleave={() => (hoveredRow = null)}
                      onfocus={() => (focusedRow = row.id)}
                      onblur={() => (focusedRow = null)}
                      onclick={() => selectRow(row.id)}
                    >
                      <span
                        class="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold {row.kind ===
                        'address'
                          ? 'bg-amber-500 text-black dark:bg-amber-400'
                          : 'bg-primary text-primary-content'}"
                        >{index + 1}</span
                      >
                      <span class="min-w-0 flex-1">
                        <span
                          class="mb-1 flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          {#if row.kind === 'address'}
                            <AddressIcon class="size-3.5" aria-hidden="true" />
                          {:else}
                            <LocationIcon class="size-3.5" aria-hidden="true" />
                          {/if}
                          {row.kind === 'address'
                            ? m.location_type_address()
                            : row.kind === 'establishment'
                              ? m.location_type_establishment()
                              : m.location_type_unknown()}
                        </span><span class="block font-medium"
                          >{row.address
                            ? getAddressDisplay(row.address, getLocaleKey())
                            : locationName(row.facts, localeTag)}</span
                        ><span class="mt-1 block text-sm text-muted-foreground"
                          >{(row.address
                            ? m.feature_location_address_result()
                            : addressDisplay(row.facts)) ||
                            m.feature_location_address_missing()}</span
                        >
                        {#if row.evidence.addressAgreement >= 0.2}
                          <span class="mt-1 block text-xs text-primary"
                            >{m.feature_location_address_agrees()}</span
                          >
                        {/if}
                      </span>
                      <span
                        class="shrink-0 text-sm tabular-nums text-muted-foreground"
                        data-tooltip={m.feature_location_distance_direct()}
                        >{Math.round(
                          locationDistance(
                            coordinates,
                            row.facts.location.geometry.coordinates,
                          ),
                        ).toLocaleString()}
                        m</span
                      >
                    </button>
                  </li>
                {/each}
              </ol>
            {:else if !busy && results && !searchFailed && !creating}
              <p class="text-sm text-muted-foreground">
                {m.feature_location_no_results()}
              </p>
            {/if}
            {#if selected?.status === 'source-import-needed'}
              <p role="status" class="text-sm text-muted-foreground">
                {m.feature_location_import_needed()}
              </p>
            {:else if selected?.status === 'ready'}
              <div class="space-y-3 rounded-xl border border-border bg-panel p-4">
                <p class="font-medium">
                  {Object.values(selected.facts.names).join(' · ')}
                </p>
                <p class="text-sm">
                  {addressDisplay(selected.facts)}
                </p>
                <p class="text-sm text-muted-foreground">
                  {selected.facts.location.geometry.coordinates.join(', ')}
                </p>
                <p class="text-sm text-muted-foreground">
                  {m.feature_location_preserve()}
                </p>
                {#if isDirty}
                  <p class="text-sm text-muted-foreground">
                    {m.feature_location_save_first()}
                  </p>
                {/if}
                <Button
                  type="button"
                  text={replacementRevision
                    ? m.feature_location_change_confirm()
                    : m.feature_location_link()}
                  onClick={link}
                  disabled={busy || isDirty}
                />
              </div>
            {/if}
            {#if isDirty && selected?.status !== 'ready'}
              <p class="text-sm text-muted-foreground">
                {m.feature_location_save_first()}
              </p>
            {/if}
            {#if creating}
              <CreateLocalLocation
                open={true}
                hideTrigger={true}
                initialAddress={address}
                selectedAddress={chosenAddress}
                lookupRequest={creationLookup}
                initialName={featureName}
                onCancel={() => {
                  creating = false
                }}
                {projectId}
                {coordinates}
                disabled={busy}
                onCreated={value => {
                  creating = false
                  searchRows = []
                  selected = { status: 'ready', ...value }
                  results = null
                  localResults = null
                }}
              />
            {/if}
          {/if}
        {:catch}
          <p role="alert" class="text-sm text-destructive">
            {m.feature_location_failed()}
          </p>
        {/await}
        {#if accepted.current && !creating && results === null}
          <FormDisclosureGroup
            title={m.location_review_title()}
            collapsed={tasksCollapsed}
            onCollapsedChange={value => {
              tasksCollapsed = value
            }}
          >
            {#if !tasksCollapsed}
              {#if isEditing && accepted.current}
                {#key featureId + ':' + accepted.current.locationId}
                  <LocationIdentityReviewSection
                    {featureId}
                    locationId={accepted.current.locationId}
                    {isDirty}
                    onCommitted={onSourceUpdate}
                  />
                {/key}
              {/if}
              <LocationReviewSection
                isLocal={isEditing && Boolean(accepted.current)}
                {featureId}
                associationRevision={accepted.current?.revision ?? ''}
                {modifiedAt}
                {isDirty}
                onCommitted={onSourceUpdate}
              />
            {/if}
          </FormDisclosureGroup>
        {/if}
        {#if failed}
          <p role="alert" class="text-sm text-destructive">
            {m.feature_location_failed()}
          </p>
        {/if}
      </div>
    </section>
  {/if}
{/snippet}
{@render children(
  isEditing && !creating && (!accepted.current || replacementRevision)
    ? undefined
    : locationWidget,
  locationContent,
  creating ||
    discoveryMode !== 'idle' ||
    searchRows.length > 0 ||
    results !== null ||
    busy,
  creating,
  creating ? lookupCreation : undefined,
  locationActions,
  locationMapControls,
)}
