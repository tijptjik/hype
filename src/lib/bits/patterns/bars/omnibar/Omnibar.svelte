<script lang="ts">
// COMPONENTS
import * as OmnibarPrimitive from './components'
// ENUMS
import { OmniMode } from '$lib/enums'
// STYLES
import { getOmnibarRootClasses } from './omnibar.styles'
// TYPES
import type { OmnibarProps } from './omnibar.types'

let {
  mode,
  hasElevatedChrome,
  horizontalOffset,
  effectiveAppMainWidth,
  availableViewportHeight,
  search,
  navigation,
  onDismiss,
}: OmnibarProps = $props()

const showSearch = $derived(mode === OmniMode.search)
const rootClasses = $derived(
  getOmnibarRootClasses({
    availableViewportHeight,
    hasElevatedChrome,
    effectiveAppMainWidth,
  }),
)

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    onDismiss()
  }
}
</script>

<OmnibarPrimitive.Root
  class={rootClasses}
  {hasElevatedChrome}
  style="transform: translateX({horizontalOffset}px); --omni-available-height: {availableViewportHeight}px; --omni-effective-main-width: {effectiveAppMainWidth}px;"
  onkeydown={handleEscape}
>
  {#snippet children()}
    {#if showSearch}
      <OmnibarPrimitive.SearchBar
        {search}
        {hasElevatedChrome}
        {effectiveAppMainWidth}
      />
    {:else}
      <OmnibarPrimitive.NavigationBar
        {mode}
        {navigation}
        {hasElevatedChrome}
        {effectiveAppMainWidth}
      />
    {/if}
  {/snippet}
</OmnibarPrimitive.Root>
