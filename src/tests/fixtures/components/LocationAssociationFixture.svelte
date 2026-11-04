<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import Maplet from '#lib/bits/patterns/maps/Maplet.svelte'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import LocationAssociationStatus from '#lib/bits/patterns/forms/featureLocation/LocationAssociationStatus.svelte'
// ADDRESS
import {
  emptyFeatureAddress,
  getAddressDisplay,
  FeatureAddressSchema,
} from '#lib/addresses/featureAddress.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
// TYPES
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
let visual: VisualSection
let search: DraftSearch
let selected = $state<Result | null>(null)
let accepted = $state(false)
let pending = $state(false)
let saved = $state('')
let markers = $state<LocationSearchMarker[]>([])
let selectMarker: (id: string) => void = () => {}
const content = createLocalLocationAddress()
content.i18n.en = {
  formattedAddress: '',
  streetName: 'Hollywood Road',
  buildingNumberExpression: '123',
  premisesName: 'Hollywood Terrace',
}
content.unit = {
  floorType: 'F',
  floorRef: '2',
  unitType: 'F',
  unitRef: 'A',
  unitPortion: null,
}
if (
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('exact')
) {
  content.i18n.en = {
    formattedAddress: '',
    streetName: 'Ferry Street',
    buildingName: 'Fu Yee Court',
    buildingNumberExpression: '11-16',
  }
  content.unit = null
}
const address = {
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3] as [number, number],
  source: {
    ...emptyFeatureAddress().source,
    status: 'resolved' as const,
    address2dId: 'hollywood-address',
    snapshotId: 'fixture-address-r1',
    rawSource: {
      data: {
        id: 'hollywood-address',
        attributes: { snapshotId: 'fixture-address-r1', i18n: content.i18n },
      },
    },
    canonical: {
      addressId: 'hollywood-address',
      revisionId: 'fixture-address-r1',
      content,
    },
  },
}
const realMap =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('map')
const grouped =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('group')
const direct =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('direct')
const origin: Result = direct
  ? {
      id: 'building:heights',
      kind: 'building',
      names: { en: 'Hollywood Heights' },
      buildingSource: { id: 'heights', release: 'fixture' },
      address: { ...address, overrides: { en: { buildingName: 'Hollywood Heights' } } },
    }
  : { id: 'address:hollywood', kind: 'address', names: {}, address }
const groupedRows: Result[] = [0, 1, 2].map(index => ({
  ...origin,
  id: `address:group-${index}`,
  address: {
    ...origin.address,
    coordinates: [114.15 + index * 0.0001, 22.3 + index * 0.0004],
    source: {
      ...origin.address.source,
      address2dId: `group-${index}`,
      canonical: {
        addressId: `group-${index}`,
        revisionId: 'fixture-r1',
        content: {
          ...content,
          i18n: {
            en: {
              ...content.i18n.en,
              buildingNumberExpression: String(121 + index * 2),
            },
          },
        },
      },
    },
  },
}))
onMount(() =>
  search.restoreProgress({
    query: 'Hollywood Terrace',
    findMode: 'search',
    filters: {},
    radius: 300,
    nearbyMode: false,
    includeShops: false,
    includeBuildings: direct,
    includeAddresses: true,
    selected: null,
    accepted: false,
    linked: false,
    expandedGroup: null,
    receivedRows: grouped ? groupedRows : [origin],
    previousRows: [],
    previousQuery: '',
    previousScrollTop: 0,
    searched: true,
  }),
)
</script>

<main
  class="bits-theme border-border bg-panel mx-auto flex h-screen max-w-3xl flex-col overflow-hidden border"
  data-association-fixture
  data-selected={JSON.stringify(selected)}
  data-markers={JSON.stringify(markers)}
>
  <VisualSection
    class="border-y-0!"
    bind:this={visual}
    expandedHeight={300}
    minimumHeight={128}
    showImage={false}
    showControls={false}
    resizeLabel="Resize map"
  >
    {#snippet map()}
      {#if realMap}
        <div class="relative h-full w-full" data-fixture-real-map>
          <Maplet
            coordinates={[113.9, 22.1]}
            addressMeta={null}
            locationCandidates={markers}
            showMarker={true}
            onLocationCandidateSelect={id => selectMarker(id)}
            initialCenter={[114.15, 22.3]}
            initialZoom={15}
          />
        </div>
      {:else}
        <div
          class="bg-primary/5 relative flex h-full w-full items-center justify-between px-5"
          data-fixture-map
        >
          <div class="flex gap-2">
            {#each markers.filter(marker => !marker.hidden) as marker (marker.id)}
              <button
                type="button"
                aria-label={`Map marker ${marker.number}: ${marker.label}`}
                data-fixture-marker={marker.id}
                data-highlighted={marker.highlighted}
                class="border-primary data-[highlighted=true]:bg-primary flex size-8 items-center justify-center rounded-full border text-xs data-[highlighted=true]:text-white"
                onclick={() => selectMarker(marker.id)}
              >
                {marker.number || '•'}
              </button>
            {/each}
          </div>
          <button
            type="button"
            disabled={!accepted || pending}
            class="bg-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            onclick={() => {
              if (selected)
                saved = JSON.stringify(FeatureAddressSchema.parse(selected.address))
            }}
          >
            Save fixture
          </button>
        </div>
      {/if}
    {/snippet}
  </VisualSection>
  <DraftSearch
    onSelectionStart={() => visual?.rememberHeight()}
    onMapCandidates={(next, select) => {
      markers = next
      selectMarker = select
    }}
    onReturnToResults={() =>
      visual?.restoreAfterFit(Math.round(window.innerHeight * 0.35))}
    onAssociationSpaceNeeded={overflow => visual?.makeRoom(overflow)}
    bind:this={search}
    active={true}
    projectId="fixture"
    focusRequest={0}
    currentAddress={selected?.address}
    onSelect={value => (selected = value)}
    onUnlink={() => {
      if (selected?.address.association)
        selected = {
          ...selected,
          address: {
            ...selected.address,
            association: {
              ...selected.address.association,
              mode: 'manual',
              lookup: 'not-checked',
              targetId: undefined,
            },
          },
        }
    }}
    onAcceptedChange={value => (accepted = value)}
    onResolutionPendingChange={value => (pending = value)}
    onBack={() => (selected = null)}
  >
    {#snippet children(control, results, mapControls)}
      <div class="border-border shrink-0 border-b p-4">{@render control()}</div>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        {@render results()}
      </div>
    {/snippet}
  </DraftSearch>
  {#if selected && accepted}
    <div class="space-y-5 p-5">
      <p>{getAddressDisplay(selected.address, 'en')}</p>
      {#if selected.address.association}
        <LocationAssociationStatus value={selected.address.association} />
      {/if}
    </div>
  {/if}
  {#if saved}
    <output class="block p-4 text-xs" data-saved
      >Address and association validated</output
    >
  {/if}
</main>
