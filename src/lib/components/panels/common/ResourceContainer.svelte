<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'

let { children } = $props<{
  children: any
}>()
</script>

<div
  class="scrollbar-thin flex min-h-0 flex-col gap-[1px] overflow-visible overflow-y-auto overscroll-none bg-black py-1 transition-all duration-300"
  tabindex="-1"
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  {@render children()}
</div>
