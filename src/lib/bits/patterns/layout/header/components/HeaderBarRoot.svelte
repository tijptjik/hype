<script lang="ts">
// TYPES
import type { HeaderBarRootProps } from './headerPrimitives.types'

let {
  children,
  class: className = '',
  isExpanded = false,
  height = '4rem',
  transitionDurationMs = 180,
  ...restProps
}: HeaderBarRootProps = $props()

const shellClass = $derived(
  [
    'bits-theme bits-pattern-header__control-bar-shell',
    isExpanded ? 'bits-pattern-header__control-bar-shell--expanded' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const shellStyle = $derived(
  `--bits-pattern-header-control-bar-height: ${height}; transition-duration: ${transitionDurationMs}ms;`,
)

const barStyle = $derived(
  `opacity: ${isExpanded ? 1 : 0}; transform: translateY(${isExpanded ? 0 : -12}px); transition-duration: ${transitionDurationMs}ms;`,
)
</script>

<div class={shellClass} style={shellStyle} {...restProps}>
  <div class="bits-theme bits-pattern-header__control-bar" style={barStyle}>
    {@render children?.()}
  </div>
</div>
