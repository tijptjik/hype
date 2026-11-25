<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// COMPONENTS
import DraftFeatureLocationSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import MapPrimitive from '#lib/bits/patterns/forms/formMapSection/components/MapPrimitive.svelte'
// API
import { attachPhysicalBuildingMember } from '#lib/api/buildingEvidence.remote.js'
import {
  createLocalLocation,
  importDraftLocationCandidate,
} from '#lib/api/location.remote.js'
import { searchDraftAssociationLocations } from '#lib/api/locationAssociation.remote.js'
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
import { geocodeBuilding } from '#lib/api/external/buildingGeocoding.js'
// DOMAIN
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
import { containsBuildingPoint } from '#lib/map/buildingAddress.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { suggestAddressBuildings } from '#lib/locations/buildingSuggestions.js'
import { LocalLocationFootprintSchema } from '#lib/locations/footprint.js'
// TYPES
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
import type { MapController } from '#lib/map/controller.js'
import type {
  IncludedBuildingPoint,
  SelectedBuilding,
} from '#lib/map/buildingAddress.js'

let {
  projectId,
  included = [],
  mode,
  kind,
  disabled,
  onSelect,
  physicalTarget,
  creationRequests,
  constituentOnly,
  savingSelection = $bindable(false),
  onPhysicalTarget,
  onMembersChanged,
}: {
  projectId: string
  included?: Array<{
    id: string
    name: string
    names: Record<string, string>
    kind: string
    members?: { coordinates: [number, number] }[]
    coordinates: [number, number] | null
    footprint: import('geojson').Polygon | import('geojson').MultiPolygon | null
  }>
  creationRequests: Map<string, string>
  constituentOnly: boolean
  savingSelection?: boolean
  physicalTarget: {
    id: string
    address: string
    names: Record<string, string>
    members: { source: { id: string } }[]
  } | null
  onPhysicalTarget: (id: string | null) => void
  onMembersChanged: () => Promise<void>
  mode: 'search' | 'map'
  kind: 'premises' | 'building' | 'building_part'
  disabled: boolean
  onSelect: (id: string) => Promise<void>
} = $props()
const choosingConstituent = $derived(constituentOnly || Boolean(physicalTarget))
let picked = $state<Result | null>(null)
let footprint = $state<SelectedBuilding | null>(null)
let candidates = $state<Result[]>([])
const visibleCandidates = $derived(
  candidates.filter(
    candidate =>
      !candidate.buildingSource ||
      !candidates.some(
        local => local.catalogueBuildingId === candidate.buildingSource?.id,
      ),
  ),
)
// Center once when the picker opens; later selections should not move the map.
const initialCenter: [number, number] = untrack(() => {
  const points = included.flatMap(item => (item.coordinates ? [item.coordinates] : []))
  return points.length
    ? [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ]
    : [114.1694, 22.3193]
})
let coordinates = $state<[number, number]>(initialCenter)
let busy = $state(false)
let failure = $state('')
let name = $state('')
let pickerKey = $state(0)
let controller = $state<MapController | null>(null)
let cleanup: (() => void) | undefined
let version = 0
const control = 'border-border rounded-lg border px-3 py-2 text-sm disabled:opacity-50'

/** Create or extend a HYPE physical building from one explicit published building choice.
 * @param result Selected catalogue result or its existing HYPE import. @returns Once the sidebar is current.
 */
