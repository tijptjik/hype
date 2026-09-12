<script lang="ts">
import { fly, slide } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { PANEL_WIDTH } from '$lib/constants'
import type { PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

type Props = PanelProps & {
  isOpen?: boolean
  children: Snippet
  panelContainer?: HTMLDivElement
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
  ...panelProps
}: Props = $props()

// Visibility belongs to the route adapter; the shell owns only transitions and layout.
let shouldShowInline = $derived(inline && (isOpen || isNarrow))
let shouldShowOverlay = $derived(!inline && isOpen)
</script>

{#if shouldShowInline}
  <div
    id="{position}-panel"
    class="bits-theme bits-panel-root bits-panel-root--inline"
    class:bits-panel-root--scrollable={scrollable}
    class:bits-panel-root--left={position === 'left'}
    style:width={isNarrow ? '80px' : isAdmin ? '380px' : '420px'}
    transition:slide={{
      duration: 500,
      easing: cubicInOut,
      axis: 'x',
    }}
  >
    <div
      class="bits-panel-root__content"
      class:overflow-y-auto={scrollable}
      bind:this={panelContainer}
    >
      {@render children()}
    </div>
  </div>
{:else if shouldShowOverlay}
  <div
    id="{position}-panel"
    class="bits-theme bits-panel-root bits-panel-root--overlay"
    class:bits-panel-root--scrollable={scrollable}
    class:bits-panel-root--left={position === 'left'}
    class:bits-panel-root--right={position === 'right'}
    transition:fly={{
      duration: 150,
      easing: cubicInOut,
      x: position === 'left' ? -PANEL_WIDTH : PANEL_WIDTH,
    }}
  >
    <div
      class="bits-panel-root__content"
      class:overflow-y-auto={scrollable}
      bind:this={panelContainer}
    >
      {@render children()}
    </div>
  </div>
{/if}
