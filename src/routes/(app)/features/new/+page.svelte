<script lang="ts">
import { onMount } from 'svelte'
import { GeoLocationModal, LayerSelectionModal, NewFeatureCard } from '$lib/bits'
import { initAddNewFeature } from '$lib/client/services/feature'
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

onMount(() => {
  void initAddNewFeature(appCtx, omniCtx, null, {
    navigateToRoute: false,
  })
})
</script>

<LayerSelectionModal />
<GeoLocationModal />
<NewFeatureCard />
