<script lang="ts">
// COMPONENTS
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import LoadError from '$lib/components/images/gallery/overlays/LoadError.svelte';

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

let loaded = $state(false);
let error = $state(false);
let imgElement: HTMLImageElement;

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

async function handleImageLoad() {
  try {
    console.log('[Image] Starting load for:', src);
    const img = new Image();
    img.src = src;

    // Wait for both loading and decoding to complete
    await Promise.all([
      new Promise((resolve) => {
        img.onload = resolve;
      }),
      img.decode()

    ]);

    console.log('[Image] Successfully loaded:', src);

    // Set loaded state to make image visible
    loaded = true;

    // Small delay to ensure DOM update
    setTimeout(() => {
      onLoad?.();
    }, 100);
  } catch (err) {
    console.error('[Image] Load failed for:', src, err);
    error = true;
    loaded = true;
    onError?.();
  }
}

// Reset loaded state and start loading when src changes
$effect(() => {
  if (src) {
    loaded = false;
    handleImageLoad();
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
    {src}
    {alt}
    class="{className ? className : ''} {layout === 'cover'
      ? 'h-full w-full object-cover'
      : layout === 'fill'
        ? 'object-fill'
        : layout === 'fit'
          ? 'object-fit'
          : 'object-contain'}
      {!loaded ? 'invisible' : ''}"
    onerror={() => {
      error = true;
      loaded = true;
      onError?.();
    }} />
</figure>
