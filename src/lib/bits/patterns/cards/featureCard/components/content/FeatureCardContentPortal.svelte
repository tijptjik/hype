<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// CONSTANTS
import { NEW_REF } from '$lib/constants'
// TYPES
import type {
  Feature,
  NewFeatureWithLocationAndParents,
} from '$lib/db/zod/schema/feature.types'
// LOCAL
import FeatureCardContentAddress from './FeatureCardContentAddress.svelte'

let {
  feature,
  size = 200,
}: {
  feature: Feature | NewFeatureWithLocationAndParents
  size?: number
} = $props()

const appCtx = getAppCtx()
const userPreferences = $derived({
  ...appCtx.getUserPreferences(),
  allowMachineTranslation: true,
})
const displayAddress = $derived(
  getI18n(feature as Feature, 'displayAddress', userPreferences, undefined, true),
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

    <rect width="100" height="100" fill="black" mask={`url(#${portalMaskId})`}></rect>
    <circle
      cx="50"
      cy="50"
      r="48"
      fill="none"
      stroke="#4379CF"
      stroke-width="2"
    ></circle>
  </svg>
  <FeatureCardContentAddress addressText={displayAddress} {featureKey} />

  <div
    class="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
  ></div>
</div>
