<script lang="ts">
import Page from '../../../routes/admin/locations/new/+page.svelte'
import { LocationCreation } from '#lib/context/locationCreation.svelte.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
const creation = new LocationCreation()
const address = {
  ...emptyFeatureAddress(),
  coordinates: [114.14949, 22.28616] as [number, number],
  overrides: { en: { streetName: 'Bonham Strand', buildingNumber: '144' } },
}
creation.open({
  accountId: 'fixture',
  projectId: 'project',
  organisationId: 'org',
  checkpoint: { title: 'Unsaved Feature' },
  kind: 'establishment',
  visibility: 'shared',
  address,
  originalAddress: address,
  names: { en: 'Hei Lee Cake Shop' },
  originalNames: { en: 'Hei Lee Cake Shop' },
})
Object.assign(window, {
  __locationCreationAdmin: {
    locationCreation: creation,
    view: { user: { id: 'fixture' }, layout: { setMainDimensions() {} } },
  },
})
</script>
<div class="@container relative flex h-screen flex-col">
  <Page />
</div>
<output class="hidden" data-review-state>{JSON.stringify(creation.current)}</output>
