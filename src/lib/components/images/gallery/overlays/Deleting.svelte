<script lang="ts">
import { fade } from 'svelte/transition';
</script>

<div
  class="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-glass-result/70 backdrop-blur-sm"
  transition:fade={{ duration: 1000 }}>
  <span class="loading loading-ring loading-md"></span>
</div>
