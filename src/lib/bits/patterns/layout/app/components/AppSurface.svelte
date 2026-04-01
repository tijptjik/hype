<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'

type AppSurfaceProps = {
  children: import('svelte').Snippet
  class?: string
  style?: string
}

let { children, class: className = '', style = '' }: AppSurfaceProps = $props()
</script>

<div class={cx('relative flex h-full flex-1 flex-col', className)} {style}>
  {@render children()}
</div>
