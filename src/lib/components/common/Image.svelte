<script lang="ts">
import { fade } from 'svelte/transition';

let {
  src,
  alt,
  class: className = '',
  layout = 'fill',
  showLoading = true,
  showError = true
} = $props<{
  src: string;
  alt: string;
  class?: string;
  layout?: 'cover' | 'fill' | 'fit' | 'contain';
  showLoading?: boolean;
  showError?: boolean;
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

{#snippet loadingSkeleton()}
  <!-- Loading Skeleton -->
  {#if showLoading && !loaded}
    <div
      class="absolute inset-0 animate-pulse bg-base-300"
      transition:fade={{ duration: 200 }}>
      <div class="flex h-full items-center justify-center">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet errorState()}
  <!-- Error State -->
  {#if showError && error}
    <div class="absolute inset-0 bg-base-300" transition:fade={{ duration: 50 }}>
      <div class="flex h-full items-center justify-center">
        <span class="text-error">⚠️</span>
        <span class="text-sm text-base-content/70">Failed to load image</span>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet cloudImage()}
  <img
    {src}
    {alt}
    class="{className ? className : ''} {layout === 'cover'
      ? 'object-cover h-full w-full'
      : layout === 'fill'
        ? 'object-fill'
        : layout === 'fit'
          ? 'object-fit'
          : 'object-contain'}
      {!loaded ? 'invisible' : ''}"
    onload={onLoad}
    onerror={onError} />
{/snippet}

<figure class="relative {className ? className : 'h-64 w-full'}">
  {@render loadingSkeleton()}
  {@render errorState()}
  {@render cloudImage()}
</figure>
