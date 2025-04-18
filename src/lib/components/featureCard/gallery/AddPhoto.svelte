<script lang="ts">
// LIFECYCLE
import { onMount, tick } from 'svelte';
// MOTION
import { fade } from 'svelte/transition';
import { spring } from 'svelte/motion';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Camera,
  PlusCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ExclamationCircle,
  Trash,
  Photo
} from '@steeze-ui/heroicons';
// CONTEXT
import { getFeatureCardContext } from '$lib/context/featureCard.svelte';

// TYPES
type UploadedPhoto = {
  file: File;
  previewUrl: string;
};

type CameraPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied';

// CONTEXT
const featureCardContext = getFeatureCardContext();

// PROPS

// STATE
// Photo gallery state
let showCarousel = $derived(featureCardContext.userData.photos.length > 0);
let currentIndex = $state(0);

// DOM references
let fileInput: HTMLInputElement;
let container: HTMLDivElement | null = $state(null);
let videoElement: HTMLVideoElement | null = $state(null);
let videoContainer: HTMLDivElement | null = $state(null);
let canvasElement: HTMLCanvasElement | null = $state(null);
let containerWidth = $state(0);

// Camera state
let cameraPermissionStatus: CameraPermissionStatus = $state('unknown');
let showPermissionDialog = $state(false);
let showCameraInterface = $state(false);
let cameraStream: MediaStream | null = $state(null);
let isLoadingCamera = $state(false);

// Touch interaction state
let isDragging = $state(false);
let startX = $state(0);
let currentX = $state(0);
let offset = spring(0, {
  stiffness: 0.2,
  damping: 0.8
});

// CONSTANTS
const SWIPE_THRESHOLD = 0.3; // 30% of container width

// PHOTO MANAGEMENT FUNCTIONS
/**
 * Handles file selection from the file input
 */
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const newFiles = Array.from(input.files);

  featureCardContext.addPhotosFromFiles(newFiles);

  // Reset the input to allow selecting the same file again
  input.value = '';
}

/**
 * Removes a photo at the specified index
 */
function removePhoto(photo: UploadedPhoto) {
  // Remove the photo from the context
  featureCardContext.removePhoto(photo);

  // Reset current index if we removed the last photo
  if (currentIndex >= featureCardContext.userData.photos.length) {
    currentIndex = Math.max(0, featureCardContext.userData.photos.length - 1);
  }
}

// ======== CAMERA FUNCTIONALITY ========
/**
 * Checks the current camera permission status
 */
async function checkCameraPermission(): Promise<CameraPermissionStatus> {
  // Check if the browser supports the permissions API
  if (!navigator.permissions || !navigator.permissions.query) {
    // If not supported, we'll have to try accessing the camera to know
    return 'prompt';
  }

  try {
    const result = await navigator.permissions.query({
      name: 'camera' as PermissionName
    });
    return result.state as CameraPermissionStatus;
  } catch (error) {
    console.error('Error checking camera permission:', error);
    return 'prompt';
  }
}

/**
 * Requests camera access and initializes the camera stream
 */
async function requestCameraAccess() {
  try {
    isLoadingCamera = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    // If we get here, permission was granted
    cameraPermissionStatus = 'granted';

    // Initialize camera interface
    cameraStream = stream;
    showCameraInterface = true;
    isLoadingCamera = false;

    // Wait for the next tick to ensure video element is in the DOM
    tick().then(() => {
      if (videoElement && cameraStream) {
        videoElement.srcObject = cameraStream;
        videoElement.play().catch((err) => {
          console.error('Error playing video stream:', err);
        });
      }
    });
  } catch (error) {
    console.error('Error accessing camera:', error);
    cameraPermissionStatus = 'denied';
    isLoadingCamera = false;
    showPermissionDialog = true;
  }
}

/**
 * Captures a photo from the camera stream
 */
