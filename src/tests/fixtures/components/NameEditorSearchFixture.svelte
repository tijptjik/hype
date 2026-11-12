<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
const responsive = setResponsiveCtx()
onMount(() => {
  const update = () =>
    responsive.setWindowDimensions(window.innerWidth, window.innerHeight)
  update()
  window.addEventListener('resize', update)
  return () => window.removeEventListener('resize', update)
})
const initial = emptyFeatureAddress()
initial.source.rawSource = {
  data: {
    attributes: {
      i18n: {
        en: {
          buildingName: 'Wah Koon Building',
          streetName: 'Hollywood Road',
          buildingNumberExpression: '15',
        },
        'zh-hant': {
          buildingName: '華冠大廈',
          streetName: '荷李活道',
          buildingNumberExpression: '15',
        },
        'zh-hans': {
          buildingName: '华冠大厦',
          streetName: '荷李活道',
          buildingNumberExpression: '15',
        },
      },
    },
  },
}
let address = $state(initial)
let editing = $state(false)
</script>
<main class="bg-background text-foreground p-5">
  <button type="button" onclick={() => (editing = !editing)}>Toggle editor</button>
  <FormFeatureAddress
    {address}
    isEditing={editing}
    translations={true}
    coordinates={[114.15, 22.28]}
    showMap={false}
    showDivisions={false}
    showLookup={false}
    isLoading={false}
    onChange={next => (address = next)}
    onSelectCandidate={next => (address = next)}
    onLookup={() => {}}
    onCoordinateChange={() => {}}
  />
</main>
