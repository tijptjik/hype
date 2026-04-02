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
  isCardToggleVisible?: boolean
  onOpenCard?: (event: Event) => void
}

let {
  offsetX = 0,
  bottomOffset = 0,
  isCardToggleVisible = false,
  onOpenCard,
}: MapOverlayBarProps = $props()

const responsiveCtx = getResponsiveCtx()
const centerBottomOffset = $derived(
  Math.max(24, responsiveCtx.menuClearanceHeight - bottomOffset + 24),
)
const hasVisibleControls = $derived(isCardToggleVisible)
</script>

{#snippet openCardIcon()}
  <Icon src={SwatchIcon} size="lg" strokeWidth={2} />
{/snippet}

<OverlayBar
  class={hasVisibleControls ? 'transition-transform duration-500 ease-in-out' : ''}
  style={`transform: translateX(${offsetX}px); bottom: ${bottomOffset}px;`}
  centerStyle={`transform: translateY(-${centerBottomOffset}px);`}
>
  {#snippet center()}
    {#if isCardToggleVisible}
      <Button
        text={m.mapbar__show_card()}
        icon={openCardIcon}
        color="light"
        style="soft"
        transition={fade}
        transitionOpts={{ duration: 150, delay: 150 }}
        class="z-130 border border-white/10 bg-black/70 shadow-lg backdrop-blur-sm hover:text-primary"
        attrs={{ title: m.mapbar__show_card() }}
        onClick={onOpenCard}
      />
    {/if}
  {/snippet}
</OverlayBar>
