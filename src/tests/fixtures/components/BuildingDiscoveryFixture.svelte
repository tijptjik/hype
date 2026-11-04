<script lang="ts">
// COMPONENTS
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import Maplet from '#lib/bits/patterns/maps/Maplet.svelte'
// ADDRESS
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
import type { MapController } from '#lib/map/controller.js'
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
let address = $state(emptyFeatureAddress())
let markers = $state<LocationSearchMarker[]>([])
let map: MapController | null = null
let selectMarker: (id: string) => void = () => {}
let accepted = $state<DraftLocationSearchResult | null>(null)
</script>

<main
  class="border-border bg-panel mx-auto flex max-w-6xl flex-col border"
  data-building-discovery-fixture
  data-selection={JSON.stringify(accepted)}
>
  <DraftSearch
    active={true}
    focusRequest={1}
    currentAddress={address}
    onSelect={result => {
      accepted = result
      address = result.address
    }}
    onBack={() => {
      accepted = null
      address = emptyFeatureAddress()
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
    {#snippet children(control, results, controls)}
      <div class="relative h-[420px]">
        <Maplet
          coordinates={address.coordinates ?? [114.15, 22.284]}
          showMarker={Boolean(accepted)}
          addressMeta={null}
          locationCandidates={markers}
          onLocationCandidateSelect={id => selectMarker(id)}
          onMapReady={value => (map = value)}
          initialCenter={[114.15, 22.284]}
          initialZoom={16}
        />
        <div
          class="pointer-events-none absolute inset-3 z-10 [&>*]:pointer-events-auto"
        >
          {@render controls()}
        </div>
      </div>
      <div class="p-4">{@render control()}</div>
      <div class="flex h-[480px] min-h-0 flex-col px-4 pb-4">{@render results()}</div>
    {/snippet}
  </DraftSearch>
  {#if accepted}
    <output class="p-4 text-sm">{getAddressDisplay(address, 'en')}</output>
  {/if}
</main>
