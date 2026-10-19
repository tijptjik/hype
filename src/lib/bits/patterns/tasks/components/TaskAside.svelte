<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { Snippet } from 'svelte'
import type { TaskAsideProps } from '../task.types'

let { class: className = '', children }: TaskAsideProps & { children?: Snippet } =
  $props()
</script>

<aside
  class={cx(
    'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-panel lg:overflow-y-auto',
    className,
  )}
>
  {@render children?.()}
</aside>
