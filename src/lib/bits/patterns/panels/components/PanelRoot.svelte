<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { fly, slide } from 'svelte/transition'
import type { TransitionConfig } from 'svelte/transition'
import { cubicInOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// CONSTANTS
import { PANEL_WIDTH, PANEL_NARROW_WIDTH } from '#lib/constants.js'
// TYPES
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
const expandedWidth = `${PANEL_WIDTH}px`
let initialInlineEntrance = untrack(() => shouldShowInline)

/**
 * Reserves an initially open sidebar's final width while its contents enter.
 * @param node Inline panel element.
 * @param _params Unused transition parameters.
 * @param options Svelte transition direction.
 * @returns Entrance translation or the normal width-changing toggle transition.
 */
function inlineTransition(
  node: Element,
  _params: undefined,
  options: { direction: 'in' | 'out' | 'both' },
): TransitionConfig {
  const initialEntrance = initialInlineEntrance && options.direction !== 'out'
  initialInlineEntrance = false
  const duration = prefersReducedMotion.current ? 0 : 500
  return initialEntrance
    ? fly(node, {
        duration,
        easing: cubicInOut,
        x: position === 'left' ? -PANEL_WIDTH : PANEL_WIDTH,
      })
    : slide(node, { duration, easing: cubicInOut, axis: 'x' })
}
</script>

<!-- Global transitions also run when a deferred parent first mounts an already-open panel. -->
{#if shouldShowInline}
  <div
    id="{position}-panel"
    data-app-intro-item="panel-{position}"
    class="bits-theme border-border bg-panel flex h-full max-w-full shrink-0 flex-col shadow-xl transition-[width] duration-500 select-none motion-reduce:transition-none"
    class:overflow-x-hidden={preserveContentWidth}
    class:border-r={position === 'left'}
    class:border-l={position === 'right'}
    class:left-0={position === 'left'}
    style:width={isNarrow ? `${PANEL_NARROW_WIDTH}px` : expandedWidth}
    transition:inlineTransition|global
  >
    <div
      class="h-full min-h-0"
      style:width={preserveContentWidth
        ? `calc(min(100vw, ${expandedWidth}) - 1px)`
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
    data-app-intro-item="panel-{position}"
    class="bits-theme bg-panel absolute top-0 z-50 flex h-full w-full flex-col shadow-xl select-none md:w-(--panel-width)"
    style:--panel-width={expandedWidth}
    class:left-0={position === 'left'}
    class:right-0={position === 'right'}
    transition:fly|global={{
      duration: prefersReducedMotion.current ? 0 : 150,
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
