<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { NearbyStreet } from '#lib/map/nearbyStreets.js'
import type { AddressName } from '#lib/addresses/nameCatalogue.js'
let {
  responsiveViewport = false,
  isEditing = true,
  translations = $bindable(false),
  coordinates = [114.17023, 22.31872],
  isLoading = false,
  candidates = [],
  onPreviewCandidate,
  streetCandidates = [],
  onSelectStreet,
  onCancelLookup,

  displayAddressInToolbar = false,
  show3dAddressOptions = true,
  showLookup = !displayAddressInToolbar,
  onLookup = () => {},
  onCoordinateChange = (_value: number[]) => {},
  initialAddress = emptyFeatureAddress({ en: '70 Sai Yeung Choi St South' }),
}: {
  responsiveViewport?: boolean
  onCoordinateChange?: (value: number[]) => void
  translations?: boolean
  onCancelLookup?: () => void
  streetCandidates?: NearbyStreet[]
  onSelectStreet?: (street: AddressName) => void
  coordinates?: number[]
  isLoading?: boolean
  candidates?: FeatureAddress[]
  onPreviewCandidate?: (candidate: FeatureAddress | null) => void
  showLookup?: boolean
  onLookup?: (query?: string) => void
  displayAddressInToolbar?: boolean
  isEditing?: boolean
  show3dAddressOptions?: boolean
  initialAddress?: FeatureAddress
} = $props()
// Control tests need room for both side panels; browser measurements take precedence.
const responsive = setResponsiveCtx()
responsive.setWindowDimensions(1440, 900)
onMount(() => {
  if (!responsiveViewport) return
  const resize = (): void =>
    responsive.setWindowDimensions(window.innerWidth, window.innerHeight)
  resize()
  window.addEventListener('resize', resize)
  return () => window.removeEventListener('resize', resize)
})
// The fixture seeds one editor draft; later prop changes must retain that draft.
// svelte-ignore state_referenced_locally
let address = $state(initialAddress)
</script>

{#snippet linkedPlace()}
  <div class="flex min-w-0 flex-wrap items-center gap-3">
    <button type="button">Back to results</button>
    <span class="min-w-40 flex-1 font-medium">Martin Express - Vận Chuyển Quốc Tế</span>
    <button type="button">Unlink</button>
  </div>
{/snippet}
<div class="@container">
  <FormFeatureAddress
    bind:translations
    {address}
    {displayAddressInToolbar}
    {showLookup}
    locationControl={displayAddressInToolbar ? linkedPlace : undefined}
    {coordinates}
    {isEditing}
    {isLoading}
    {candidates}
    {onPreviewCandidate}
    {streetCandidates}
    {onSelectStreet}
    {onCancelLookup}
    {show3dAddressOptions}
    onChange={value => (address = value)}
    onSelectCandidate={value => (address = value)}
    {onCoordinateChange}
    {onLookup}
  >
    {#snippet map()}
      <div>Map</div>
    {/snippet}
  </FormFeatureAddress>
</div>
