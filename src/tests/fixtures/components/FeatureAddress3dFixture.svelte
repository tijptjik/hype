<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
let {
  isEditing = true,
  show3dAddressOptions = true,
  initialAddress = emptyFeatureAddress({ en: '70 Sai Yeung Choi St South' }),
}: {
  isEditing?: boolean
  show3dAddressOptions?: boolean
  initialAddress?: FeatureAddress
} = $props()
setResponsiveCtx()
// The fixture seeds one editor draft; later prop changes must retain that draft.
// svelte-ignore state_referenced_locally
let address = $state(initialAddress)
</script>

<div class="@container">
  <FormFeatureAddress
    {address}
    coordinates={[114.17023, 22.31872]}
    {isEditing}
    isLoading={false}
    {show3dAddressOptions}
    onChange={value => (address = value)}
    onSelectCandidate={value => (address = value)}
    onCoordinateChange={() => {}}
    onLookup={() => {}}
  >
    {#snippet map()}
      <div>Map</div>
    {/snippet}
  </FormFeatureAddress>
</div>
