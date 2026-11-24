<script lang="ts">
import ReconciliationProgress from '#lib/bits/patterns/resource/locationReconciliation/ReconciliationProgress.svelte'
import LocationRecordDetails from '#lib/bits/patterns/forms/localLocationAddress/LocationRecordDetails.svelte'
import type { LocationResource } from '#lib/locations/resource.js'
let place = $state<LocationResource>({
  id: 'draftfixture',
  ssId: null,
  state: 'unresolved',
  ownerOrganisationId: null,
  kind: 'premises',
  sourceAvailability: 'current',
  sourceReference: null,
  revisionId: 'draftfixture_draft',
  facts: null,
})
</script>
<main class="bg-panel text-base-content mx-auto min-h-screen max-w-lg space-y-6 p-6">
  <h1>Station canonical draft</h1>
  <button
    type="button"
    class="bg-primary text-primary-content rounded-lg px-4 py-2"
    onclick={() => {
      place = { ...place, state: 'linked', ssId: 'published-source-id' }
    }}
  >
    Simulate publication
  </button>
  <ReconciliationProgress
    total={1}
    matched={place.ssId ? 1 : 0}
    drafts={place.ssId ? 0 : 1}
    skipped={0}
    unavailable={0}
    onclick={() => {}}
    onmatched={() => {}}
    onskipped={() => {}}
  />
  <LocationRecordDetails {place} />
</main>
