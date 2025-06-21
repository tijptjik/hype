<script lang="ts">
// SVELTE
import { watch } from 'runed';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
import { getURLfromImage } from '$lib/client/services/image';
// COMPONENTS
import Picture from '$lib/components/common/Picture.svelte';
// TYPES
import { type Snippet } from 'svelte';
import type { Image } from '$lib/types';

type DisplayImage = {
  id: string;
  src: string | undefined;
  isPreview: boolean;
  image?: Image;
};

type Props = {
  class?: string;
  layout?: 'cover' | 'fill' | 'fit' | 'contain';
  mode?: 'standalone' | 'carousel' | 'gallery';
  showLoading?: boolean;
  showError?: boolean;
  showBackground?: boolean;
  transitionDuration?: number;
  transformation?: string;
  children?: Snippet;
};

const imageCtx = getImageContext();

let {
  class: className = '',
  layout = 'contain',
  mode = 'standalone',
  showLoading = true,
  showError = true,
  showBackground = true,
  transitionDuration = 300,
  transformation,
  children
}: Props = $props();

// Simplified state for crossfade transitions
let baseImage = $state<DisplayImage | null>(null);
let overlayImage = $state<DisplayImage | null>(null);
let isTransitioning = $state(false);
let overlayOpacity = $state(0);
let animationId = $state<number | null>(null);

// Generate alt text
let altText = $derived(baseImage ? `Image ${baseImage.id}` : 'No image');

function getDisplayImageFromPreview(preview: any): DisplayImage {
  return {
    id: `preview-${preview.file.name}`,
    src: preview.preview,
    isPreview: true
  };
}

function getDisplayImageFromActiveImage(
  activeImage: Image,
  transformation?: string
): DisplayImage {
  return {
    id: activeImage.id,
    src: getURLfromImage({ image: activeImage, transformation }),
    isPreview: false,
    image: activeImage
  };
}

// Determine what should be displayed based on current state
function getDisplayImage(): DisplayImage | null {
  // Priority 1: Show preview during upload states
  if (imageCtx.viewerState === 'previewUploading' && imageCtx.activePreview?.preview) {
    return getDisplayImageFromPreview(imageCtx.activePreview);
  }
  // Priority 2: Show preview during replacement
  if (
    imageCtx.viewerState === 'previewReplacement' &&
    imageCtx.activePreview?.preview
  ) {
    return getDisplayImageFromPreview(imageCtx.activePreview);
  }
  // Priority 3: Show preview during transition state (replacement upload complete but not loaded)
  if (imageCtx.viewerState === 'transition' && imageCtx.activePreview?.preview) {
    return getDisplayImageFromPreview(imageCtx.activePreview);
  }
  // Priority 4: Show active image
  if (imageCtx.activeImage) {
    return getDisplayImageFromActiveImage(imageCtx.activeImage, transformation);
  }
  // Priority 5: No image
  return null;
}

// Initialize display on mount
$effect(() => {
  const displayImage = getDisplayImage();
  if (displayImage && !baseImage) {
    baseImage = displayImage;
  }
});

// Simple crossfade transition logic
watch(
  () => [imageCtx.viewerState, imageCtx.activeImage, imageCtx.activePreview] as const,
  () => {
    const newDisplayImage = getDisplayImage();

    // No display image, clear everything
    if (!newDisplayImage) {
      baseImage = null;
      overlayImage = null;
      isTransitioning = false;
      overlayOpacity = 0;
      return;
    }

    // Same image, no transition needed
    if (newDisplayImage.id === baseImage?.id) {
      return;
    }

    // First image load, set directly without transition
    if (!baseImage) {
      baseImage = newDisplayImage;
      overlayImage = null;
      isTransitioning = false;
      overlayOpacity = 0;
      return;
    }

    // Cancel any running animation
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // If we're already transitioning, use the current overlay as the new base
    if (isTransitioning && overlayImage) {
      baseImage = overlayImage;
    }

    // Start crossfade transition
    overlayImage = newDisplayImage;
    isTransitioning = true;
    overlayOpacity = 0;

    // Animate crossfade
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / transitionDuration, 1);

      // Smooth easing
      overlayOpacity = 1 - Math.pow(1 - progress, 3);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        // Transition complete
        baseImage = overlayImage;
        overlayImage = null;
        isTransitioning = false;
        overlayOpacity = 0;
        animationId = null;
      }
    };
    animationId = requestAnimationFrame(animate);
  }
);

// Preload adjacent images for smooth navigation
watch(
  () => imageCtx.activeImage,
  (activeImage) => {
    if (activeImage && mode !== 'standalone') {
      const images = imageCtx.getImages();
      const currentIndex = images.findIndex((img) => img.id === activeImage.id);

      if (currentIndex !== -1) {
        // Preload next and previous images
        const nextIndex = (currentIndex + 1) % images.length;
        const prevIndex = (currentIndex - 1 + images.length) % images.length;

        [images[nextIndex], images[prevIndex]].forEach((img) => {
          if (img) {
            const src = getURLfromImage({ image: img, transformation });
            imageCtx.preloadImage(src);
          }
        });
      }
    }
  }
);

// Calculate opacity for preview images during upload
function getImageOpacity(
  displayImage: DisplayImage | null,
  transitionOpacity: number = 1
): number {
  if (!displayImage) return transitionOpacity;

  // Slightly reduce opacity for uploading previews
  if (displayImage.isPreview) {
    const isUploading =
      imageCtx.viewerState === 'previewUploading' ||
      imageCtx.viewerState === 'previewReplacement';
    return isUploading ? 0.8 * transitionOpacity : transitionOpacity;
  }

  return transitionOpacity;
}
</script>

<div class="relative {className}" style="transition-duration: {transitionDuration}ms;">
  <!-- Base Image (OLD - behind) -->
  {#if baseImage && baseImage.src}
    <div class="absolute inset-0 z-0">
      <Picture
        src={baseImage?.src || ''}
        alt={altText}
        {layout}
        {showLoading}
        {showError}
        {showBackground}
        opacity={getImageOpacity(baseImage, isTransitioning ? 1 - overlayOpacity : 1)}
        onLoad={() => {
          if (!baseImage?.isPreview && baseImage?.image) {
            imageCtx.setLoadStatus(baseImage?.image.id, 'loaded');
          }
        }}
        onError={() => {
          if (!baseImage?.isPreview && baseImage?.image) {
            imageCtx.setLoadStatus(baseImage?.image.id, 'error');
          }
        }} />
    </div>
  {/if}

  <!-- Overlay Image (NEW - in front during transition) -->
  {#if overlayImage && overlayImage.src && isTransitioning}
    <div class="z-1 absolute inset-0">
      <Picture
        src={overlayImage?.src || ''}
        alt={`Transitioning to ${overlayImage.id}`}
        {layout}
        {showLoading}
        {showError}
        {showBackground}
        opacity={getImageOpacity(overlayImage, overlayOpacity)}
        onLoad={() => {
          if (!overlayImage?.isPreview && overlayImage?.image) {
            imageCtx.setLoadStatus(overlayImage?.image.id, 'loaded');
          }
        }}
        onError={() => {
          if (!overlayImage?.isPreview && overlayImage?.image) {
            imageCtx.setLoadStatus(overlayImage?.image.id, 'error');
          }
        }} />
    </div>
  {/if}

  <!-- Content overlay -->
  {#if children}
    <div class="absolute inset-0 z-10">
      {@render children()}
    </div>
  {/if}
</div>
