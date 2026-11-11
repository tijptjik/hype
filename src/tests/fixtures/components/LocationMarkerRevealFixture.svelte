<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import Search from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
// LIBRARY
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'

setResponsiveCtx()
let search: Search
let selectMarker = $state<(id: string) => void>(() => {})
onMount(() => {
  search.restoreProgress({
    query: 'Arome',
    findMode: 'search',
    filters: { operatingStatus: 'open' },
    radius: 300,
    nearbyMode: false,
    includeShops: true,
    includeAddresses: false,
    includeBuildings: false,
    selected: null,
    accepted: false,
    linked: false,
    expandedGroup: null,
    receivedRows: Array.from({ length: 25 }, (_, index) => ({
      id: `place-${index + 1}`,
      kind: 'establishment',
      names: { en: `Arome branch ${index + 1}` },
      address: { ...emptyFeatureAddress(), coordinates: [114.15, 22.3] },
    })),
    previousRows: [],
    previousQuery: '',
    previousScrollTop: 0,
    searched: true,
  })
})
</script>

<main class="bg-panel flex h-dvh flex-col">
  <nav
    class="flex h-48 shrink-0 flex-wrap content-center gap-2"
    aria-label="Marker callbacks"
  >
    {#each [1, 3, 17, 25] as number}
      <button type="button" onclick={() => selectMarker(`place-${number}`)}>
        Marker {number}
      </button>
    {/each}
  </nav>
  <Search
    bind:this={search}
    active={false}
    focusRequest={0}
    onSelect={() => {
      throw new Error('Marker must not accept a location')
    }}
    onMapCandidates={(_, select) => (selectMarker = select)}
  />
</main>
