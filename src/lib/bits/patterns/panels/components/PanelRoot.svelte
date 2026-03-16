<script lang="ts">
import { fly, slide } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { getAppCtx } from '$lib/context/app.svelte'
import { PANEL_WIDTH } from '$lib'
import type { PanelProps } from '$lib/types'
import type { Snippet } from 'svelte'

const appCtx = getAppCtx()

type Props = PanelProps & {
  children: Snippet
  panelContainer?: HTMLDivElement
}

let {
  children,
  panelContainer = $bindable(),
  position = 'right',
  scrollable = true,
  inline = false,
  isAdmin = false,
  isNarrow = false,
  ...panelProps
}: Props = $props()

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