function capturePhoto() {
  if (!videoElement || !canvasElement || !cameraStream || !videoContainer) return;

  // Get the original video dimensions
  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;

  // Target aspect ratio (472:384 = 1.229...)
  const targetAspectRatio = videoContainer.offsetWidth / videoContainer.offsetHeight;

  // Calculate dimensions for cropping while maintaining resolution
  let cropWidth,
    cropHeight,
    offsetX = 0,
    offsetY = 0;

  // Current video aspect ratio
  const videoAspectRatio = videoWidth / videoHeight;

  if (videoAspectRatio > targetAspectRatio) {
    // Video is wider than target ratio - crop width, keep full height
    cropHeight = videoHeight;
    cropWidth = cropHeight * targetAspectRatio;
    offsetX = (videoWidth - cropWidth) / 2; // Center the crop horizontally
  } else {
    // Video is taller than target ratio - crop height, keep full width
    cropWidth = videoWidth;
    cropHeight = cropWidth / targetAspectRatio;
    offsetY = (videoHeight - cropHeight) / 2; // Center the crop vertically
  }

  // Set canvas to the cropped dimensions to maintain full resolution
  canvasElement.width = cropWidth;
  canvasElement.height = cropHeight;

  // Draw the cropped region to the canvas
  const ctx = canvasElement.getContext('2d');
  if (!ctx) return;

  // Draw the cropped portion of the video frame to the canvas
  ctx.drawImage(
    videoElement,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight, // Source rectangle (cropped area)
    0,
    0,
    cropWidth,
    cropHeight // Destination rectangle (full canvas)
  );

  // Convert canvas to blob
  canvasElement.toBlob(
    (blob) => {
      if (!blob) return;

      // Create a File object from the blob
      const file = new File([blob], `photo_${Date.now()}.webp`, { type: 'image/webp' });

      // Create a preview URL
      const previewUrl = URL.createObjectURL(blob);

      // Add to photos array
      featureCardContext.addPhoto({ file, previewUrl });

      // Update currentIndex to show the latest photo
      currentIndex = featureCardContext.userData.photos.length - 1;

      // Close camera interface
      closeCameraInterface();
    },
    'image/webp',
    0.9
  ); // Use 90% quality for the WEBP
}

/**
 * Closes the camera interface and stops the stream
 */
function closeCameraInterface() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  showCameraInterface = false;
}

/**
 * Opens the camera or file input based on permission status
 */
async function openCamera() {
  // First check the current permission status
  isLoadingCamera = true;
  cameraPermissionStatus = await checkCameraPermission();

  if (cameraPermissionStatus === 'granted') {
    // If permission is already granted, open camera interface
    await requestCameraAccess();
  } else if (
    cameraPermissionStatus === 'prompt' ||
    cameraPermissionStatus === 'unknown'
  ) {
    // If permission hasn't been decided yet, request access
    showPermissionDialog = true;
    isLoadingCamera = false;
    await requestCameraAccess();
  } else if (cameraPermissionStatus === 'denied') {
    // If permission was previously denied, show message and fallback to file input
    isLoadingCamera = false;
    showPermissionDialog = true;
    setTimeout(() => {
      showPermissionDialog = false;
      fileInput.click();
    }, 2000);
  }
}

/**
 * Falls back to file input when camera is not available
 */
function useFileInput() {
  showPermissionDialog = false;
  fileInput.click();
}

// ======== CAROUSEL FUNCTIONALITY ========
/**
 * Gets the wrapped index for infinite scrolling
 */
function getImageIndex(index: number): number {
  if (featureCardContext.userData.photos.length === 0) return 0;
  // Handle wrapping for infinite scroll
  const length = featureCardContext.userData.photos.length;
  return ((index % length) + length) % length;
}

function getPhotoAtIndex(index: number): UploadedPhoto {
  return featureCardContext.userData.photos[getImageIndex(index)];
}

/**
 * Updates the offset for carousel animation
 */
function updateOffset(x: number) {
  offset.set(x);
}

/**
 * Snaps to the nearest image after dragging
 */
function snapToImage(velocity = 0) {
  const currentOffset = $offset;
  const percentMoved = Math.abs(currentOffset / containerWidth);

  let nextIndex = currentIndex;

  if (percentMoved > SWIPE_THRESHOLD || Math.abs(velocity) > 0.5) {
    if (currentOffset < 0) {
      nextIndex = getImageIndex(currentIndex + 1);
    } else {
      nextIndex = getImageIndex(currentIndex - 1);
    }
  }

  currentIndex = nextIndex;
  offset.set(0, { hard: false });
}

// ======== TOUCH INTERACTION HANDLERS ========
/**
 * Handles the start of a touch event
 */
