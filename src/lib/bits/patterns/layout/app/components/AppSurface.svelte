<script lang="ts">
// BITS
import { cx } from '#lib/bits/utils.js'

type AppSurfaceProps = {
  children: import('svelte').Snippet
  class?: string
  style?: string
  intro?: 'waiting' | 'entering' | 'complete'
}

let { children, class: className = '', style = '', intro }: AppSurfaceProps = $props()
</script>

<div
  class={cx(
    'relative isolate flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden',
    className,
  )}
  {style}
  data-app-intro={intro}
>
  {@render children()}
</div>
