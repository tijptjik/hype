<script lang="ts">
// COMPONENTS
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import AddressDisplayField from '#lib/bits/patterns/forms/formFeatureAddress/AddressDisplayField.svelte'
import LocationNameFields from '#lib/bits/patterns/forms/localLocationAddress/LocationNameFields.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
let address = $state(emptyFeatureAddress())
let names = $state<Record<string, string>>({ en: '' })
let kind = $state<string>()
let accepted = $state(false)
let pending = $state(false)
let markers = $state<
  import('#lib/locations/searchPresentation.js').LocationSearchMarker[]
>([])
</script>
<main class="mx-auto max-w-6xl space-y-6 p-6" data-markers={JSON.stringify(markers)}>
  <button type="button" disabled={pending}>Save fixture</button>
  <DraftSearch
    onResolutionPendingChange={value => (pending = value)}
    onMapCandidates={value => (markers = value)}
    active={true}
    focusRequest={1}
    locationName={names.en}
    onAcceptedChange={value => (accepted = value)}
    onSelect={result => {
      address = result.address
      kind = result.localKind
      names = result.localKind === 'building' ? result.names : { en: '' }
    }}
  >
    {#snippet children(control, results, mapControls)}
      <div class="border-border flex flex-wrap items-center gap-4 border-b pb-4">
        {@render control()}
      </div>
      {@render results()}
      <div class="relative min-h-14">{@render mapControls()}</div>
    {/snippet}
  </DraftSearch>
  {#if accepted}
    {#if kind && kind !== 'address'}
      <LocationNameFields {names} onChange={value => (names = value)} />
    {/if}
    <div data-supporting-address class="border-border bg-panel rounded-xl border p-4">
      <AddressDisplayField
        {address}
        locationKind={kind}
        locale="en"
        isEditing={true}
        onChange={value => (address = value)}
      />
    </div>
  {/if}
</main>
