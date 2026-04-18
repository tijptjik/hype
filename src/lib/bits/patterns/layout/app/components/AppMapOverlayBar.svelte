<script lang="ts">
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// COMPONENTS
import { MapOverlayBar } from '$lib/bits/patterns/bars/mapOverlayBar'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const isCardToggleVisible = $derived(
  Boolean(
    !omniCtx.isCardOpen &&
      !appCtx.isTransitioning &&
      appCtx.getActiveFeature() &&
      !omniCtx.isNewFeatureMode,
  ),
)
const hasCardToggleTarget = $derived(
  Boolean(
    !omniCtx.isCardOpen && appCtx.getActiveFeature() && !omniCtx.isNewFeatureMode,
  ),
)
const offsetX = $derived(responsiveCtx.getAppMainOffsetX())
const bottomOffset = 0

function handleOpenCard(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  const toggleElement = event.currentTarget as HTMLElement | null
  omniCtx.prepareCardTransitionFromToggle(toggleElement)
  omniCtx.openCard()
}
</script>

<MapOverlayBar
  {offsetX}
  {bottomOffset}
  {hasCardToggleTarget}
  {isCardToggleVisible}
  onOpenCard={handleOpenCard}
/>
