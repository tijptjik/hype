<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// DOMAIN
import {
  emptyFeatureAddress,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
setResponsiveCtx()
let visual: VisualSection
let search: DraftSearch
let accepted = $state(false)
let pending = $state(false)
const initialAddress: FeatureAddress = {
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3] as [number, number],
  overrides: {
    en: {
      buildingName: 'Tai Hing Gardens Phase 2 Commercial Complex',
      streetName: 'Ho Hing Circuit',
      buildingNumberExpression: '10A',
    },
  },
}
let address = $state(initialAddress)
const record: Result = {
  id: 'building:tai-hing',
  kind: 'building',
  names: { en: 'Tai Hing Gardens Phase 2 Commercial Complex' },
  buildingSource: { id: 'tai-hing', release: 'fixture' },
  address: initialAddress,
}
onMount(() =>
  search.restoreProgress({
    query: 'Tai Hing',
    findMode: 'search',
    filters: {},
    radius: 300,
    nearbyMode: false,
    includeShops: true,
    includeBuildings: true,
    includeAddresses: true,
    selected: record,
    accepted: true,
    linked: true,
    expandedGroup: null,
    receivedRows: [record],
    previousRows: [record],
    previousQuery: 'Tai Hing',
    previousScrollTop: 0,
    searched: false,
  }),
)
</script>

<main
  class="bits-theme bg-panel text-foreground @container mx-auto flex h-screen max-w-5xl flex-col overflow-hidden"
  data-navigation-fixture
>
  <VisualSection
    bind:this={visual}
    expandedHeight={300}
    minimumHeight={128}
    showImage={false}
    showControls={false}
    resizeLabel="Resize map"
  >
    {#snippet map()}
      <div class="bg-primary/10 flex h-full w-full items-center justify-center">
        Map context
      </div>
    {/snippet}
  </VisualSection>
  <DraftSearch
    bind:this={search}
    active={true}
    focusRequest={0}
    currentAddress={address}
    onSelect={value => (address = value.address)}
    onAcceptedChange={value => (accepted = value)}
    onResolutionPendingChange={value => (pending = value)}
    onAssociationSpaceNeeded={overflow => visual?.makeRoom(overflow)}
    onReturnToResults={() => visual?.restoreAfterFit(300)}
    onSelectionStart={() => visual?.rememberHeight()}
  >
    {#snippet children(locationControl, locationContent, mapControls, syncControl)}
      {#snippet controls()}
        {@render syncControl?.()}<span data-form-header-controls>Editor controls</span>
      {/snippet}
      <FormFeatureAddress
        {address}
        coordinates={address.coordinates ?? [114.15, 22.3]}
        {locationControl}
        {locationContent}
        toolbarControls={accepted && !pending ? controls : undefined}
        displayAddressInToolbar={accepted && !pending}
        coordinatesInLocationControl={!accepted || pending}
        hideDetails={!accepted || pending}
        showCoordinates={accepted && !pending}
        locationKind="building"
        fixedMap={true}
        showMap={false}
        showDivisions={false}
        isEditing={true}
        isLoading={false}
        showLookup={false}
        onChange={value => (address = value)}
        onCoordinateChange={() => {}}
        onLookup={() => {}}
        onSelectCandidate={() => {}}
      />
    {/snippet}
  </DraftSearch>
</main>
