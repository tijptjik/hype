<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportRowsProps } from './importLayout.types'

let {
  children,
  class: className = '',
  innerClass = 'space-y-3',
}: ImportRowsProps = $props()

const rootClass = $derived(
  cx('min-h-0 h-full flex-1 overflow-y-auto px-5 pt-5', className),
)
const contentClass = $derived(cx(innerClass))
</script>

<div class={rootClass}>
  <div class={contentClass}>
    {@render children?.()}
  </div>
</div>
