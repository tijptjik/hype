<script lang="ts">
// COMPONENTS
import AddressDisplayField from '#lib/bits/patterns/forms/formFeatureAddress/AddressDisplayField.svelte'
// ADDRESSES
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let address = $state<FeatureAddress>(emptyFeatureAddress({ en: 'Example Road' }))
let coordinates = $state<readonly number[]>([114.20839, 22.29241])
</script>

<main class="bits-theme bg-panel text-foreground min-h-screen space-y-4 p-4">
  <AddressDisplayField
    {address}
    {coordinates}
    locale="en"
    isEditing={true}
    showDisplayChoice={true}
    onChange={next => (address = next)}
  />
  <button type="button" onclick={() => (coordinates = [114.1589, 22.2819])}>
    Move to Central
  </button>
  <button type="button" onclick={() => (coordinates = [0, 0])}>
    Move outside coverage
  </button>
  <output aria-label="Saved display mode"
    >{address.locationDisplayMode ?? 'automatic'}</output
  >
</main>
