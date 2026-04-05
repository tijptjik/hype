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

<div
  class={cx(
    'relative isolate flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden',
    className,
  )}
  {style}
>
  {@render children()}
</div>
