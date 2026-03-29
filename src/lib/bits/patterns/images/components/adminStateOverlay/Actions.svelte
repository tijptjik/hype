<script lang="ts">
import type { Snippet } from 'svelte'

import { cx } from '$lib/bits/utils'

let {
  class: className = '',
  children,
}: {
  class?: string
  children?: Snippet
} = $props()
</script>

<div class={cx('flex items-center gap-3', className)}>{@render children?.()}</div>
