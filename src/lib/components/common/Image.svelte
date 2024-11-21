<script lang="ts">
import { fade } from 'svelte/transition';

let {
  src,
  alt,
  class: className = ''
} = $props<{
  src: string;
  alt: string;
  class?: string;
}>();

let loaded = $state(false);
let error = $state(false);

function onLoad() {
  loaded = true;
}

function onError() {
  error = true;
  loaded = true;
}
</script>

<figure class="relative {className ? className : 'h-64 w-full'}">
  <!-- Loading Skeleton -->
  {#if !loaded}
    <div
      class="absolute inset-0 animate-pulse bg-base-300"
      transition:fade={{ duration: 200 }}>
      <div class="flex h-full items-center justify-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    </div>
  {/if}

  <!-- Error State -->
  {#if error}
    <div class="absolute inset-0 bg-base-300" transition:fade={{ duration: 50 }}>
      <div class="flex h-full flex-col items-center justify-center gap-2">
        <span class="text-error">⚠️</span>
        <span class="text-sm text-base-content/70">Failed to load image</span>
      </div>
    </div>
  {/if}

  <!-- Actual Image -->
  <img
    {src}
    {alt}
    class="h-full w-full object-cover {!loaded ? 'invisible' : ''}"
    on:load={onLoad}
    on:error={onError} />
</figure>
