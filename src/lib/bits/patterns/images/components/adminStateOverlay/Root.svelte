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

<div
  class={cx(
    'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[inherit] px-4 py-5 text-white backdrop-blur-[3px] z-50 bg-[linear-gradient(180deg,rgba(7,7,7,0.58)_0%,rgba(7,7,7,0.82)_100%)]',
    className,
  )}
>
  {@render children?.()}
</div>
