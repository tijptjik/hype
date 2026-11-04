<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let {
  address,
  isEditing = true,
  onChange,
}: {
  address: FeatureAddress
  isEditing?: boolean
  onChange: (value: FeatureAddress) => void
} = $props()
setResponsiveCtx()
</script>
<AddressDetails
  {address}
  {isEditing}
  {onChange}
  translations={true}
  showAccessHints={false}
  hideDisplayAddress={true}
/>
