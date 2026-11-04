<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let {
  initialAddress,
  onSuggestStreetNumber,
  suggestionKey = '',
}: {
  initialAddress: FeatureAddress
  onSuggestStreetNumber?: () => Promise<string | null>
  suggestionKey?: string
} = $props()
setResponsiveCtx()
// The fixture owns one draft, just like either address form.
// svelte-ignore state_referenced_locally
let address = $state(initialAddress)
</script>
<AddressDetails
  {onSuggestStreetNumber}
  {suggestionKey}
  {address}
  isEditing={true}
  onChange={next => (address = next)}
/>
