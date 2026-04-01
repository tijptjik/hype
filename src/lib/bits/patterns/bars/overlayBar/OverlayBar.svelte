<script lang="ts">
import type { OverlayBarProps } from './overlayBar.types'

let {
  left,
  center,
  right,
  class: className = '',
  style = '',
  centerStyle = '',
}: OverlayBarProps = $props()

const classes = $derived(
  [
    'bits-theme absolute inset-x-0 bottom-0 z-40 px-3 pt-4 caret-transparent pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<div class={classes} {style}>
  <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
    <div class="min-w-0 flex items-center gap-2">{@render left?.()}</div>
    <div
      class="flex items-center justify-center gap-2 transition-transform duration-260 ease-[ease]"
      style={centerStyle}
    >
      {@render center?.()}
    </div>
    <div class="min-w-0 flex items-center justify-end gap-2">{@render right?.()}</div>
  </div>
</div>
