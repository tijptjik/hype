<script lang="ts">
// SVELTE
import { onDestroy, untrack, tick, type Snippet } from 'svelte'
import { flip } from 'svelte/animate'
// ICONS
import ReplaceIcon from 'virtual:icons/lucide/replace'
import BackIcon from 'virtual:icons/lucide/arrow-left'
import PencilIcon from 'virtual:icons/lucide/pencil'
import SearchIcon from 'virtual:icons/proicons/search'
// LOCATION
import DraftFeatureLocationSearch from './DraftFeatureLocationSearch.svelte'
import { hasStructuredAddressComponents } from '#lib/addresses/presentation.js'
import { locationMatchSeeds } from '#lib/locations/matchSeed.js'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import { locationSyncMode } from '#lib/locations/associationSync.js'
import LocationAssociationIcon from '#lib/bits/custom/locationAssociationIcon/LocationAssociationIcon.svelte'
import LocationAssociationHeading from './LocationAssociationHeading.svelte'
import LocationAssociationPicker from './LocationAssociationPicker.svelte'
import { searchAssociationCandidates } from '#lib/locations/associationSearch.js'
import type { DraftLocationSearchResult } from './draftLocationSearch.types.js'
import {
  locationDiscoveryTypes,
  type LocationDiscoveryType,
  type LocationKind,
} from '#lib/locations/kinds.js'
import {
  discoverLocationKind,
  type LocationCandidatePage,
} from '#lib/locations/combinedDiscovery.js'
import LocationKindField from '../localLocationAddress/LocationKindField.svelte'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
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
  getFeatureLocationCandidate,
  importFeatureLocationCandidate,
  linkFeatureLocation,
  relinkFeatureLocation,
  searchFeatureLocations,
  searchFeatureLocalLocations,
} from '#lib/api/location.remote.js'
// COMPONENTS
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import LocationOffIcon from 'virtual:icons/lucide/map-pin-off'
import { addressBuildingNames } from '#lib/locations/addressIdentity.js'
import CreateLocalLocation from './CreateLocalLocation.svelte'
// BITS COMPONENTS
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
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
  children: renderEditor,
  onMapCandidates,
  featureId,
  projectId,
  organisationId,
  coordinates,
  modifiedAt,
  isEditing,
  isDirty,
  onSourceUpdate,
  onStartEditing,
  onCancelEditing,
  onAddressSelected,
  onAssociationSelected,
  onAssociationPending,
  onAssociationSpaceNeeded,
  onReturnToResults,
  onSelectionStart,
  buildingAssociationRequest,
  onBuildingAssociationRequestConsumed,
  pendingLocation,
  allowedLocationKinds,
  preferredKind,
}: {
  address: FeatureAddress
  allowedLocationKinds?: readonly string[]
  preferredKind?: DraftLocationSearchResult['kind']
  pendingLocation?: { names: Record<string, string>; kind: LocationKind }
  onAssociationSelected?: (
    result: DraftLocationSearchResult,
    previousLocationId?: string,
  ) => void
  onAssociationSpaceNeeded?: (overflow: number) => void
  onReturnToResults?: () => void
  onSelectionStart?: () => void
  buildingAssociationRequest?: {
    requestId: number
    source: NonNullable<DraftLocationSearchResult['buildingSource']>
    address: FeatureAddress
    names: Record<string, string>
  } | null
  onBuildingAssociationRequestConsumed?: (requestId: number) => void
  onAssociationPending?: (pending: boolean) => void
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
      boolean,
      string | undefined,
      LocationKind | undefined,
      Snippet<[boolean?]> | undefined,
      () => void,
    ]
  >
  onMapCandidates: (
    markers: LocationSearchMarker[],
    select: (id: string) => void,
  ) => void
  featureId: string
  projectId: string
  organisationId?: string
  coordinates: number[]
  modifiedAt: string
  isEditing: boolean
  isDirty: boolean
  onStartEditing?: () => void
  onCancelEditing?: () => void
  onSourceUpdate: () => Promise<void>
} = $props()
const accepted = $derived(getFeatureLocation({ featureId }))
let associationOrigin = $state<DraftLocationSearchResult | null>(null)
$effect(() => {
  onAssociationPending?.(Boolean(associationOrigin))
  if (associationOrigin) untrack(() => onSelectionStart?.())
})
let sharedRequest = $state<{
  id: number
  mode: 'search' | 'pin'
  query: string
  seeds?: import('#lib/locations/matchSeed.js').LocationMatchSeed[]
} | null>(null)
let sharedSequence = 0
let sharedAccepted = $state(false)
/** Open the same discovery and association flow used by new Features.
 * @param mode Meaningful text matching or discovery around the existing pin.
 * @param addressOnly Prefer address components for onboarding display-only records.
 * @returns Nothing; discovery never changes the Feature until a result is accepted.
 */
