<script lang="ts">
// SVELTE
import { untrack } from 'svelte';
// SERVICES
import { getImageById } from '$lib/client/services/image';
// CONTEXT
import { ImageCtx, setImageCtx } from '$lib/context/image.svelte';
// TYPES
import type { ImageProviderProps, Image, ImageDBBasic } from '$lib/types';

// ═══════════════════════
// REACTIVE STATE
// ═══════════════════════

// STATE
let lastSet: string | undefined = $state();
let lastImageId: string | undefined | null = $state();
let lastImageState: string = $state(''); // Track image state changes
let lastFullScreen: boolean | undefined = $state(false);
let lastPathname: string = $state(''); // Track page navigation
let targetImage: Image | ImageDBBasic | null = $state(null);
let initialisingContext: boolean = $state(false);

// PROPS
let { children, page, ...options }: ImageProviderProps = $props();

// PARAMS
let urlImageId: string | null = $derived(page.url.searchParams.get('imageId') || null);
let isFullScreen: boolean = $derived(
  page.url.searchParams.get('fullscreen') === 'true'
);

// ═══════════════════════
// CONTEXT :: INITIAL
// ═══════════════════════

let getInitialImage = () =>
  options.image && (options.image.id == urlImageId || !urlImageId)
    ? (options.image as Image)
    : urlImageId
      ? undefined
      : null;

let imageCtx: ImageCtx = setImageCtx({
  ...options,
  //svelte-ignore state_referenced_locally
  isFullScreen,
  image: getInitialImage()
});

// ═══════════════════════
// EFFECTS
// ═══════════════════════

// ═══════════════════════
// 1. LOADING :: IMAGE
// ═══════════════════════

$effect.pre(() => {
  const defaultImage = options.image;
  const urlBasedImageId = urlImageId;

  if (options.isValid) {
    if (urlBasedImageId && urlBasedImageId !== defaultImage?.id) {
      untrack(() => getImageById(urlImageId).then((image) => (targetImage = image)));
    } else {
      untrack(() => (targetImage = options.image || null));
    }
  }
});

// ═══════════════════════
// 2. WATCH :: Feature Context, Target Image, Full Screen
// ═══════════════════════

function applyTargetImage(targetImageId: string) {
  // Return early if this image is already the active image
  // Or if the imageContext is in an inValid state (Feature.id and featureId mismatch)
  const currentActiveImageId = imageCtx.state.activeImage?.id;
  if (currentActiveImageId === targetImageId || !options.isValid) {
    return;
  }
  // Target the image if it exists in the images array
  // Targetting will transition the image from target to active image.
  if (imageCtx.state.images && imageCtx.state.images.get(targetImageId)) {
    imageCtx.target(targetImageId);
  } else {
    imageCtx.refreshImages(targetImageId);
  }
  lastImageId = targetImageId;
}

$effect.pre(() => {
  isFullScreen;
  // Create comprehensive context ID that includes both primary and secondary context
  const contextId = options?.context
    ? `${options.context.ctxType}-${options.context.ctxId}${options.context.ctxTypeSecondary ? `-${options.context.ctxTypeSecondary}-${options.context.ctxIdSecondary}` : ''}`
    : undefined;
  const currentImage = options.image;
  const targetImageId = targetImage?.id;

  if (!options.isValid) {
    // During navigation, isValid becomes false before new data loads
    // We should reset the context if we're navigating to a different route
    const currentPathname = page.url.pathname;
    if (lastPathname && currentPathname !== lastPathname && lastSet) {
      untrack(() => {
        initialisingContext = true;
        imageCtx
          .setContext({
            context: null,
            image: null,
            images: null,
            highlightedIds: []
          })
          .then(() => {
            initialisingContext = false;
          });
        lastSet = undefined;
        lastImageState = '';
        lastPathname = currentPathname;
      });
    } else if (!lastPathname) {
      // First time loading
      lastPathname = currentPathname;
    }
    return;
  }

  // Create signature of current image state to detect changes
  const currentImageState = JSON.stringify({
    imageId: currentImage?.id || null,
    imagesLength: options.images?.length || 0,
    hasImages: !!options.images
  });

  untrack(() => {
    // Reset context when contextId changes (different feature/task combination) OR image data changes significantly
    const contextChanged = lastSet !== contextId;

    if (contextChanged) {
      initialisingContext = true;
      imageCtx
        .setContext({
          ...options,
          image: getInitialImage()
        })
        .then(() => {
          // Let ImageCtx handle image loading and selection naturally
          // Don't try to apply target images manually after context reset
          initialisingContext = false;
        });
      if (options?.context?.ctxTypeSecondary) {
        imageCtx.refreshImages(targetImageId);
      }
      lastSet = contextId;
      lastImageState = currentImageState;
      lastPathname = page.url.pathname;
    } else if (targetImageId && targetImageId !== lastImageId) {
      if (initialisingContext) {
        imageCtx.setTargetImageId(targetImageId);
      } else {
        // Apply target image if it has changed and we're not initializing
        applyTargetImage(targetImageId);
      }
    } else if (!targetImageId && lastImageId !== null) {
      lastImageId = null;
    }

    // Handle fullscreen mode changes
    if (isFullScreen !== lastFullScreen) {
      imageCtx.setMode(isFullScreen ? 'fullscreen' : 'normal');
      lastFullScreen = isFullScreen;
    }
  });
});
</script>

{@render children()}
