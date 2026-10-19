<script lang="ts">
// BITS
import FeatureCardBreadcrumbs from './FeatureCardBreadcrumbs.svelte'
import FeatureCardTitle from './FeatureCardTitle.svelte'
import FeatureCardContentPortal from './content/FeatureCardContentPortal.svelte'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

let {
  feature,
  portalSize,
  portalCenterY,
}: {
  feature: Feature
  portalSize: number
  portalCenterY: number
} = $props()
</script>

<div data-card-type="portal-band" class="pointer-events-none relative isolate">
  <!-- Mask only the surface: the live map remains visible and interactive through
       the portal, while the shared text and controls retain their theme colours. -->
  <div
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 -z-10 bg-(--theme-panel)"
    style={`mask-image: radial-gradient(circle at calc(100% - ${portalSize / 2 + 12}px) ${portalCenterY}px, transparent ${portalSize * 0.48}px, black ${portalSize * 0.48 + 0.5}px);`}
  ></div>
  <!-- The portal has its own circular surround above the footer, rather than
       reserving a full rectangular content block beneath the title. -->
  <div
    class="absolute right-3 rounded-full shadow-[0_0_0_10px_var(--theme-panel)]"
    style={`top: ${portalCenterY - portalSize / 2}px; width: ${portalSize}px; height: ${portalSize}px;`}
  >
    <FeatureCardContentPortal {feature} size={portalSize} roundedSurface />
  </div>
  <div class="min-w-0 py-1" style={`padding-right: ${portalSize + 24}px;`}>
    <FeatureCardBreadcrumbs {feature} />
    <FeatureCardTitle {feature} />
  </div>
</div>
