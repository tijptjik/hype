<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
import Picker from '#lib/bits/patterns/forms/featureLocation/LocationAssociationPicker.svelte'
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
let markers = $state<LocationSearchMarker[]>([])
let selectMarker: ((id: string) => void) | undefined
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
let accepted = $state<DraftLocationSearchResult | null>(null)
const origin: DraftLocationSearchResult = {
  id: 'reference-address',
  kind: 'address',
  names: {},
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: {
      en: { streetName: 'Des Voeux Road West', buildingNumberExpression: '64' },
    },
  },
}
</script>

<main class="bg-panel mx-auto flex h-dvh min-h-0 max-w-5xl flex-col overflow-hidden">
  <aside aria-label="Map marker fixture" class="flex shrink-0 gap-2">
    {#each markers as marker (marker.id)}
      <button
        type="button"
        aria-pressed={marker.selected}
        onclick={() => selectMarker?.(marker.id)}
      >
        {marker.label}
      </button>
    {/each}
  </aside>
  <Picker
    {origin}
    projectId="test-project"
    allowedLocationKinds={['building_part']}
    showKindFields={false}
    createNew={true}
    search={async () => ({ candidates: [], incomplete: false })}
    onAccept={value => (accepted = value)}
    onCancel={() => {}}
    onMapCandidates={(rows, select) => {
      markers = rows
      selectMarker = select
    }}
  />
  <output class="sr-only" data-accepted
    >{accepted ? JSON.stringify(accepted) : ''}</output
  >
</main>
