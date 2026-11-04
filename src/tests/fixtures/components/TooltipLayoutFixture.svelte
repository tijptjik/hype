<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
// STYLES
import { formSurfaceStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// TYPES
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

setResponsiveCtx()
let address = $state<FeatureAddress>({
  ...emptyFeatureAddress({ en: '238 Hollywood Road' }),
  overrides: { en: { buildingNumberExpression: '238', accessHint: '' } },
})
let accessibility = $state<AccessibilityDraft>({})
let visibility = $state<'shared' | 'exclusive'>('shared')
</script>

{#snippet locationControl()}
  <div class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
    <span class="font-semibold">Hollywood Road</span>
    <LocationVisibilitySelect
      value={visibility}
      onChange={value => (visibility = value)}
    />
  </div>
{/snippet}

<div class="bits-theme bg-canvas text-foreground h-screen p-3">
  <div class="bits-admin-shell__main h-full" data-layout-container>
    <form
      class="h-full overflow-auto"
      data-layout-form
      onsubmit={event => event.preventDefault()}
    >
      <main data-form-surface class={formSurfaceStyles}>
        <FormFeatureAddress
          {address}
          {locationControl}
          coordinates={[114.148, 22.284]}
          displayAddressInToolbar={true}
          isEditing={true}
          isLoading={false}
          showMap={false}
          showCoordinates={false}
          showDivisions={false}
          showLookup={false}
          accessibilityDraft={accessibility}
          onAccessibilityDraftChange={value => (accessibility = value ?? {})}
          onChange={value => (address = value)}
          onCoordinateChange={() => {}}
          onSelectCandidate={() => {}}
          onLookup={() => {}}
        />
      </main>
      <button type="button" class="m-6 rounded border p-2">Outside help</button>
    </form>
  </div>
</div>
