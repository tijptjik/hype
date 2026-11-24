<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// COMPONENTS
import DraftFeatureLocationSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import MapPrimitive from '#lib/bits/patterns/forms/formMapSection/components/MapPrimitive.svelte'
// API
import {
  createLocalLocation,
  importDraftLocationCandidate,
} from '#lib/api/location.remote.js'
import { searchDraftAssociationLocations } from '#lib/api/locationAssociation.remote.js'
import { importBuildingLocation } from '#lib/api/buildingLocation.remote.js'
import { geocodeBuilding } from '#lib/api/external/buildingGeocoding.js'
// DOMAIN
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
import type { SelectedBuilding } from '#lib/map/buildingAddress.js'

let {
  projectId,
  mode,
  kind,
  disabled,
  onSelect,
}: {
  projectId: string
  mode: 'search' | 'map'
  kind: 'premises' | 'building' | 'building_part'
  disabled: boolean
  onSelect: (id: string) => Promise<void>
} = $props()
let picked = $state<Result | null>(null)
let footprint = $state<SelectedBuilding | null>(null)
let candidates = $state<Result[]>([])
let coordinates = $state<[number, number]>([114.1694, 22.3193])
let busy = $state(false)
let failure = $state('')
let name = $state('')
let pickerKey = $state(0)
let controller: MapController | null = null
let cleanup: (() => void) | undefined
let version = 0
const control = 'border-border rounded-lg border px-3 py-2 text-sm disabled:opacity-50'

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
    busy = false
  }
}
onDestroy(() => {
  version++
  cleanup?.()
})
</script>
<div class="space-y-4">
  {#if failure}
    <p role="alert" class="text-error text-sm">{failure}</p>
  {/if}
  {#if mode === 'search'}
    {#key `${kind}-${pickerKey}`}
      <DraftFeatureLocationSearch
        active={true}
        {projectId}
        preferredKind={kind}
        initialSearchKinds={['building', 'address']}
        allowedLocationKinds={[kind]}
        onPreview={result => {
          if (result.address.coordinates) coordinates = result.address.coordinates
        }}
        focusRequest={0}
        allowManualEntry={false}
        onSelect={result => {
          picked = result
          footprint = null
        }}
      />
    {/key}
  {:else}
    <p class="text-muted-foreground text-sm">
      Select a building footprint to review its SaanSeoi matches or create a HYPE
      building.
    </p>
    <div class="relative h-[28rem] overflow-hidden rounded-lg border">
      <MapPrimitive
        {coordinates}
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
    {#each candidates as candidate (candidate.id)}
      <button
        type="button"
        class={`${control} w-full text-left`}
        disabled={busy || disabled}
        onclick={() => accept(candidate)}
      >
        Use {candidate.identity ? 'HYPE' : 'SaanSeoi'} building:
        {candidate.names.en ?? Object.values(candidate.names)[0]} ·
        {getAddressDisplay(candidate.address, 'en')}
      </button>
    {/each}
  {/if}
  {#if picked}
    <div class="border-border space-y-3 rounded-lg border p-4">
      {#if footprint}
        <label class="grid gap-1 text-sm"
          >Building name<input class={control} bind:value={name}></label
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
        disabled={busy ||
          disabled ||
          Boolean(footprint && (!name.trim() || candidates.length))}
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
