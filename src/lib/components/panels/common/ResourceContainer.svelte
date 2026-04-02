<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'

let { children } = $props<{
  children: any
}>()
</script>

<div
  class="scrollbar-thin flex min-h-0 flex-1 flex-col gap-px overflow-x-hidden overflow-y-auto overscroll-auto bg-black py-1 transition-all duration-300"
  tabindex="-1"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  {@render children()}
</div>
