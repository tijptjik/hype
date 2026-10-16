<script lang="ts">
import { fly, slide } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { PANEL_WIDTH } from '#lib/constants.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { Snippet } from 'svelte'

type Props = PanelProps & {
  isOpen?: boolean
  children: Snippet
  panelContainer?: HTMLDivElement
  /** Reveal full-width content without reflowing it during the inline transition. */
  preserveContentWidth?: boolean
}

let {
  children,
  isOpen = false,
  panelContainer = $bindable(),
  position = 'right',
  scrollable = true,
  inline = false,
  isAdmin = false,
  isNarrow = false,
  preserveContentWidth = false,
  ...panelProps
}: Props = $props()

// Visibility belongs to the route adapter; the shell owns only transitions and layout.
let shouldShowInline = $derived(inline && (isOpen || isNarrow))
let shouldShowOverlay = $derived(!inline && isOpen)
const expandedWidth = $derived(isAdmin ? '380px' : '420px')
</script>

{#if shouldShowInline}
  <div
    id="{position}-panel"
    class="bits-theme flex h-full max-w-full shrink-0 select-none flex-col bg-panel shadow-xl transition-all duration-500"
    class:overflow-x-hidden={preserveContentWidth}
    class:overflow-y-auto={scrollable}
    class:border-r={isAdmin}
    class:border-border={isAdmin}
    class:left-0={position === 'left'}
    style:width={isNarrow ? (isAdmin ? '64px' : '80px') : expandedWidth}
    transition:slide={{
      duration: 500,
      easing: cubicInOut,
      axis: 'x',
    }}
  >
    <div
      class="h-full min-h-0"
      style:width={preserveContentWidth
        ? `calc(min(100vw, ${expandedWidth}) - ${isAdmin ? '1px' : '0px'})`
        : undefined}
      class:shrink-0={preserveContentWidth}
      class:overflow-y-auto={scrollable}
      bind:this={panelContainer}
    >
      {@render children()}
    </div>
  </div>
{:else if shouldShowOverlay}
  <div
    id="{position}-panel"
    class="bits-theme absolute top-0 z-50 flex h-full w-full select-none flex-col bg-panel shadow-xl md:w-[420px]"
    class:overflow-y-auto={scrollable}
    class:left-0={position === 'left'}
    class:right-0={position === 'right'}
    transition:fly={{
      duration: 150,
      easing: cubicInOut,
      x: position === 'left' ? -PANEL_WIDTH : PANEL_WIDTH,
    }}
  >
    <div
      class="h-full min-h-0"
      class:overflow-y-auto={scrollable}
      bind:this={panelContainer}
    >
      {@render children()}
    </div>
  </div>
{/if}
