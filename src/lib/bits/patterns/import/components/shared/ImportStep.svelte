<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'

type Props = {
  children: Snippet
  overflow?: 'auto' | 'hidden'
}

let { children, overflow = 'auto' }: Props = $props()
</script>

<div
  class={`min-h-0 h-full flex-1 px-4 ${overflow === 'hidden' ? 'overflow-hidden' : 'overflow-y-auto'}`}
>
  {@render children()}
</div>
