<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// TYPES
import type { ImportRegionProps } from './importLayout.types'

let { children, class: className = '' }: ImportRegionProps = $props()

const rootClass = $derived(cx('min-h-0 flex-1 overflow-hidden', className))
</script>

<div class={rootClass}>
  {@render children?.()}
</div>
