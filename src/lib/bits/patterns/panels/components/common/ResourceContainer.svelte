<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// TYPES
import type { Snippet } from 'svelte'

let {
  children,
}: {
  children: Snippet
} = $props()
</script>

<div
  class="scrollbar-thin relative flex min-h-0 flex-1 flex-col gap-px overflow-x-hidden overflow-y-auto overscroll-auto bg-panel py-1 transition-all duration-300"
  tabindex="-1"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  {@render children()}
</div>
