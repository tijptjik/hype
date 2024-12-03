<script lang="ts">
import { fade } from 'svelte/transition';
</script>

<div
  class="absolute inset-0 animate-pulse rounded-lg bg-base-200"
  transition:fade={{ duration: 200 }}>
  <div class="flex h-full w-full items-center justify-center">
    <span class="loading loading-spinner loading-md"></span>
  </div>
</div>
