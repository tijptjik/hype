<script lang="ts">
// COMPONENTS
import AddressDivisions from '#lib/bits/patterns/forms/formFeatureAddress/AddressDivisions.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
let { isEditing = true }: { isEditing?: boolean } = $props()
let address = $state(emptyFeatureAddress())
let coordinates = $state([114, 22])
</script>
<AddressDivisions
  {address}
  {coordinates}
  {isEditing}
  onChange={next => {
    address = next
    coordinates = [...coordinates]
  }}
/>
<button type="button" onclick={() => (coordinates = [115, 23])}>Move marker</button>
<output data-testid="overrides">{JSON.stringify(address.divisionOverrides)}</output>
