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
  establishmentIdentity = false,
}: {
  initialAddress: FeatureAddress
  onSuggestStreetNumber?: () => Promise<string | null>
  suggestionKey?: string
  establishmentIdentity?: boolean
} = $props()
setResponsiveCtx()
// The fixture owns one draft, just like either address form.
// svelte-ignore state_referenced_locally
let address = $state(initialAddress)
</script>
{#snippet identityFields()}
  <p>Arome - MTR Olympic</p>
{/snippet}
<AddressDetails
  identityFields={establishmentIdentity ? identityFields : undefined}
  locationKind={establishmentIdentity ? 'establishment' : undefined}
  {onSuggestStreetNumber}
  {suggestionKey}
  {address}
  isEditing={true}
  onChange={next => (address = next)}
/>
