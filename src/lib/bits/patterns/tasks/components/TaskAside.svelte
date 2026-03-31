<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { Snippet } from 'svelte'
import type { TaskAsideProps } from '../task.types'

let { class: className = '', children }: TaskAsideProps & { children?: Snippet } =
  $props()
</script>

<aside
  class={cx(
    'flex min-h-0 flex-col gap-3 overflow-hidden pr-3 pb-3 pt-1',
    className,
  )}
>
  {@render children?.()}
</aside>
