<script lang="ts">
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature'
// COMPONENTS
import { MapOverlayBar } from '$lib/bits/patterns/bars/mapOverlayBar'

const appCtx = getAppCtx()
const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const isAddButtonVisible = $derived(
  Boolean(
    !omniCtx.state.isTrayOpen &&
      !appCtx.isTransitioning &&
      !appCtx.getActiveFeature() &&
      !omniCtx.isNewFeatureMode &&
      appCtx.isMobile,
  ),
)
const isCardToggleVisible = $derived(
  Boolean(
    !omniCtx.isCardOpen &&
      !appCtx.isTransitioning &&
      appCtx.getActiveFeature() &&
      !omniCtx.isNewFeatureMode,
  ),
)
const offsetX = $derived(responsiveCtx.getAppMainOffsetX())
const bottomOffset = $derived(responsiveCtx.menuReservedHeight)

async function handleAddFeature(event: Event): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  await initAddNewFeature(appCtx, omniCtx, event)
}

function handleOpenCard(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  omniCtx.openCard()
}
</script>

<MapOverlayBar
  {offsetX}
  {bottomOffset}
  {isAddButtonVisible}
  {isCardToggleVisible}
  onAddFeature={handleAddFeature}
  onOpenCard={handleOpenCard}
/>
