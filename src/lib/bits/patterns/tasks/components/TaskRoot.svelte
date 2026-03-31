<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { Snippet } from 'svelte'
import type { TaskRootProps } from '../task.types'

let {
  class: className = '',
  hasAside = true,
  children,
}: TaskRootProps & { children?: Snippet } = $props()
</script>

<div
  class={cx(
    'grid h-full min-h-0 w-full gap-0 bg-black text-white',
    hasAside ? 'grid-cols-[minmax(0,1fr)_28rem]' : 'grid-cols-1',
    className,
  )}
>
  {@render children?.()}
</div>