function startMatching(mode: 'search' | 'pin', addressOnly = false): void {
  onStartEditing?.()
  cancelDiscovery()
  associationOrigin = null
  sharedAccepted = false
  const seeds =
    mode === 'search'
      ? locationMatchSeeds(addressOnly ? '' : featureName, address, getLocaleKey())
      : []
  sharedRequest = { id: ++sharedSequence, mode, query: seeds[0]?.query ?? '', seeds }
  onSelectionStart?.()
}
let creating = $state(false)
let discoveryMode = $state<'idle' | 'text' | 'nearby' | 'matches'>('idle')
let intendedKind = $state<LocationKind>('unknown')
let discoveryUnavailable = $state<LocationDiscoveryType[]>([])
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
  if (!associationOrigin && !sharedRequest)
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
  if (
    onAssociationSelected &&
    [
      'premises',
      'building',
      'building_part',
      'infrastructure',
      'built',
      'structure',
      'landform',
      'coastal_feature',
      'water_feature',
      'service_point',
      'street',
      'natural',
      'establishment',
    ].includes(row.kind)
  ) {
    selected = null
    chosenAddress = undefined
    return
  }
  if (row.local) selected = { status: 'ready', ...row.local }
  else if (row.source) void preview(row.source)
}

/** Review a discovered identity using its preview; import/link only after Feature Save.
 * @param row Selected discovery record. @param manual Whether only its address is wanted.
 * @returns Nothing; the parent retains the reviewed association intent.
 */
function associateDiscovery(row: Result, manual = false): void {
  if (
    ![
      'address',
      'premises',
      'building',
      'building_part',
      'infrastructure',
      'built',
      'structure',
      'landform',
      'coastal_feature',
      'water_feature',
      'service_point',
      'street',
      'natural',
      'establishment',
    ].includes(row.kind)
  )
    return
  const origin: DraftLocationSearchResult = {
    id: row.id,
    kind: row.kind as DraftLocationSearchResult['kind'],
    names: row.facts.names,
    address: row.address ?? {
      version: 1,
      source: row.facts.location.address,
      coordinates: row.facts.location.geometry.coordinates,
      matchStatus: row.facts.location.address.status,
      overrides: {},
    },
    identity: row.local
      ? { locationId: row.local.locationId, revisionId: row.local.revisionId }
      : undefined,
    source: row.source
      ? { ssId: row.source.placeId, resourceReleaseId: row.source.resourceReleaseId }
      : undefined,
  }
  if (!manual) {
    associationOrigin = origin
    return
  }
  onAssociationSelected?.(
    {
      ...origin,
      kind: 'address',
      names: {},
      source: undefined,
      identity: undefined,
      localKind: 'address',
      associationConfirmed: true,
      address: {
        ...origin.address,
        association: {
          originKind: origin.kind,
          kind: 'address',
          mode: 'manual',
          lookup: 'not-checked',
          names: {},
        },
      },
    },
    accepted.current?.locationId,
  )
  cancelDiscovery()
  addressStaged = true
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
  discoveryUnavailable = []
  discoveryMode = 'idle'
}

