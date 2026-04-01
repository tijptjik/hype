<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
// BITS
import { Button, Icon, OverlayBar } from '$lib/bits'
import PlusCircleIcon from 'virtual:icons/lucide/circle-plus'
import SwatchIcon from 'virtual:icons/lucide/swatch-book'

type MapOverlayBarProps = {
  offsetX?: number
  centerBottomOffset?: number
  isAddButtonVisible?: boolean
  isCardToggleVisible?: boolean
  onAddFeature?: (event: Event) => void | Promise<void>
  onOpenCard?: (event: Event) => void
}

let {
  offsetX = 0,
  centerBottomOffset = 0,
  isAddButtonVisible = false,
  isCardToggleVisible = false,
  onAddFeature,
  onOpenCard,
}: MapOverlayBarProps = $props()
</script>

{#snippet addFeatureIcon()}
  <Icon
    src={PlusCircleIcon}
    size="3xl"
    strokeWidth={1.5}
    class="rounded-full bg-black transition-transform duration-300 group-hover:rotate-90"
  />
{/snippet}

{#snippet openCardIcon()}
  <Icon src={SwatchIcon} size="lg" strokeWidth={2} />
{/snippet}

<OverlayBar
  class="transition-transform duration-500 ease-in-out"
  style={`transform: translateX(${offsetX}px);`}
  centerStyle={`transform: translateY(-${centerBottomOffset}px);`}
>
  {#snippet left()}
    {#if isAddButtonVisible}
      <Button
        text={m.whole_house_cougar_hurl()}
        icon={addFeatureIcon}
        modifier="circle"
        style="ghost"
        size="xl"
        transition={fade}
        transitionOpts={{ duration: 300, delay: 150 }}
        class="group z-30 text-white shadow-lg"
        attrs={{ title: m.whole_house_cougar_hurl() }}
        onClick={onAddFeature}
      />
    {/if}
  {/snippet}

  {#snippet center()}
    {#if isCardToggleVisible}
      <Button
        text={m.mapbar__show_card()}
        icon={openCardIcon}
        color="dark"
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
