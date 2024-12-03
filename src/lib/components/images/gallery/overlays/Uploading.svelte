<script lang="ts">
import { fade } from 'svelte/transition';
</script>

<div
  class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <span class="loading loading-spinner loading-md"></span>
</div>
