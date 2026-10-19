<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import type { Snippet } from 'svelte'
import type { TaskMainProps } from '../task.types'

let { class: className = '', children }: TaskMainProps & { children?: Snippet } =
  $props()
</script>

<section
  class={cx(
    'flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-panel lg:min-h-0',
    className,
  )}
>
  {@render children?.()}
</section>
