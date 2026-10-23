<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
let { initialAddress }: { initialAddress: FeatureAddress } = $props()
setResponsiveCtx()
// The fixture owns one draft, just like either address form.
// svelte-ignore state_referenced_locally
let address = $state(initialAddress)
</script>
<AddressDetails {address} isEditing={true} onChange={next => (address = next)} />