function handleTouchStart(event: TouchEvent) {
  isDragging = true;
  startX = event.touches[0].clientX;
  currentX = startX;

  // Stop the spring animation while dragging
  offset.stiffness = 1;
}

/**
 * Handles touch movement for carousel swiping
 */
function handleTouchMove(event: TouchEvent) {
  if (!isDragging) return;
  event.preventDefault();

  currentX = event.touches[0].clientX;
  const deltaX = currentX - startX;
  updateOffset(deltaX);
}

/**
 * Handles the end of a touch event
 */
function handleTouchEnd(event: TouchEvent) {
  if (!isDragging) return;

  isDragging = false;

  const endX = event.changedTouches[0].clientX;
  // Calculate velocity (fix for timeStamp issue)
  const deltaTime = event.timeStamp - event.timeStamp || 1;
  const velocity = (endX - currentX) / deltaTime;

  currentX = 0;
  startX = 0;

  // Reset spring stiffness for snap animation
  offset.stiffness = 0.2;
  snapToImage(velocity);
}

/**
 * Cleans up touch state
 */
function cleanup() {
  isDragging = false;
  currentX = 0;
  startX = 0;
  offset.set(0);
}

// ======== LIFECYCLE HOOKS ========
onMount(() => {
  if (container) {
    containerWidth = container.offsetWidth;
  }

  // Check camera permission on mount
  checkCameraPermission().then((status) => {
    cameraPermissionStatus = status;
  });

  // Add touchcancel handler
  container?.addEventListener('touchcancel', cleanup);

  return () => {
    // Clean up on component destruction
    container?.removeEventListener('touchcancel', cleanup);

    // Clean up object URLs
    featureCardContext.clearPhotos();

    // Stop camera stream if active
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
  };
});
</script>

