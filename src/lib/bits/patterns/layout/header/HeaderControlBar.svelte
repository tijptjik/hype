<script lang="ts">
// SVELTE
import { tick, untrack } from 'svelte'
// COMPONENTS
import * as HeaderPrimitive from './components'
// TYPES
import type { HeaderProps } from './header.types'

let { controlBar = null }: Pick<HeaderProps, 'controlBar'> = $props()
const CONTROL_BAR_TRANSITION_MS = 180

const showControlBar = $derived(
  Boolean(controlBar?.component) && (controlBar?.isVisible ?? true),
)

// Retain the rendered bar until its exit transition completes.
let renderedControlBar = $state<HeaderProps['controlBar'] | null>(
  untrack(() => controlBar),
)
let isControlBarExpanded = $state(false)
let wasControlBarVisible = $state(false)
const controlBarHeight = $derived(
  renderedControlBar?.height ?? controlBar?.height ?? '4rem',
)

/**
 * Releases hidden controls after their closing animation.
 * @param event - The control bar shell's transition event.
 * @returns Nothing.
 */
function handleControlBarTransitionEnd(event: TransitionEvent): void {
  if (
    event.target !== event.currentTarget ||
    event.propertyName !== 'max-height' ||
    showControlBar
  )
    return

  renderedControlBar = null
}

$effect(() => {
  if (showControlBar && !wasControlBarVisible) {
    renderedControlBar = controlBar
    isControlBarExpanded = false
    void tick().then(() => {
      if (showControlBar && renderedControlBar === controlBar) {
        isControlBarExpanded = true
      }
    })
  } else {
    if (controlBar?.component) {
      renderedControlBar = controlBar
    }
    isControlBarExpanded = showControlBar
  }

  wasControlBarVisible = showControlBar

  if (!controlBar?.component) {
    isControlBarExpanded = false
  }
})
</script>

{#if renderedControlBar?.component}
  {@const ControlBar = renderedControlBar.component}
  {@const controlBarProps = renderedControlBar?.props ?? {}}
  <HeaderPrimitive.BarRoot
    height={controlBarHeight}
    isExpanded={isControlBarExpanded}
    transitionDurationMs={CONTROL_BAR_TRANSITION_MS}
    ontransitionend={handleControlBarTransitionEnd}
  >
    {#snippet children()}
      <ControlBar {...controlBarProps} />
    {/snippet}
  </HeaderPrimitive.BarRoot>
{/if}
