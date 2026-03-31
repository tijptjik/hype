<script lang="ts">
import { cx } from '$lib/bits/utils'
import type { Snippet } from 'svelte'
import type { TaskMainProps } from '../task.types'

let { class: className = '', children }: TaskMainProps & { children?: Snippet } =
  $props()
</script>

<section class={cx('flex min-h-0 min-w-0 flex-col bg-black', className)}>
  {@render children?.()}
</section>
