<script lang="ts">
import { fade } from 'svelte/transition';
</script>

<div class="absolute inset-0 bg-base-300" transition:fade={{ duration: 50 }}>
  <div class="flex h-full items-center justify-center">
    <span class="text-error">⚠️</span>
    <span class="text-sm text-base-content/70">Failed to load image</span>
  </div>
</div>
