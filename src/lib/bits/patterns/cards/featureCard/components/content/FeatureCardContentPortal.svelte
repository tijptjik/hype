<script lang="ts">
// I18N
import { getI18n } from '#lib/i18n.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// CONSTANTS
import { NEW_REF } from '#lib/constants.js'
// TYPES
import type {
  Feature,
  NewFeatureWithLocationAndParents,
} from '#lib/db/zod/schema/feature.types.js'
// LOCAL
import FeatureCardContentAddress from './FeatureCardContentAddress.svelte'

let {
  feature,
  size = 200,
  roundedSurface = false,
}: {
  feature: Feature | NewFeatureWithLocationAndParents
  size?: number
  roundedSurface?: boolean
} = $props()

const appCtx = getSurfaceCtx()
const userPreferences = $derived({
  ...appCtx.getUserPreferences(),
  allowMachineTranslation: true,
})
const displayAddress = $derived(
  getI18n(feature as Feature, 'displayAddress', userPreferences, '', true).trim(),
)
const featureKey = $derived('id' in feature ? feature.id : NEW_REF)
const portalMaskId = $derived(`feature-card-portal-mask-${featureKey}`)
</script>

<div
  id="feature-card-portal"
  class="pointer-events-none relative overflow-visible"
  style={`width: ${size}px; height: ${size}px;`}
>
  <svg
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <mask id={portalMaskId}>
        <rect width="100" height="100" fill="white"></rect>
        <circle cx="50" cy="50" r="48" fill="black"></circle>
      </mask>
    </defs>

    <rect
      width="100"
      height="100"
      rx={roundedSurface ? 50 : 0}
      fill="var(--theme-panel)"
      mask={`url(#${portalMaskId})`}
    ></rect>
    <circle
      cx="50"
      cy="50"
      r="48"
      fill="none"
      stroke="var(--theme-primary)"
      stroke-width="2"
    ></circle>
  </svg>
  {#if displayAddress}
    <FeatureCardContentAddress addressText={displayAddress} {featureKey} />
  {/if}

  <div
    class="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
  ></div>
</div>
