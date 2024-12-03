<script lang="ts">
import Uploading from './overlays/Uploading.svelte';
import { fade } from 'svelte/transition';
</script>

{#each Array(3) as _, i}
  <div
    class="relative h-[200px] w-[200px] flex-none animate-pulse rounded-lg bg-base-200"
    in:fade={{ duration: 200, delay: i * 100 }}>
    <Uploading />
  </div>
{/each}
