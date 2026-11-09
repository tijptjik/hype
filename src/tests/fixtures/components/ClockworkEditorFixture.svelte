<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { AccessibilityDraft } from '#lib/locations/accessibility.js'
const responsive = setResponsiveCtx()
onMount(() => responsive.setWindowDimensions(window.innerWidth, window.innerHeight))
let isEditing = $state(true)
const initialAddress = emptyFeatureAddress()
initialAddress.overrides = {
  en: {
    buildingName: 'Por Mee Factory Building',
    streetName: 'Castle Peak Road',
    buildingNumberExpression: '500',
    blockRef: 'A',
    blockType: 'block',
  },
  'zh-hant': {
    buildingName: '百美工業大廈',
    streetName: '青山道',
    blockRef: 'A',
    blockType: 'building',
  },
  'zh-hans': {
    buildingName: '百美工业大厦',
    streetName: '青山道',
    blockRef: 'A',
    blockType: 'building',
  },
}
initialAddress.association = {
  originKind: 'building',
  kind: 'building',
  mode: 'linked',
  lookup: 'matched',
  names: { en: 'Por Mee Factory Building' },
}
let address = $state(initialAddress)
let mobility = $state<AccessibilityDraft | undefined>()
</script>
<main class="bg-background text-foreground">
  <button type="button" onclick={() => (isEditing = !isEditing)}>Toggle editor</button>
  <button
    type="button"
    onclick={() => {
      for (const row of Object.values(address.overrides)) delete row.buildingName
    }}
  >
    Remove building name
  </button>
  <VisualSection
    expandedHeight={320}
    minimumHeight={320}
    showImage={false}
    showControls={false}
  >
    {#snippet map()}
      <div class="bg-muted h-full" data-editor-map>Map</div>
    {/snippet}
  </VisualSection>
  <FormFeatureAddress
    {address}
    {isEditing}
    isLoading={false}
    translations={true}
    coordinates={[114.152, 22.34]}
    locationKind="building"
    showMap={false}
    showLookup={false}
    showDivisions={false}
    accessibilityDraft={mobility}
    onAccessibilityDraftChange={value => (mobility = value)}
    onChange={value => (address = value)}
    onSelectCandidate={value => (address = value)}
    onCoordinateChange={() => {}}
    onLookup={() => {}}
  />
</main>