async function attachMember(result: Result): Promise<void> {
  const sourceId = result.buildingSource?.id || result.catalogueBuildingId
  const source =
    result.buildingSource ??
    (result.identity && { importedLocationId: result.identity.locationId })
  if (busy || disabled || !sourceId || !source) return
  busy = true
  failure = ''
  savingSelection = true
  const parent = physicalTarget
  try {
    const requestId = creationRequests.get(sourceId) ?? crypto.randomUUID()
    if (!parent) creationRequests.set(sourceId, requestId)
    const { locationId } = await attachPhysicalBuildingMember({
      projectId,
      source,
      target: parent ? { parentId: parent.id } : { requestId },
    })
    if (!parent) {
      await onSelect(locationId)
      creationRequests.delete(sourceId)
      onPhysicalTarget(locationId)
    } else await onMembersChanged()
    picked = null
    footprint = null
    candidates = []
    pickerKey++
  } catch (error) {
    failure = submissionErrorMessage(error) ?? 'Could not save the physical building.'
  } finally {
    savingSelection = false
    busy = false
  }
}
/** Resolve a clicked footprint using existing building and address discovery.
 * @param point Explicit clicked point. @returns Once the review choices are ready.
 * @remarks Nearby addresses are accepted only inside the selected footprint; ambiguous buildings stay explicit choices.
 */
