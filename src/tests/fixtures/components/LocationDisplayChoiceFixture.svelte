<script lang="ts">
// COMPONENTS
import AddressDisplayField from '#lib/bits/patterns/forms/formFeatureAddress/AddressDisplayField.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
let address = $state(emptyFeatureAddress())
</script>

<main class="bg-panel p-6">
  <AddressDisplayField
    {address}
    coordinates={[114.15, 22.28]}
    locale="en"
    isEditing
    showDisplayChoice
    onChange={next => (address = next)}
  />
</main>