<div class="relative grid h-full w-full grid-cols-1 grid-rows-1">
  <!-- ======== MAIN COMPONENT LAYOUT ======== -->
  {#if isLoadingCamera}
    <!-- Loading Camera State -->
    <div
      id="camera-loading"
      class="absolute inset-0 z-50 flex h-full w-full items-center justify-center bg-black/70"
      out:fade={{ duration: 300 }}>
      <div class="flex flex-col items-center gap-4">
        <div class="loading loading-spinner loading-lg text-primary"></div>
      </div>
    </div>
  {:else if showCameraInterface}
    <!-- Camera Interface -->
    <div
      id="camera-interface"
      class="absolute inset-0 z-50 h-full w-full bg-black caret-transparent"
      in:fade={{ duration: 300 }}
      out:fade={{ duration: 300 }}
      bind:this={videoContainer}>
      <!-- Video stream -->
      <video
        bind:this={videoElement}
        class="h-full w-full object-cover"
        autoplay
        playsinline
        muted></video>

      <!-- Hidden canvas for capturing -->
      <canvas bind:this={canvasElement} class="hidden"></canvas>

      <!-- Camera controls -->
      <div class="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
        <!-- Capture button -->
        <button
          class="btn btn-circle h-16 w-16 bg-base-300"
          onclick={capturePhoto}
          aria-label="Take photo">
          <div class="m-0 h-12 w-12 rounded-full border-[6px] border-primary p-0"></div>
        </button>
      </div>

      <button
        class="absolute right-4 top-4 p-2 text-white"
        onclick={closeCameraInterface}
        aria-label="Close camera">
        <Icon src={XCircle} class="h-6 w-6" />
      </button>
    </div>
  {:else if !showCarousel}
    <!-- Add Photo Button (Initial State) -->
    <div id="add-photo-card" class="flex h-full w-full items-center justify-center">
      <button
        class="btn btn-ghost gap-2 rounded-full bg-base-100 text-white"
        onclick={openCamera}
        aria-label="Add photo">
        <Icon src={Camera} class="h-6 w-6 text-primary" theme="solid" />
        Add photo
      </button>
    </div>
  {:else}
    <!-- Photo Carousel -->
    <div
      id="photo-carousel"
      class="relative h-full w-full caret-transparent"
      bind:this={container}>
      <!-- Image counter -->
      <div
        class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
        {currentIndex + 1} / {featureCardContext.userData.photos.length}
      </div>

      <!-- Remove current photo button -->
      <button
        type="button"
        class="btn btn-circle btn-sm absolute bottom-2 right-2 z-10 h-10 w-10 bg-base-100"
        onclick={() => removePhoto(getPhotoAtIndex(currentIndex))}
        aria-label="Remove photo">
        <Icon src={Trash} class="h-6 w-6 text-error" />
      </button>

      <!-- Carousel container with touch handling -->
      <div
        class="relative h-full w-full touch-pan-y select-none"
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        class:dragging={isDragging}
        style="transform: translateX({$offset}px)">
        {#if featureCardContext.userData.photos.length > 1}
          <!-- Previous Image -->
          <div class="absolute left-0 top-0 h-full w-full opacity-0">
            <img
              src={getPhotoAtIndex(currentIndex - 1).previewUrl}
              alt="Previous evidence"
              class="h-full w-full object-contain" />
          </div>
        {/if}

        <!-- Current Image -->
        <div class="absolute left-0 top-0 h-full w-full">
          <img
            src={getPhotoAtIndex(currentIndex).previewUrl}
            alt="Evidence"
            class="h-full w-full object-contain" />
        </div>

        {#if featureCardContext.userData.photos.length > 1}
          <!-- Next Image -->
          <div class="absolute left-0 top-0 h-full w-full opacity-0">
            <img
              src={getPhotoAtIndex(currentIndex + 1).previewUrl}
              alt="Next evidence"
              class="h-full w-full object-contain" />
          </div>

          <!-- Navigation buttons - hidden on mobile -->
          <div class="hidden md:block">
            <button
              class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onclick={() => {
                currentIndex = getImageIndex(currentIndex - 1);
                offset.set(0);
              }}
              aria-label="Previous image">
              <Icon src={ChevronLeft} class="h-4 w-4" />
            </button>

            <button
              class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onclick={() => {
                currentIndex = getImageIndex(currentIndex + 1);
                offset.set(0);
              }}
              aria-label="Next image">
              <Icon src={ChevronRight} class="h-4 w-4" />
            </button>
          </div>
        {/if}
      </div>

      <!-- Add another photo button - moved to bottom center and restyled -->
      <div class="absolute bottom-4 left-0 right-0 flex justify-center">
        <button
          class="btn btn-ghost gap-2 rounded-full bg-base-100 text-white"
          onclick={openCamera}
          aria-label="Add another photo">
          <Icon src={Camera} class="h-6 w-6 text-primary" theme="solid" />
          Add photo
        </button>
      </div>
    </div>
  {/if}

  <!-- ======== MODALS AND DIALOGS ======== -->
  <!-- Camera permission dialog -->
  {#if showPermissionDialog && !isLoadingCamera}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="max-w-md rounded-lg bg-base-100 p-6 shadow-xl">
        {#if cameraPermissionStatus === 'denied'}
          <div class="mb-4 flex items-center gap-3 text-error">
            <Icon src={ExclamationCircle} class="h-6 w-6" />
            <h3 class="text-lg font-semibold">Camera Permission Denied</h3>
          </div>
          <p class="mb-4">
            Camera access was denied. You can still upload photos from your device.
          </p>
          <div class="flex justify-end gap-2">
            <button class="btn btn-primary" onclick={useFileInput}>
              <Icon src={Photo} class="mr-2 h-5 w-5" />
              Choose File
            </button>
          </div>
        {:else}
          <!-- Show a loader for 1s before showing the permission dialog -->
          <div class="mb-4 flex items-center gap-3 text-info">
            <Icon src={Camera} class="h-6 w-6" />
            <h3 class="text-lg font-semibold">Camera Permission</h3>
          </div>
          <p class="mb-4">
            Please allow camera access when prompted by your browser. This is needed to
            take photos.
          </p>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost" onclick={useFileInput}>
              Use File Instead
            </button>
            <button
              class="btn btn-primary"
              onclick={() => (showPermissionDialog = false)}>
              OK
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- ======== HIDDEN INPUTS ======== -->
<input
  name="photos"
  type="file"
  accept="image/*"
  multiple
  class="hidden"
  bind:this={fileInput}
  onchange={handleFileSelect} />

<input
  name="photosEnvironment"
  type="file"
  accept="image/*"
  capture="environment"
  class="hidden"
  onchange={handleFileSelect} />

<style>
/* Smooth transitions for non-dragging state */
div:not(.dragging) {
  transition: transform 0.3s ease-out;
}
</style>