async function pickFootprint(point: [number, number]): Promise<void> {
  if (busy || disabled) return
  const request = ++version
  busy = true
  failure = ''
  picked = null
  candidates = []
  footprint = null
  let stage = 'read the selected map footprint'
  try {
    const building = await controller?.getBuildingAt?.(point)
    if (!building) throw new Error('Select a building footprint. Zoom in if needed.')
    coordinates = point
    // Reuse Feature geocoding: tile address tags first, then footprint-constrained SaanSeoi lookup.
    stage = 'look up the building address in SaanSeoi'
    const geocoded = await geocodeBuilding({ lng: point[0], lat: point[1] }, building)
    if (request !== version) return
    const address = geocoded?.addressMeta.address ?? emptyFeatureAddress()
    address.coordinates = point
    const names = Object.fromEntries(
      [
        [
          'en',
          building.properties.name_en ??
            building.properties['name:en'] ??
            building.properties.name,
        ],
        ['zh-Hant', building.properties.name_zh ?? building.properties['name:zh-Hant']],
        ['zh-Hans', building.properties['name:zh-Hans']],
      ].flatMap(([locale, value]) =>
        typeof value === 'string' && value.trim() ? [[String(locale), value]] : [],
      ),
    )
    // The catalogue supplies pinned building identities, never an identity inferred from distance alone.
    stage = 'load matching HYPE and SaanSeoi buildings'
    const [suggestions, local] = await Promise.all([
      suggestAddressBuildings(
        address,
        'en',
        () => request === version,
        building.geometry,
      ),
      searchDraftAssociationLocations({
        projectId,
        kind: 'building',
        coordinates: point,
      }),
    ])
    if (request !== version) return
    if (local.limited)
      throw new Error(
        'Local building lookup is incomplete. Refine the selection before creating a building.',
      )
    candidates = [
      ...local.rows
        .filter(row =>
          containsBuildingPoint(
            row.facts.location.geometry.coordinates,
            building.geometry,
          ),
        )
        .map(row => ({
          id: `location:${row.locationId}`,
          kind: 'building' as const,
          names: row.facts.names,
          catalogueBuildingId: row.catalogueBuildingId,
          linkedAddresses: row.linkedAddresses,
          identity: { locationId: row.locationId, revisionId: row.revisionId },
          address: {
            version: 1 as const,
            source: row.facts.location.address,
            coordinates: row.facts.location.geometry.coordinates,
            matchStatus: row.facts.location.address.status,
            overrides: {},
          },
        })),
      ...suggestions.rows,
    ]
    footprint = building
    name = names.en ?? Object.values(names)[0] ?? ''
    picked = {
      id: `map:${building.source}:${building.id}`,
      kind: 'building',
      names,
      address,
    }
  } catch (error) {
    failure = `Could not ${stage}: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    if (request === version) busy = false
  }
}
/** Subscribe only while this map picker is mounted. @param map Active controller. @returns Nothing. */
function mapReady(map: MapController | null): void {
  cleanup?.()
  controller = map
  cleanup = map?.onPointSelect?.(point => {
    void pickFootprint(point)
  })
}
/** Import or create the reviewed identity, then add it to the session.
 * @param result Explicitly reviewed search or map choice. @returns Once selection persists.
 */
async function accept(result: Result): Promise<void> {
  if (busy || disabled) return
  savingSelection = true
  busy = true
  failure = ''
  try {
    let id = result.identity?.locationId
    if (!id && result.buildingSource)
      id = (
        await importBuildingLocation({
          projectId,
          source: result.buildingSource,
          visibility: 'shared',
        })
      ).locationId
    if (!id && result.source)
      id = (await importDraftLocationCandidate({ projectId, ...result.source }))
        .locationId
    if (!id) {
      const names = footprint ? { ...result.names, en: name.trim() } : result.names
      const input = localIdentityFromAddress(result.kind, names, result.address)
      if (footprint)
        input.facts.footprint = LocalLocationFootprintSchema.parse({
          mode: 'inline',
          geometry: footprint.geometry,
        })
      id = (await createLocalLocation({ projectId, ...input })).locationId
    }
    // Keep imported or created identities on retry after a session revision conflict.
    result.identity ??= { locationId: id, revisionId: '' }
    await onSelect(id)
    picked = null
    footprint = null
    candidates = []
    pickerKey++
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    savingSelection = false
    busy = false
  }
}

// Prefer persisted geometry. Buildings without outlines also use their points to highlight visible tiles.
$effect(() => {
  const features: import('geojson').FeatureCollection = {
    type: 'FeatureCollection',
    features: included.flatMap(item =>
      item.footprint
        ? [
            {
              type: 'Feature' as const,
              id: item.id,
              properties: { name: item.name },
              geometry: item.footprint,
            },
          ]
        : [],
    ),
  }
  const buildingPoints = included.flatMap<IncludedBuildingPoint>(item => {
    if (item.footprint || item.kind !== 'building') return []
    if (item.members?.length)
      return item.members.map(({ coordinates }) => ({ coordinates }))
    return item.coordinates
      ? [{ coordinates: item.coordinates, names: Object.values(item.names) }]
      : []
  })
  return controller?.showLocationOutlines?.(features, buildingPoints)
})
const includedMarkers = $derived(
  included.flatMap((item, index) =>
    item.coordinates
      ? [
          {
            id: item.id,
            number: index + 1,
            coordinates: item.coordinates,
            label: item.name,
            previewOnly: true,
            compact: true,
            skipAutoFit: true,
          },
        ]
      : [],
  ),
)

onDestroy(() => {
  version++
  cleanup?.()
})
</script>
{#snippet memberActions(result: Result)}
  {@const linked = physicalTarget?.members.some(
    row => row.source.id === (result.buildingSource?.id || result.catalogueBuildingId),
  )}
  <div class="flex flex-wrap gap-2">
    {#if !choosingConstituent}
      <button
        type="button"
        class={control}
        disabled={busy || disabled}
        onclick={() => accept(result)}
      >
        Use Building
      </button>
    {/if}
    <button
      type="button"
      class={control}
      disabled={busy || disabled || linked}
      onclick={() => attachMember(result)}
    >
      {physicalTarget
        ? linked
          ? 'Already added'
          : 'Add to Physical Building'
        : 'Create Physical Building'}
    </button>
  </div>
{/snippet}
<div class="space-y-4">
  {#if physicalTarget}
    <section
      aria-label="Editing physical building"
      class="border-border space-y-2 rounded-lg border p-4"
    >
      <h3 class="font-semibold">
        {physicalTarget.names.en ||
          Object.values(physicalTarget.names).find(Boolean) ||
          physicalTarget.address ||
          'Physical building'}
      </h3>
      <p class="text-muted-foreground text-sm">
        Select a SaanSeoi building to add to this physical building.
      </p>
      <button
        type="button"
        class={control}
        disabled={busy || disabled}
        onclick={() => onPhysicalTarget(null)}
      >
        Done adding buildings
      </button>
    </section>
  {/if}
  {#if failure}
    <p role="alert" class="text-error text-sm">{failure}</p>
  {/if}
  {#if mode === 'search'}
    {#key `${kind}-${pickerKey}`}
      <DraftFeatureLocationSearch
        active={true}
        selectExistingImmediately
        preferExistingBuildings
        buildingActions={kind === 'building' ? memberActions : undefined}
        onlySourceBuildings={choosingConstituent}
        suggestionKinds={choosingConstituent ? ['building'] : undefined}
        {projectId}
        preferredKind={kind}
        initialSearchKinds={choosingConstituent
          ? ['building']
          : ['building', 'address']}
        allowedLocationKinds={[kind]}
        onPreview={result => {
          if (result.address.coordinates) coordinates = result.address.coordinates
        }}
        focusRequest={0}
        allowManualEntry={false}
        onSelect={result => {
          if (busy || disabled) return
          footprint = null
          if (choosingConstituent) void attachMember(result)
          else if (result.identity?.locationId) void accept(result)
          else picked = result
        }}
      />
    {/key}
  {:else}
    <p class="text-muted-foreground text-sm">
      {#if choosingConstituent}
        Select a footprint, then choose the matching constituent building.
      {:else}
        Select a building footprint to review its SaanSeoi matches or create a HYPE
        building.
      {/if}
      Teal shading shows included buildings. Numbered markers show their saved
      locations.
    </p>
    <div class="relative h-[28rem] overflow-hidden rounded-lg border">
      <MapPrimitive
        {coordinates}
        {initialCenter}
        showMarker={false}
        locationCandidates={includedMarkers}
        initialZoom={17}
        addressMeta={null}
        onMapReady={mapReady}
      />
    </div>
    {#if busy}
      <div
        aria-label="Looking up building"
        role="status"
        class="bg-muted h-20 animate-pulse rounded-lg"
      ></div>
    {/if}
    {#if choosingConstituent &&
      footprint &&
      !visibleCandidates.some(
        candidate => candidate.buildingSource || candidate.catalogueBuildingId,
      )}
      <p class="text-muted-foreground text-sm">
        No constituent building found for this footprint. Search by name or address.
      </p>
    {/if}
    {#each visibleCandidates as candidate (candidate.id)}
      {#if kind === 'building' &&
        (candidate.buildingSource || candidate.catalogueBuildingId)}
        <div
          class="border-border flex items-center justify-between gap-3 border-b py-2"
        >
          <p class="min-w-0 break-words">
            {candidate.names.en || Object.values(candidate.names)[0]}
            {getAddressDisplay(candidate.address, 'en') ||
              candidate.buildingSource?.id ||
              candidate.catalogueBuildingId}
          </p>
          {@render memberActions(candidate)}
        </div>
      {:else if !choosingConstituent}
        <button
          type="button"
          class={`${control} w-full text-left`}
          disabled={busy || disabled}
          onclick={() => accept(candidate)}
        >
          Use
          {candidate.identity ? 'HYPE' : 'SaanSeoi'} building:
          {candidate.names.en ?? Object.values(candidate.names)[0]} ·
          {getAddressDisplay(candidate.address, 'en')}
        </button>
      {/if}
    {/each}
  {/if}
  {#if picked && !choosingConstituent}
    <div class="border-border space-y-3 rounded-lg border p-4">
      {#if footprint}
        <label class="grid gap-1 text-sm"
          >Building name (optional)<input class={control} bind:value={name}></label
        >
        <p class="text-muted-foreground text-sm">
          {getAddressDisplay(picked.address, 'en') ||
            'No unambiguous address found. The building will retain its selected footprint and map position.'}
        </p>
      {:else}
        <p>
          {picked.names.en ??
            Object.values(picked.names)[0] ??
            getAddressDisplay(picked.address, 'en')}
        </p>
      {/if}
      <button
        type="button"
        class={control}
        disabled={busy || disabled || Boolean(footprint && candidates.length)}
        onclick={() => picked && accept(picked)}
      >
        {footprint ? 'Create HYPE building and add' : 'Add to session'}
      </button>
      {#if footprint && candidates.length}
        <p class="text-muted-foreground text-sm">Choose a matching building above.</p>
      {/if}
    </div>
  {/if}
</div>
