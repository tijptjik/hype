<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
setResponsiveCtx()
let address = $state(emptyFeatureAddress())
let accepted = $state(false)
let coordinates = $state([114.120054321, 22.366923456])
let lookup = $state('')
let linked = $state(false)
</script>
<div class="@container">
  <DraftSearch
    active={true}
    focusRequest={0}
    onSelect={result => {
      address = result.address
      linked = true
    }}
    onUnlink={() => (linked = false)}
    onAcceptedChange={value => (accepted = value)}
  >
    {#snippet children(locationControl, locationContent)}
      <FormFeatureAddress
        {address}
        {coordinates}
        {locationControl}
        {locationContent}
        displayAddressInToolbar={accepted}
        showLookup={accepted}
        hideDetails={!accepted}
        showCoordinates={accepted}
        isEditing={true}
        isLoading={false}
        onChange={value => (address = value)}
        onCoordinateChange={value => (coordinates = value)}
        onLookup={query => (lookup = query ?? 'marker')}
        onSelectCandidate={value => (address = value)}
      />
    {/snippet}
  </DraftSearch>
</div>
<output data-testid="lookup">{lookup}</output>
<output data-testid="coordinates">{JSON.stringify(coordinates)}</output>

<output data-testid="address">{JSON.stringify(address)}</output>
<output data-testid="linked">{String(linked)}</output>
