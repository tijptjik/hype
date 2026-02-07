<script lang="ts">
// COMPONENTS
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import LoadError from '$lib/components/images/gallery/overlays/LoadError.svelte';
import { onDestroy } from 'svelte';

// IMAGE

// A Component for handling stand-alone images, which are not loaded in the context of ImageProvider.

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
let loaded = $state(false);
let imageStore: Record<string, HTMLImageElement> = $state({});
let baseImageSrc = $state(''); // Currently visible image
let overlayImageSrc = $state(''); // New image loading in overlay
let isTransitioning = $state(false);
let overlayOpacity = $state(0);
let animationId: number | null = null;
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
  imageStore = {};
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }
});

async function preloadImage(imageSrc: string): Promise<HTMLImageElement> {
  if (imageStore[imageSrc]) {
    return imageStore[imageSrc];
  }

  const img = new Image();
  img.src = imageSrc;

  await Promise.all([
    new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    }),
    img.decode()
  ]);

  imageStore[imageSrc] = img;
  return img;
}

// Handle src changes with smooth transitions
$effect(() => {
  if (!src) return;

  // First image load - no transition needed
  if (!baseImageSrc) {
    preloadImage(src)
      .then(() => {
        baseImageSrc = src;
        loaded = true;
        error = false;
        onLoad?.();
      })
      .catch((err) => {
        console.error('[Image] Load failed for:', src, err);
        error = true;
        onError?.();
      });
    return;
  }

  // Same image - no change needed
  if (src === baseImageSrc) {
    return;
  }

  // Different image - start transition
  overlayImageSrc = src;
  isTransitioning = true;
  overlayOpacity = 0;

  // Preload the new image
  preloadImage(src)
    .then(() => {
      // Start fade transition
      const startTime = performance.now();
      const transitionDuration = 300;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / transitionDuration, 1);

        // Ease-out cubic
        const eased = 1 - (1 - progress) ** 3;
        overlayOpacity = eased;

        if (progress < 1) {
          animationId = requestAnimationFrame(animate);
        } else {
          // Transition complete - swap images
          baseImageSrc = overlayImageSrc;
          overlayImageSrc = '';
          isTransitioning = false;
          overlayOpacity = 0;
          animationId = null;
          onLoad?.();
        }
      };

      animationId = requestAnimationFrame(animate);
    })
    .catch((err) => {
      console.error('[Image] Load failed for:', src, err);
      error = true;
      isTransitioning = false;
      overlayImageSrc = '';
      overlayOpacity = 0;
      onError?.();
    });
});
</script>

<figure
  class="{className.includes('absolute') ? '' : 'relative'} {className
    ? className
    : 'h-64 w-full'} bg-transparent">
  {#if showLoading && !loaded}
    <Loading />
  {/if}
  {#if showError && error}
    <LoadError />
  {/if}

  <!-- Base image (currently visible) -->
  {#if baseImageSrc && imageStore[baseImageSrc]}
    <img
      src={imageStore[baseImageSrc].src}
      {alt}
      class="absolute inset-0 opacity-100 {layout === 'cover'
        ? 'h-full w-full object-cover'
        : layout === 'fill'
          ? 'object-fill'
          : layout === 'fit'
            ? 'object-fit'
            : 'object-contain'} bg-transparent"
      style="z-index: 1;" />
  {/if}

  <!-- Overlay image (fading in during transition) -->
  {#if isTransitioning && overlayImageSrc && imageStore[overlayImageSrc]}
    <img
      src={imageStore[overlayImageSrc].src}
      {alt}
      class="absolute inset-0 transition-opacity duration-300 {layout === 'cover'
        ? 'h-full w-full object-cover'
        : layout === 'fill'
          ? 'object-fill'
          : layout === 'fit'
            ? 'object-fit'
            : 'object-contain'} bg-transparent"
      style="opacity: {overlayOpacity}; z-index: 2;" />
  {/if}
</figure>
