<script lang="ts">
import Picker from '#lib/bits/patterns/forms/featureLocation/LocationAssociationPicker.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { DraftLocationSearchResult } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
let accepted = $state<DraftLocationSearchResult | null>(null)
const origin: DraftLocationSearchResult = {
  id: 'host',
  kind: 'establishment',
  names: { en: 'Neighbourhood shop' },
  identity: { locationId: 'host', revisionId: 'host-r1' },
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: {
      en: { streetName: 'Hollywood Road', buildingNumberExpression: '123' },
    },
  },
}
</script>
<main class="bg-panel mx-auto flex min-h-dvh max-w-5xl flex-col p-4">
  <Picker
    {origin}
    allowedLocationKinds={['service_point']}
    createNew={true}
    search={async () => ({ candidates: [], incomplete: false })}
    onAccept={value => (accepted = value)}
    onCancel={() => {}}
  />
  <output class="sr-only" data-accepted
    >{accepted ? JSON.stringify(accepted) : ''}</output
  >
</main>