let consumedBuildingAssociationRequest = 0
$effect(() => {
  const request = buildingAssociationRequest
  if (
    !request ||
    request.requestId === consumedBuildingAssociationRequest ||
    !isEditing
  )
    return
  consumedBuildingAssociationRequest = request.requestId
  cancelDiscovery()
  associationOrigin = {
    id: `building:${request.source.id}:${request.source.addressId ?? ''}`,
    kind: 'building',
    localKind: 'building',
    names: request.names,
    address: request.address,
    buildingSource: request.source,
  }
  onBuildingAssociationRequestConsumed?.(request.requestId)
})

// Leaving edit mode discards discovery UI, never the accepted Feature address.
$effect(() => {
  if (isEditing) return
  onAssociationPending?.(false)
  sharedRequest = null
  sharedAccepted = false
  searchFailed = failed = false
  associationOrigin = null
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
  discoveryUnavailable = []
})

/** Search only families compatible with the intended type; retain successful previews on partial failure.
 * @returns Nothing; late responses are fenced by the current discovery generation.
 */
async function search(): Promise<void> {
  if (!query.trim() || busy || !isEditing) return
  const version = ++requestVersion
  discoveryMode = 'text'
  matchChecked = false
  limited = searchFailed = failed = false
  busy = true
  selected = null
  selectedRow = null
  creating = false
  searchRows = []
  try {
    const found = await discoverLocationKind<Result>(intendedKind, {
      address: () => nearbyAddresses(query.trim()),
      establishment: async () => {
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
        if (version !== requestVersion)
          return { rows: [], partial: false, limited: false }
        results = source.status === 'fulfilled' ? source.value.candidates : null
        localResults = local.status === 'fulfilled' ? local.value : null
        const rows: Result[] = (localResults ?? [])
          .filter(row => row.kind === 'unknown' || row.kind === 'establishment')
          .map(row => ({
            id: `local:${row.locationId}`,
            facts: row.facts,
            kind: row.kind,
            local: row,
          }))
        rows.push(...(await hydrate(results ?? [], version)))
        return {
          rows,
          partial: source.status === 'rejected' || local.status === 'rejected',
          limited: false,
        }
      },
    })
    if (version !== requestVersion) return
    searchRows = found.rows
    results ??= []
    discoveryUnavailable = found.unavailable
    searchFailed ||= found.partial
    limited = found.limited
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
async function nearbyAddresses(query?: string): Promise<LocationCandidatePage<Result>> {
  const found = await geocodeAddressCandidates(
    query ? { address: query } : { lng: coordinates[0], lat: coordinates[1] },
    { maxDistance: radius, limit: 50, candidateCoordinates: true },
  )
  const unique = new Map<string, Result>()
  for (const item of found) {
    const candidate = item.addressMeta.address
    if (
      !candidate?.coordinates ||
      !candidate.source.address2dId ||
      (!query && locationDistance(coordinates, candidate.coordinates) > radius)
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
    !locationDiscoveryTypes(intendedKind).length
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
    const found = await discoverLocationKind<Result>(intendedKind, {
      address: nearbyAddresses,
      establishment: () => nearbyEstablishments(mode, version),
    })
    if (version !== requestVersion) return
    searchRows = found.rows
    discoveryUnavailable = found.unavailable
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
    {#if associationOrigin}
      <button
        type="button"
        aria-label={m.association_back_editor()}
        class="text-primary hover:bg-primary/10 focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded focus-visible:outline-2"
        onclick={() => {
          associationOrigin = null
          void tick().then(() => onReturnToResults?.())
        }}
      >
        <BackIcon class="size-5" />
      </button><LocationAssociationHeading />
    {:else if pendingLocation}
      <!-- The saved association remains authoritative until Save; present the reviewed draft meanwhile. -->
      <LocationIcon kind={pendingLocation.kind} class="text-primary size-6 shrink-0" />
      <span
        data-pending-location
        class="text-primary min-w-0 flex-1 text-base font-medium break-words whitespace-normal"
        >{pendingLocation.names[localeTag] ||
          Object.values(pendingLocation.names).find(Boolean)}</span
      >
    {:else}
      {#await accepted}
        <span
          aria-hidden="true"
          class="bg-foreground/10 size-6 shrink-0 rounded"
        ></span><LoadingSkeleton
          label={m.feature_location_loading()}
          class="min-w-0 flex-1 text-base font-medium"
        />
      {:then association}
        {#if creating}
          <LocationIcon class="text-primary size-6 shrink-0" aria-hidden="true" />
          <span class="text-sm font-semibold">{m.feature_location_create()}</span>
        {:else if isEditing && replacementRevision}
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
          <span class="text-primary shrink-0" aria-hidden="true">
            {#if association}
              <SimpleTooltip>
                {#snippet trigger()}
                  <LocationIcon kind={association.kind} class="size-6" />
                {/snippet}
                {locationKindLabel(association.kind ?? 'unknown')}
              </SimpleTooltip>
            {:else}
              <LocationOffIcon class="size-6" />
            {/if}
          </span>
          <div class="min-w-0 flex-1">
            {#if association}
              <a
                href={`/admin/locations/${encodeURIComponent(association.locationId)}`}
                class="text-primary block min-w-0 text-base font-medium break-words whitespace-normal"
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
            <a
              href={`/admin/locations/${encodeURIComponent(association.locationId)}?edit=true${organisationId ? `&organisation=${encodeURIComponent(organisationId)}` : ''}`}
              aria-label={m.forms__edit()}
              data-tooltip={m.feature_address_corrections_help()}
              class="text-muted-foreground hover:text-primary focus-visible:outline-primary inline-flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2"
              ><PencilIcon class="size-4" /></a
            >
            <SimpleTooltip triggerProps={{ tabindex: -1 }}
              >{#snippet trigger()}
                <button
                  type="button"
                  aria-label={m.association_change()}
                  class="text-primary hover:bg-primary/10 focus-visible:outline-primary inline-flex size-8 shrink-0 items-center justify-center rounded focus-visible:outline-2 disabled:opacity-40"
                  disabled={busy || isDirty}
                  onclick={() => {
                    const kind =
                      association.kind === 'premises' ||
                      association.kind === 'building' ||
                      association.kind === 'building_part' ||
                      association.kind === 'infrastructure' ||
                      association.kind === 'street' ||
                      association.kind === 'natural' ||
                      association.kind === 'establishment'
                        ? association.kind
                        : 'address'
                    associationOrigin = {
                      id: `location:${association.locationId}`,
                      kind,
                      names: Object.fromEntries(
                        Object.entries(association.effective.names).filter(
                          (entry): entry is [string, string] =>
                            typeof entry[1] === 'string',
                        ),
                      ),
                      address,
                      identity: {
                        locationId: association.locationId,
                        revisionId: association.factsRevisionId,
                      },
                    }
                  }}
                >
                  <ReplaceIcon class="size-4" />
                </button>
              {/snippet}
              {m.association_change()}</SimpleTooltip
            >
          {/if}
        {/if}
      {:catch}
        <span role="alert" class="text-error text-sm"
          >{m.feature_location_failed()}</span
        >
      {/await}
    {/if}
  </div>
{/snippet}
{#snippet savedSyncControl(_disabled?: boolean)}
  {#if accepted.current && !associationOrigin && !pendingLocation}
    {@const mode = locationSyncMode(
      address.association?.mode ??
        (accepted.current.kind === 'address' ? 'manual' : undefined),
      { identity: { ssId: accepted.current.ssId ?? undefined } },
    )}
    <a
      href={`/admin/features/${encodeURIComponent(featureId)}#updates`}
      class="text-primary hover:bg-primary/10 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm"
      aria-label={m.feature_updates_connection()}
    >
      <LocationAssociationIcon {mode} />
      <span
        >{mode === 'manual'
          ? m.location_sync_unsynced()
          : mode === 'linked'
            ? m.association_linked()
            : m.association_unlinked()}</span
      >
    </a>
  {/if}
{/snippet}
{#snippet emptyMapControls()}
  <!-- Idle discovery has no map controls. -->
{/snippet}
{#snippet locationActions()}
  {#if isEditing && !sharedRequest && (!accepted.current || replacementRevision)}
    <div
      class="flex flex-wrap items-center justify-center gap-2"
      data-location-discovery-actions
    >
      <Button
        text={m.location_find_nearby()}
        iconComponent={SearchIcon}
        size="sm"
        style="outline"
        class="border-border bg-panel text-foreground min-h-11 shrink-0 rounded-lg px-3 text-sm"
        disabled={coordinates.length < 2 ||
          !coordinates.slice(0, 2).every(Number.isFinite)}
        onClick={() => startMatching('pin')}
      />
      <Button
        text={hasStructuredAddressComponents(address)
          ? m.location_match()
          : m.address_match_location()}
        color="primary"
        iconComponent={SearchIcon}
        size="sm"
        class="min-h-11 shrink-0 rounded-lg px-3 text-sm"
        onClick={() =>
          startMatching('search', !hasStructuredAddressComponents(address))}
      />
    </div>
  {/if}
{/snippet}
{#snippet locationMapControls()}
  {#if isEditing && (!accepted.current || replacementRevision)}
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
        oninput={() => {
          radiusEdited = true
        }}
        disabled={busy}
        aria-label={m.feature_location_radius()}
        class="accent-primary h-4 w-full cursor-pointer"
      >
    </label>
  {/if}
{/snippet}
{#snippet locationNotices()}
  {#if isEditing && (!accepted.current || replacementRevision)}
    {#if !radiusValid}
      <p role="alert" class="text-error text-sm">
        {m.feature_location_radius_help()}
      </p>
    {/if}
    {#if searchFailed}
      <p role="alert" class="text-muted-foreground text-sm">
        {m.feature_location_search_partial()}
      </p>
    {/if}
    {#if limited}
      <p role="status" class="text-muted-foreground text-sm">
        {m.feature_location_discovery_limited()}
      </p>
    {/if}
  {/if}
{/snippet}
{#snippet locationContent()}
  {#if associationOrigin}
    {#key associationOrigin}
      <LocationAssociationPicker
        {allowedLocationKinds}
        showHeading={false}
        {onMapCandidates}
        onSpaceNeeded={onAssociationSpaceNeeded}
        origin={associationOrigin}
        {projectId}
        search={searchAssociationCandidates}
        onAccept={result => {
          onAssociationSelected?.(result, accepted.current?.locationId)
          associationOrigin = null
          cancelDiscovery()
          addressStaged = true
        }}
        onCancel={() => {
          associationOrigin = null
          void tick().then(() => onReturnToResults?.())
        }}
      />
    {/key}
  {/if}
  {#if !associationOrigin &&
    (discoveryMode !== 'idle' ||
      creating ||
      results !== null ||
      selected ||
      busy ||
      failed ||
      searchFailed ||
      addressStaged ||
      replacementRevision)}
    <section class="border-border/60 border-b" aria-label={m.feature_location_title()}>
      <div class="space-y-4 px-6 py-5">
        {@render locationNotices()}
        {#if addressStaged}
          <p role="status" class="text-muted-foreground text-sm">
            {m.feature_location_address_staged()}
          </p>
        {/if}
        {#await accepted}
          <ContentSkeleton label={m.feature_location_loading()}
            ><div class="max-w-72">
              <LocationKindField value={intendedKind} disabled onChange={() => {}} />
            </div></ContentSkeleton
          >
        {:then association}
          {#if isEditing && (!association || replacementRevision)}
            <div class="max-w-72">
              <LocationKindField
                value={intendedKind}
                disabled={busy}
                onChange={kind => {
                  cancelDiscovery()
                  intendedKind = kind
                }}
              />
            </div>
            {#if discoveryUnavailable.length}
              <p role="status" class="text-muted-foreground text-sm">
                {m.location_search_incomplete()}:
                {discoveryUnavailable.map(type => locationKindLabel(type)).join(', ')}.
              </p>
            {/if}
            {#if discoveryMode === 'text' && !creating}
              <div class="flex items-center gap-2">
                <input
                  aria-label={m.feature_location_look_for()}
                  placeholder={m.feature_location_look_for()}
                  bind:value={query}
                  disabled={busy}
                  class="border-border bg-panel min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
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
              <p class="text-muted-foreground text-sm">
                {m.feature_location_selected_address()}:
                {getAddressDisplay(chosenAddress, getLocaleKey())}
              </p>
              <Button
                text={m.association_locate()}
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (chosenAddress)
                    associationOrigin = {
                      id: 'selected-address',
                      kind: 'address',
                      names: {},
                      address: chosenAddress,
                    }
                }}
              />
              <Button
                text={m.feature_search_use_address()}
                labelClasses="dark:text-white"
                size="sm"
                style="outline"
                disabled={busy}
                onClick={() => {
                  if (chosenAddress) {
                    onAssociationSelected?.(
                      {
                        id: 'selected-address',
                        kind: 'address',
                        localKind: 'address',
                        names: {},
                        associationConfirmed: true,
                        address: {
                          ...chosenAddress,
                          association: {
                            originKind: 'address',
                            kind: 'address',
                            mode: 'manual',
                            lookup: 'not-checked',
                            names: {},
                          },
                        },
                      },
                      accepted.current?.locationId,
                    )
                    cancelDiscovery()
                  }
                }}
              />
            {/if}
            {#if discoveryMode === 'matches' && !creating}
              <p class="text-muted-foreground text-sm">
                {m.feature_location_match_help()}
              </p>
            {/if}
            {#if busy}
              <div class="flex items-center gap-3">
                <LoadingSkeleton
                  label={m.feature_location_loading()}
                  text={m.feature_location_change_cancel()}
                  class="text-sm"
                />
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
                          class="text-muted-foreground mb-1 flex items-center gap-1 text-xs"
                        >
                          <SimpleTooltip>
                            {#snippet trigger()}
                              <LocationIcon kind={row.kind} class="size-3.5" />
                            {/snippet}
                            {locationKindLabel(row.kind)}
                          </SimpleTooltip>
                          {locationKindLabel(row.kind)}
                        </span><span class="block font-medium"
                          >{row.address
                            ? getAddressDisplay(row.address, getLocaleKey())
                            : locationName(row.facts, localeTag)}</span
                        ><span class="text-muted-foreground mt-1 block text-sm"
                          >{(row.address
                            ? m.feature_location_address_result()
                            : addressDisplay(row.facts)) ||
                            m.feature_location_address_missing()}</span
                        >
                        {#if row.evidence.addressAgreement >= 0.2}
                          <span class="text-primary mt-1 block text-xs"
                            >{m.feature_location_address_agrees()}</span
                          >
                        {/if}
                      </span>
                      <span
                        class="text-muted-foreground shrink-0 text-sm tabular-nums"
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
                    {#if onAssociationSelected &&
                      selectedRow === row.id &&
                      [
                        'premises',
                        'building',
                        'building_part',
                        'infrastructure',
                        'built',
                        'structure',
                        'landform',
                        'coastal_feature',
                        'water_feature',
                        'service_point',
                        'street',
                        'natural',
                        'establishment',
                      ].includes(row.kind)}
                      <div class="flex flex-wrap gap-2 px-4 pt-2 pb-3">
                        <Button
                          text={m.association_locate()}
                          size="sm"
                          onClick={() => associateDiscovery(row)}
                        />
                        <Button
                          text={m.feature_search_use_address()}
                          labelClasses="dark:text-white"
                          size="sm"
                          style="outline"
                          onClick={() => associateDiscovery(row, true)}
                        />
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>
            {:else if !busy && results && !searchFailed && !creating}
              <p class="text-muted-foreground text-sm">
                {m.feature_location_no_results()}
              </p>
            {/if}
            {#if selected?.status === 'source-import-needed'}
              <p role="status" class="text-muted-foreground text-sm">
                {m.feature_location_import_needed()}
              </p>
            {:else if selected?.status === 'ready'}
              <div class="border-border bg-panel space-y-3 rounded-xl border p-4">
                <p class="font-medium">
                  {Object.values(selected.facts.names).join(' · ')}
                </p>
                <p class="text-sm">
                  {addressDisplay(selected.facts)}
                </p>
                <p class="text-muted-foreground text-sm">
                  {selected.facts.location.geometry.coordinates.join(', ')}
                </p>
                <p class="text-muted-foreground text-sm">
                  {m.feature_location_preserve()}
                </p>
                {#if isDirty}
                  <p class="text-muted-foreground text-sm">
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
              <p class="text-muted-foreground text-sm">
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
                initialName={intendedKind === 'address' && chosenAddress
                  ? getAddressDisplay(chosenAddress, getLocaleKey())
                  : featureName}
                initialKind={intendedKind}
                initialNames={intendedKind === 'building' && chosenAddress
                  ? addressBuildingNames(chosenAddress)
                  : undefined}
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
          <p role="alert" class="text-destructive text-sm">
            {m.feature_location_failed()}
          </p>
        {/await}
        {#if failed}
          <p role="alert" class="text-destructive text-sm">
            {m.feature_location_failed()}
          </p>
        {/if}
      </div>
    </section>
  {/if}
{/snippet}
<DraftFeatureLocationSearch
  {allowedLocationKinds}
  {preferredKind}
  resolutionOrigin="existing-feature"
  onExitResolution={() => {
    cancelDiscovery()
    sharedRequest = null
    sharedAccepted = false
    onAssociationPending?.(false)
    onMapCandidates([], () => {})
    onCancelEditing?.()
  }}
  active={isEditing && sharedRequest !== null}
  searchRequest={sharedRequest}
  onManualEntry={() => {
    cancelDiscovery()
    sharedRequest = null
    sharedAccepted = false
    onAssociationPending?.(false)
    onMapCandidates([], () => {})
    chosenAddress = address
    intendedKind = 'address'
    creating = true
  }}
  focusRequest={0}
  {projectId}
  currentAddress={address}
  locationName={featureName}
  coordinates={[coordinates[0], coordinates[1]]}
  hasPin={true}
  onMapCandidates={(markers, select) => {
    if (sharedRequest) onMapCandidates(markers, select)
  }}
  onResolutionPendingChange={pending => {
    if (sharedRequest) onAssociationPending?.(pending)
  }}
  onAcceptedChange={value => (sharedAccepted = value)}
  {onAssociationSpaceNeeded}
  {onSelectionStart}
  {onReturnToResults}
  onSelect={result => onAssociationSelected?.(result, accepted.current?.locationId)}
>
  {#snippet children(searchControl, searchResults, mapControls, syncControl)}
    {@render renderEditor(
      sharedRequest ? searchControl : locationWidget,
      sharedRequest ? searchResults : locationContent,
      sharedRequest
        ? !sharedAccepted
        : Boolean(associationOrigin) ||
            creating ||
            discoveryMode !== 'idle' ||
            searchRows.length > 0 ||
            results !== null ||
            busy,
      sharedRequest ? sharedAccepted : creating || Boolean(accepted.current),
      creating ? lookupCreation : undefined,
      locationActions,
      sharedRequest ? mapControls : emptyMapControls,
      (pendingLocation?.kind ?? accepted.current?.kind ?? intendedKind) !== 'building',
      pendingLocation ? undefined : accepted.current?.locationId,
      pendingLocation?.kind ?? accepted.current?.kind,
      sharedRequest
        ? syncControl
        : accepted.current && !associationOrigin && !pendingLocation
          ? savedSyncControl
          : undefined,
      () => startMatching('search', true),
    )}
  {/snippet}
</DraftFeatureLocationSearch>
