<script lang="ts">
// COMPONENTS
import AddressDetails from '#lib/bits/patterns/forms/formFeatureAddress/AddressDetails.svelte'
// DOMAIN
import {
  emptyFeatureAddress,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// TYPES
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'
setResponsiveCtx()
let address = $state<FeatureAddress>({
  ...emptyFeatureAddress(),
  overrides: { en: { buildingNumberExpression: '12', accessHint: 'Side entrance' } },
})
let accessibility = $state<AccessibilityDraft | undefined>({})
</script>
<div class="bits-theme bg-panel text-foreground min-h-screen p-6">
  <main class="mx-auto max-w-3xl">
    <AddressDetails
      {address}
      isEditing={true}
      translations={true}
      hideDisplayAddress={true}
      accessibilityDraft={accessibility}
      onAccessibilityDraftChange={value => (accessibility = value)}
      onChange={value => (address = value)}
    />
  </main>
</div>
