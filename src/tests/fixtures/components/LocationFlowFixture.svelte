<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import Maplet from '#lib/bits/patterns/maps/Maplet.svelte'
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { localAddressDraft } from '#lib/addresses/locationDraft.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import { resolveMapAddressChange } from '#lib/locations/resolveMapAddressChange.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { MapController } from '#lib/map/controller.js'
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'

let search: DraftSearch
let address = $state<FeatureAddress>(emptyFeatureAddress())
let before: FeatureAddress | null = null
let markers = $state<LocationSearchMarker[]>([])
let accepted = $state(false),
  moving = $state(false)
let camera = $state<ReturnType<MapController['getCamera']>>(null)
let map: MapController | null = null
let selectMarker: (id: string) => void = () => {}
const origin: [number, number] = [114.152, 22.2835]
const destination: [number, number] = [114.153, 22.283]
const rows: DraftLocationSearchResult[] = Array.from({ length: 20 }, (_, index) => {
  const content = createLocalLocationAddress()
  content.i18n.en = {
    formattedAddress: '',
    buildingNumberExpression: String(63 + index),
    streetName: 'Hollywood Road',
  }
  const address = localAddressDraft(content)
  address.coordinates =
    index === 16 ? origin : [114.151 + index * 0.00005, 22.284 + index * 0.00002]
  return { id: `address:fixture-${index + 1}`, kind: 'address', names: {}, address }
})
onMount(() => {
  search.restoreProgress({
    query: 'Hollywood Road',
    findMode: 'search',
    filters: {},
    radius: 300,
    nearbyMode: false,
    includeShops: false,
    includeBuildings: false,
    includeAddresses: true,
    selected: null,
    accepted: false,
    linked: false,
    expandedGroup: null,
    receivedRows: rows,
    previousRows: [],
    previousQuery: '',
    previousScrollTop: 0,
    searched: true,
    addressPaging: {
      query: 'Hollywood Road',
      total: 20,
      nextCursor: null,
      releaseSet: 'fixture',
    },
  })
  const timer = setInterval(() => {
    camera = map?.getCamera() ?? null
  }, 100)
  return () => clearInterval(timer)
})

/** Stage the same marker/address boundary used after a route-owned drag.
 * @returns Nothing; the fixture retains the pre-move value for cancellation.
 */
function move(): void {
  before = structuredClone($state.snapshot(address))
  address = { ...address, coordinates: destination, matchStatus: 'stale' }
  search.syncSelectedAddress(address)
  moving = true
}
/** Restore the numbered marker through the shared discovery synchronization API.
 * @returns Nothing; the source search rows remain unchanged.
 */
function cancel(): void {
  if (before) {
    address = before
    search.syncSelectedAddress(address)
  }
  moving = false
}
/** Accept a corrected custom address even when optional providers are unavailable.
 * @returns Completion after discovery and the map receive the same address.
 */
async function accept(): Promise<void> {
  const change = await resolveMapAddressChange(
    {
      address: $state.snapshot(address),
      pin: destination,
      projectId: '',
      visibility: 'shared',
      conflicts: [{ field: 'number', selected: '79', mapped: '77-81' }],
    },
    () => moving,
  )
  if (!change) return
  address = change.address
  search.adoptAddressChange(address)
  moving = false
}
</script>

{#snippet notice()}
  <MapAddressConflict
    conflicts={[{ field: 'number', selected: '79', mapped: '77-81' }]}
    onAccept={() => void accept()}
    onCancel={cancel}
    onReview={() => {}}
  />
{/snippet}
<div
  class="bits-theme bg-panel text-foreground mx-auto max-w-5xl"
  data-location-flow
  data-address={JSON.stringify(address)}
  data-markers={JSON.stringify(markers)}
  data-camera={JSON.stringify(camera)}
>
  <DraftSearch
    bind:this={search}
    active={true}
    focusRequest={0}
    currentAddress={address}
    onSelect={result => {
      address = result.address
      accepted = true
    }}
    onPreview={result => {
      if (result.address.coordinates)
        map?.flyTo({ center: result.address.coordinates, zoom: 17, duration: 0 })
    }}
    onMapCandidates={(value, select) => {
      markers = value
      selectMarker = select
    }}
  >
    {#snippet children(control, results)}
      <div class="relative h-[300px]" data-map-region>
        <Maplet
          coordinates={address.coordinates ?? origin}
          addressMeta={null}
          locationCandidates={markers}
          showMarker={accepted}
          draggable={true}
          pinControls={moving ? notice : undefined}
          draggingLocked={moving}
          onLocationCandidateSelect={id => selectMarker(id)}
          onMapReady={value => (map = value)}
          initialCenter={origin}
          initialZoom={16}
        />
      </div>
      <div class="p-3">{@render control()}</div>
      <div class="border-border flex h-[380px] min-h-0 flex-col border-y p-3">
        {@render results()}
      </div>
    {/snippet}
  </DraftSearch>
  <div class="flex gap-3 p-3">
    <button
      type="button"
      class="rounded border px-3 py-2"
      disabled={!accepted || moving}
      onclick={move}
    >
      Move selected pin
    </button>
  </div>
</div>
