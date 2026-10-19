<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { Snippet } from 'svelte'
import type { TaskRootProps } from '../task.types'

let {
  class: className = '',
  hasAside = true,
  children,
}: TaskRootProps & { children?: Snippet } = $props()
</script>

<div
  data-form-surface
  class={cx(
    '@container/task grid h-full min-h-0 w-full gap-4 overflow-y-auto bg-[var(--form-workspace)] p-4 text-foreground',
    hasAside
      ? 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:overflow-hidden'
      : 'grid-cols-1',
    className,
  )}
>
  {@render children?.()}
</div>
