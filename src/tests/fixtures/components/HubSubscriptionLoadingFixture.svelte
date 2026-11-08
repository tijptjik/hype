<script lang="ts">
// CONTEXT
import {
  SurfaceLayout,
  setSurfaceLayoutCtx,
} from '#lib/context/surfaceLayout.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import HubSubscriptionOverlay from '#lib/bits/patterns/bars/hubSubscriptionOverlay/HubSubscriptionOverlay.svelte'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

const responsive = setResponsiveCtx()
responsive.setWindowDimensions(window.innerWidth, window.innerHeight)
setSurfaceLayoutCtx(new SurfaceLayout(responsive)).setMainDimensions(
  window.innerWidth,
  window.innerHeight,
)
const featureImages = Array.from({ length: 20 }, (_, index) => ({
  image: { id: String(index), preview: `/__orbit-photo/${index}.svg` },
})) as ImageCtxEnvelope[]
let dismissed = $state(false)
</script>

<div class="min-h-screen overflow-hidden bg-slate-800 py-10">
  {#if dismissed}
    <p>Dismissed</p>
  {:else}
    <HubSubscriptionOverlay
      hubCode="hkghostsigns"
      description="Subscribe for HK Ghost Signs news"
      subscriptionBenefits="Deep dives, neighbourhood highlights, and special announcements"
      {featureImages}
      onDismiss={() => {
        dismissed = true
      }}
    />
  {/if}
</div>
