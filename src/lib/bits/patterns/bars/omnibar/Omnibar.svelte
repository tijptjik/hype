<script lang="ts">
// COMPONENTS
import * as OmnibarPrimitive from './components'
// CONTEXT
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// STYLES
import { getOmnibarRootClasses, getOmnibarSurfaceClasses } from './omnibar.styles'
import { getOmnibarAvailableViewportHeight } from './omnibar.utils'

const omniCtx = getOmniCtx()
const responsiveCtx = getResponsiveCtx()

const showSearch = $derived(omniCtx.state.mode === 'search')
const hasElevatedChrome = $derived(responsiveCtx.hasElevatedChrome)
const availableViewportHeight = $derived(
  getOmnibarAvailableViewportHeight(
    responsiveCtx.visibleWindowHeight,
    responsiveCtx.menuClearanceHeight,
  ),
)
const horizontalOffset = $derived(responsiveCtx.getAppMainOffsetX())
const effectiveAppMainWidth = $derived(responsiveCtx.getEffectiveAppMainWidth())
const rootClasses = $derived(getOmnibarRootClasses(hasElevatedChrome))
const surfaceClasses = $derived(getOmnibarSurfaceClasses(hasElevatedChrome))

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    omniCtx.close()
  }
}
</script>

<OmnibarPrimitive.Root
  class={rootClasses}
  style="transform: translateX({horizontalOffset}px); --omni-available-height: {availableViewportHeight}px; --omni-effective-main-width: {effectiveAppMainWidth}px;"
  onkeydown={handleEscape}
>
  {#snippet children()}
    <OmnibarPrimitive.Surface class={surfaceClasses}>
      {#if showSearch}
        <OmnibarPrimitive.SearchBar />
      {:else}
        <OmnibarPrimitive.NavigationBar />
      {/if}
    </OmnibarPrimitive.Surface>
  {/snippet}
</OmnibarPrimitive.Root>
