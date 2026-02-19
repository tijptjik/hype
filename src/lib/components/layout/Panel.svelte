<script lang="ts">
import { fly, slide } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
// CONSTANTS
import { PANEL_WIDTH } from '$lib/index'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'

const appCtx = getAppCtx()

// TYPES
import type { PanelProps } from '$lib/types'

let {
  children,
  panelContainer = $bindable(),
  position = 'right',
  scrollable = true,
  inline = false,
  isAdmin = false,
  isNarrow = false,
  ...panelProps
}: PanelProps & {
  children: any
  panelContainer?: HTMLDivElement
} & PanelProps = $props()

// Panel visibility logic
let shouldShowInline = $derived(
  inline &&
    (appCtx.isPanelOpen(panelProps.panelType) ||
      appCtx.isPanelOpenVisually(panelProps.panelType) ||
      isNarrow),
)

let shouldShowOverlay = $derived(
  !inline &&
    (appCtx.isPanelOpen(panelProps.panelType) ||
      appCtx.isPanelOpenVisually(panelProps.panelType)),
)
</script>

{#if shouldShowInline}
  <div
    id="{position}-panel"
    class="flex h-full flex-shrink-0 select-none flex-col bg-black caret-transparent shadow-xl transition-all duration-500"
    style:width={isNarrow ? '80px' : isAdmin ? '380px' : `420px`}
    class:overflow-y-hidden={!scrollable}
    class:overflow-y-auto={scrollable}
    transition:slide={{
      duration: 500,
      easing: cubicInOut,
      axis: 'x'
    }}
  >
    <div class="h-full" class:overflow-y-auto={scrollable} bind:this={panelContainer}>
      {@render children()}
    </div>
  </div>
{:else if shouldShowOverlay}
  <div
    id="{position}-panel"
    class="absolute top-0 z-50 flex h-full w-full select-none flex-col bg-black caret-transparent shadow-xl [@media(min-width:920px)]:w-[420px]"
    class:overflow-y-hidden={!scrollable}
    class:overflow-y-auto={scrollable}
    class:md:left-0={position === 'left'}
    class:md:right-0={position === 'right'}
    transition:fly={{
      duration: 150,
      easing: cubicInOut,
      x: position === 'left' ? -PANEL_WIDTH : PANEL_WIDTH
    }}
  >
    <div class="h-full" class:overflow-y-auto={scrollable} bind:this={panelContainer}>
      {@render children()}
    </div>
  </div>
{/if}
