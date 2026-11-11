<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
import AddressDisplayField from '#lib/bits/patterns/forms/formFeatureAddress/AddressDisplayField.svelte'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
let displayToolbarWidth = $state(0)
let coordinates = $state([0, 0])
let displayAddress = $state({
  ...emptyFeatureAddress({ en: '123 Example Road' }),
})
import FeatureIntentChoice from '#lib/bits/patterns/forms/featureIntent/FeatureIntentChoice.svelte'
import TargetContextChoice from '#lib/bits/patterns/forms/featureIntent/TargetContextChoice.svelte'
import ModelSettingsFixture from './ModelSettingsFixture.svelte'
import FeatureNamePreview from '#lib/bits/patterns/forms/featureIntent/FeatureNamePreview.svelte'
import { TARGET_CONTEXTS, type TargetContext } from '#lib/features/locationPolicy.js'
let featureType = $state<string | null>(null)
let context = $state<TargetContext | null>(null)
let overrides = $state<Record<string, string>>({})
let paid = $state(true)
const rule = {
  base: 'location' as const,
  conditions: [
    {
      propertyId: 'paid',
      locales: {
        en: {
          true: 'Paid',
          false: '',
          null: 'Unknown',
          placement: 'suffix' as const,
          separator: ' ',
        },
        'zh-hant': {
          true: '付費區',
          false: '',
          null: '',
          placement: 'suffix' as const,
          separator: ' ',
        },
      },
    },
  ],
}
</script>
<main class="mx-auto grid max-w-5xl gap-8 p-4">
  <div
    bind:clientWidth={displayToolbarWidth}
    class="flex min-w-0 justify-center"
    data-display-toolbar
  >
    <AddressDisplayField
      {coordinates}
      address={displayAddress}
      locale="en"
      isEditing={true}
      showDisplayChoice={true}
      centered={true}
      availableWidth={displayToolbarWidth}
      alignEnd={true}
      scrollWhenConstrained={true}
      onChange={value =>
        (displayAddress = {
          ...value,
        })}
    />
  </div>
  <p data-location-display>
    {getAddressDisplay(displayAddress, 'en', [], undefined, coordinates)}
  </p>
  <button type="button" onclick={() => (coordinates = [8.524997, 47.36559])}>
    Move test marker
  </button>
  <p>Layer: Ghost signs</p>
  <FeatureIntentChoice
    layerId="fixture"
    value={featureType}
    onChange={type => (featureType = type?.id ?? null)}
  />
  <p data-feature-type>{featureType ?? 'none'}</p>
  <TargetContextChoice
    contexts={TARGET_CONTEXTS}
    value={context}
    onChange={value => (context = value)}
  />
  <p data-context>{context ?? 'none'}</p>
  <label><input type="checkbox" bind:checked={paid}>Paid area</label>
  <FeatureNamePreview
    {rule}
    names={{ en: 'Example Bakery', 'zh-hant': '麵包店' }}
    titles={{ en: { title: '' }, zhHant: { title: '' } }}
    properties={[{ propertyId: 'paid', value: String(paid) }]}
    {overrides}
    onChange={value => (overrides = value)}
  />
  <ModelSettingsFixture />
</main>
