<script lang="ts">
import { onMount } from 'svelte'
import {
  GeoLocationModal,
  LayerSelectionModal,
  NewFeatureCard,
} from '#lib/bits/index.js'
import { initAddNewFeature } from '#lib/client/services/feature.js'
import { getAppCtx } from '#lib/context/app.svelte.js'
import { getOmniCtx } from '#lib/context/omni.svelte.js'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

onMount(() => {
  void initAddNewFeature(appCtx.view, omniCtx, null, {
    navigateToRoute: false,
    getMapCenter: appCtx.getMapCenter,
  })
})
</script>

<LayerSelectionModal />
<GeoLocationModal getMapCenter={appCtx.getMapCenter} />
<NewFeatureCard />
