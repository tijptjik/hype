<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// BITS
import { Button, Icon, OverlayBar } from '$lib/bits'
// ICONS
import SwatchIcon from 'virtual:icons/lucide/swatch-book'

type MapOverlayBarProps = {
  offsetX?: number
  bottomOffset?: number
  hasCardToggleTarget?: boolean
  isCardToggleVisible?: boolean
  onOpenCard?: (event: Event) => void
}

let {
  offsetX = 0,
  bottomOffset = 0,
  hasCardToggleTarget = false,
  isCardToggleVisible = false,
  onOpenCard,
}: MapOverlayBarProps = $props()

const responsiveCtx = getResponsiveCtx()
const centerBottomOffset = $derived(
  Math.max(24, responsiveCtx.menuClearanceHeight - bottomOffset + 24),
)
const hasVisibleControls = $derived(hasCardToggleTarget)
</script>

{#snippet openCardIcon()}
  <Icon src={SwatchIcon} size="lg" strokeWidth={2} />
{/snippet}

{#snippet openCardButton()}
  <div
    id="map-overlay-card-toggle"
    class={`transition-opacity duration-150 ${isCardToggleVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
  >
    <Button
      text={m.mapbar__show_card()}
      icon={openCardIcon}
      color="light"
      style="soft"
      class="z-130 border border-white/10 bg-black/70 shadow-lg backdrop-blur"
      attrs={{ title: m.mapbar__show_card() }}
      onClick={onOpenCard}
    />
  </div>
{/snippet}

<OverlayBar
  class={hasVisibleControls ? 'transition-transform duration-500 ease-in-out' : ''}
  style={`transform: translateX(${offsetX}px); bottom: ${bottomOffset}px;`}
  centerStyle={`transform: translateY(-${centerBottomOffset}px);`}
>
  {#snippet center()}
    {#if hasCardToggleTarget}
      <div transition:fade={{ duration: 150, delay: isCardToggleVisible ? 150 : 0 }}>
        {@render openCardButton()}
      </div>
    {/if}
  {/snippet}
</OverlayBar>
