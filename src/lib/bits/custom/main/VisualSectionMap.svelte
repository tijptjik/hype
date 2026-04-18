<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { MainVisualSectionPaneProps } from './main.types'

let {
  class: className = '',
  isCollapsed = false,
  children,
}: MainVisualSectionPaneProps = $props()

const rootClass = $derived(
  cx(
    'bits-feature-visual__pane bits-feature-visual__pane--map relative w-full min-h-0',
    !isCollapsed && 'h-full',
    isCollapsed &&
      'top-[calc((var(--bits-feature-visual-collapsed-height,64px)-var(--bits-feature-visual-expanded-height,520px))/2)] h-[var(--bits-feature-visual-expanded-height,520px)]',
    className,
  ),
)
</script>

<div class={rootClass}>{@render children?.()}</div>
