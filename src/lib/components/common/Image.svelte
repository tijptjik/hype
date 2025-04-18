<script lang="ts">
// COMPONENTS
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import LoadError from '$lib/components/images/gallery/overlays/LoadError.svelte';
import { onDestroy } from 'svelte';

// TYPES
type Props = {
  src: string;
  alt: string;
  class?: string;
  layout?: 'cover' | 'fill' | 'fit' | 'contain';
  showLoading?: boolean;
  showError?: boolean;
  onLoad?: () => void;
  onError?: () => void;
};

let error = $state(false);
let imgElement: HTMLImageElement;
let lastSrc = $state('');
let loaded = $state(false);
let imageStore: Record<string, HTMLImageElement> = $state({});
let {
  src,
  alt,
  class: className = '',
  layout = 'fill',
  showLoading = true,
  showError = true,
  onLoad,
  onError
}: Props = $props();

onDestroy(() => {
  if (alt == 'Feature Image') {
    console.log('[Image] Destroying image store:', imageStore);
    imageStore = {};
  }
});

async function handleImageLoad() {
  try {
    if (src in imageStore) {
      console.debug('[Image] Using cached image:', src);
    } else {
      console.debug('[Image] Starting load for:', src);
      let img = new Image();
      img.src = src;
      // Wait for both loading and decoding to complete
      await Promise.all([
        new Promise((resolve) => {
          img.onload = resolve;
        }),
        img.decode()

      ]);
      imageStore[src] = img;
      console.debug('[Image] Successfully loaded:', src);
    }
    imgElement.src = imageStore[src].src;
    loaded = true;
    onLoad?.();
  } catch (err) {
    console.error('[Image] Load failed for:', src, err);
    error = true;
    onError?.();
  }
}

// Reset loaded state and start loading when src changes
$effect(async () => {
  if (src !== lastSrc) {
    lastSrc = src;
    loaded = false;
    await handleImageLoad();
  }
});
</script>

<figure
  class="{className.includes('absolute') ? '' : 'relative'} {className
    ? className
    : 'h-64 w-full'}">
  {#if showLoading && !loaded}
    <Loading />
  {/if}
  {#if showError && error}
    <LoadError />
  {/if}
  <img
    bind:this={imgElement}
    {alt}
    class="{className ? className : ''} {layout === 'cover'
      ? 'h-full w-full object-cover'
      : layout === 'fill'
        ? 'object-fill'
        : layout === 'fit'
          ? 'object-fit'
          : 'object-contain'}"
    onerror={() => {
      error = true;
      loaded = true;
      onError?.();
    }} />
</figure>
