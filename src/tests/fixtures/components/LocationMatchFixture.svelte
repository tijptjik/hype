<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Section from '#lib/bits/patterns/forms/featureLocation/FeatureLocationSection.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
setResponsiveCtx().setWindowDimensions(window.innerWidth, window.innerHeight)
const address = emptyFeatureAddress()
address.source.fallbackDisplay = {
  en: 'C12, 4/F, Por Mee Factory Building, 500 Castle Peak Rd, Cheung Sha Wan',
}
</script>
<div class="bg-background text-foreground mx-auto max-w-4xl p-6">
  <Section
    {address}
    featureName="Clockwork Cat"
    featureId="5jvsbc3U9K5L"
    projectId="fixture"
    coordinates={[114.152, 22.34]}
    modifiedAt=""
    isEditing={true}
    isDirty={false}
    onMapCandidates={() => {}}
    onAddressSelected={() => {}}
    onSourceUpdate={async () => {}}
  >
    {#snippet children(
      control,
      results,
      hideDetails,
      accepted,
      lookup,
      actions,
      mapControls,
    )}
      <FormFeatureAddress
        {address}
        coordinates={[114.152, 22.34]}
        isEditing={true}
        isLoading={false}
        locationControl={control}
        locationContent={results}
        locationActions={actions}
        locationMapControls={mapControls}
        {hideDetails}
        displayAddressInToolbar={!hideDetails && Boolean(control)}
        showMap={false}
        showDivisions={false}
        showLookup={false}
        onChange={() => {}}
        onSelectCandidate={() => {}}
        onCoordinateChange={() => {}}
        onLookup={() => {}}
      />
    {/snippet}
  </Section>
</div>
