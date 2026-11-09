<script lang="ts">
import { onMount } from 'svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import Editor from '#lib/bits/patterns/forms/localLocationAddress/LocalLocationAddressEditor.svelte'
import type { LocationResource } from '#lib/locations/resource.js'
import type { HeaderFormActionsState } from '#lib/context/headerState.types.js'
const responsive = setResponsiveCtx()
onMount(() => responsive.setWindowDimensions(window.innerWidth, window.innerHeight))
const superAdmin = new URLSearchParams(location.search).get('superadmin') === 'true'
const facts: NonNullable<LocationResource['facts']> = {
  names: { en: 'Original name' },
  brands: [],
  phoneNumber: [],
  location: {
    geometry: { type: 'Point', coordinates: [114.17, 22.3] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: { en: '27 Kimberley Road' },
    },
  },
}
const place: LocationResource = {
  id: 'location',
  ssId: null,
  kind: 'establishment',
  state: 'unresolved',
  sourceAvailability: 'current',
  sourceReference: null,
  ownerOrganisationId: 'org',
  editingOrganisationId: 'org',
  canEditAddress: true,
  canEditShared: superAdmin,
  sharedFacts: { ...facts, names: { en: 'Hype original name' } },
  sharedRevision: null,
  revisionId: 'source',
  facts,
}
let controls = $state<Partial<HeaderFormActionsState>>({})
let editing = $state(true)
</script>
<main class="bg-background text-foreground">
  <button type="button" onclick={() => controls.submit?.()}>Save fixture</button>
  <Editor
    {place}
    queryScope="fixture"
    isEditing={editing}
    onEditingChange={value => (editing = value)}
    onControlsChange={value => (controls = value)}
    onSaved={async () => {}}
  />
</main>
