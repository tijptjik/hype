<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
setResponsiveCtx().setWindowDimensions(1440, 900)
let editing = $state(false)
let address = $state({
  ...emptyFeatureAddress(),
  overrides: { en: { buildingName: 'Storybook Theater' } },
  association: {
    originKind: 'building' as const,
    kind: 'establishment' as const,
    mode: 'linked' as const,
    lookup: 'matched' as const,
    names: { en: 'Storybook Theater' },
  },
})
</script>
<main class="bits-theme bg-panel text-foreground flex h-screen flex-col">
  <button type="button" onclick={() => (editing = !editing)}>Toggle editing</button>
  <div class="flex h-80 min-h-0 flex-col" data-editor-container>
    <FormFeatureAddress
      {address}
      coordinates={[114.04, 22.31]}
      isEditing={editing}
      isLoading={false}
      fixedMap={true}
      showMap={false}
      showLookup={false}
      showCoordinates={false}
      onChange={value => (address = value as typeof address)}
      onCoordinateChange={() => {}}
      onSelectCandidate={() => {}}
      onLookup={() => {}}
    />
  </div>
</main>
