<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'

type AppShellProps = {
  children: import('svelte').Snippet
  class?: string
  style?: string
}

let { children, class: className = '', style = '' }: AppShellProps = $props()
</script>

<div
  class={cx('flex h-full w-full flex-col justify-around overflow-hidden', className)}
  {style}
>
  {@render children()}
</div>
