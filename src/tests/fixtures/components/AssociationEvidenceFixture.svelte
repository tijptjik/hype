<script lang="ts">
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import Picker from '#lib/bits/patterns/forms/featureLocation/LocationAssociationPicker.svelte'
// DOMAIN
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// TYPES
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
const long = new URLSearchParams(window.location.search).has('long')
let visual: VisualSection
const building: Result = {
  id: 'theatre-building',
  kind: 'building',
  names: {
    en: long
      ? 'Tai Hing Gardens Phase 2 Commercial Complex'
      : 'Disney’s Storybook Theater',
  },
  buildingSource: { id: 'theatre', release: 'fixture' },
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: {
      en: {
        buildingName: long
          ? 'Tai Hing Gardens Phase 2 Commercial Complex'
          : 'Disney’s Storybook Theater',
        ...(long ? { buildingNumberExpression: '10A' } : {}),
      },
    },
  },
}
const candidate: Result = {
  id: 'theatre-place',
  kind: 'establishment',
  names: {
    en: long
      ? 'Joyful World International Nursery & Kindergarten'
      : 'Storybook Theater',
  },
  source: { ssId: 'theatre-place', resourceReleaseId: 'fixture' },
  address: {
    ...emptyFeatureAddress(),
    coordinates: [114.15014, 22.3],
    ...(long ? { overrides: { en: { buildingNumberExpression: '12B' } } } : {}),
  },
}
const origin = new URLSearchParams(window.location.search).has('establishment')
  ? candidate
  : building
let accepted = $state<Result | null>(null)
</script>

<main
  data-accepted={JSON.stringify(accepted)}
  class="bits-theme bg-panel text-foreground mx-auto flex h-screen max-w-4xl flex-col"
>
  <VisualSection
    bind:this={visual}
    expandedHeight={128}
    minimumHeight={128}
    showImage={false}
    showControls={false}
    resizeLabel="Resize map"
  >
    {#snippet map()}
      <div
        class="bg-primary/10 flex h-full w-full items-center justify-center"
        data-fixture-map
      >
        Map context
      </div>
    {/snippet}
  </VisualSection>
  <Picker
    onSpaceNeeded={overflow => visual?.makeRoom(overflow)}
    {origin}
    search={async input => ({
      candidates: input.kind === 'establishment' ? [candidate] : [],
      incomplete: false,
    })}
    onAccept={value => (accepted = value)}
    onCancel={() => {}}
  />
</main>
