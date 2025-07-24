<script lang="ts">
import { slide } from 'svelte/transition';
// TYPES
import type { Snippet } from 'svelte';

// STATE : PROPS
let {
  left,
  right
}: {
  left: Snippet;
  right: Snippet;
} = $props();
</script>

<div
  class="flex w-full flex-shrink-0 flex-col overflow-x-visible border-t-[8px] border-black"
  transition:slide={{ duration: 300 }}>
  <div class="flex-grow-1 min-h-50 flex w-full flex-shrink-0 overflow-hidden">
    <div class="min-h-16 flex-1 overflow-y-auto bg-black">
      {@render left()}
    </div>
    <div class="pointer-events-none w-48 flex-shrink-0 overflow-visible">
      {@render right()}
    </div>
    <div class="h-auto w-4 flex-shrink-0 bg-black"></div>
  </div>
</div>
