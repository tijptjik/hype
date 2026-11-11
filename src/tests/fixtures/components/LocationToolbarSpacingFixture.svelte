<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import LocationSyncSelect from '#lib/bits/patterns/forms/featureLocation/LocationSyncSelect.svelte'
import LocationControlsInfo from '#lib/bits/patterns/forms/featureLocation/LocationControlsInfo.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
setResponsiveCtx()
let editing = $state(true)
let address = $state(emptyFeatureAddress({ en: 'MTR Olympic, Olympic' }))
</script>

<button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
<FormFeatureAddress
  {address}
  coordinates={[114.16, 22.32]}
  isEditing={editing}
  isLoading={false}
  displayAddressInToolbar
  showMap={false}
  showLookup={false}
  hideDetails
  showDivisions={false}
  onChange={next => (address = next)}
  onCoordinateChange={() => {}}
  onLookup={() => {}}
  onSelectCandidate={() => {}}
>
  {#snippet locationControl()}
    <span class="text-primary font-semibold">Arome - MTR Olympic</span>
  {/snippet}
  {#snippet toolbarControls()}
    <LocationSyncSelect
      value="unlinked"
      enabledMode="unlinked"
      disabled={!editing}
      onChange={() => {}}
    />
  {/snippet}
  {#snippet toolbarInfo()}
    <LocationControlsInfo />
  {/snippet}
</FormFeatureAddress>
