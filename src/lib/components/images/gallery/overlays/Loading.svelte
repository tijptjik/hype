<script lang="ts">
import { fade } from 'svelte/transition';
</script>

<div
  class="absolute inset-0 animate-pulse rounded-lg"
  transition:fade={{ delay: 700, duration: 300 }}>
  <div class="flex h-full w-full items-center justify-center">
    <span class="loading loading-ring loading-md"></span>
  </div>
</div>
