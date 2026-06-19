<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportRowProps } from './importLayout.types'

let {
  children,
  leading,
  class: className = '',
  contentClass = '',
}: ImportRowProps = $props()

const rootClass = $derived(
  cx(
    'flex overflow-visible rounded-xl border border-base-content/10 bg-base-100/70',
    className,
  ),
)
const contentRootClass = $derived(cx('min-w-0 flex-1 px-4 pt-4', contentClass))
</script>

<div class={rootClass}>
  {#if leading}
    <div class="shrink-0">
      {@render leading()}
    </div>
  {/if}

  <div class={contentRootClass}>
    {@render children?.()}
  </div>
</div>
