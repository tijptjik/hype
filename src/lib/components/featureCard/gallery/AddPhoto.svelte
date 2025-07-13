<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// LIFECYCLE
import { onMount, tick } from 'svelte';
// MOTION
import { fade } from 'svelte/transition';
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Camera,
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
import type { UploadedPhoto, CameraPermissionStatus } from '$lib/types';
// CONTEXT
const cardCtx = getFeatureCardContext();

// STATE
// Photo gallery state
let showCarousel = $derived(cardCtx.userData.photos.length > 0);
let currentIndex = $state(0);

// DOM references
let fileInput: HTMLInputElement;
let videoElement: HTMLVideoElement | null = $state(null);
let videoContainer: HTMLDivElement | null = $state(null);
let canvasElement: HTMLCanvasElement | null = $state(null);

// Camera state
let cameraPermissionStatus: CameraPermissionStatus = $state('unknown');
let showPermissionDialog = $state(false);
let showCameraInterface = $state(false);
let cameraStream: MediaStream | null = $state(null);
let isLoadingCamera = $state(false);

// Component visibility state
let showComponent = $state(false);

// INITIALIZE CAMERA IF NEEDED
$effect(() => {
  openCamera();
});

// PHOTO MANAGEMENT FUNCTIONS
/**
 * Handles file selection from the file input.
 * Adds selected files to the photo gallery via the feature card context.
 * @param {Event} event - The file input change event, where `event.target` is an HTMLInputElement.
 */
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const newFiles = Array.from(input.files);

  cardCtx.addPhotosFromFiles(newFiles);

  // Reset the input to allow selecting the same file again
  input.value = '';
}

/**
 * Removes a specified photo from the gallery.
 * Updates the current index if necessary.
 * @param {UploadedPhoto} photo - The photo object to remove.
 */
function removePhoto(photo: UploadedPhoto) {
  // Remove the photo from the context
  cardCtx.removePhoto(photo);

  // Reset current index if we removed the last photo
  if (currentIndex >= cardCtx.userData.photos.length) {
    currentIndex = Math.max(0, cardCtx.userData.photos.length - 1);
  }
}

// ======== CAMERA FUNCTIONALITY ========
/**
 * Checks the current camera permission status using the Permissions API.
 * @returns {Promise<CameraPermissionStatus>} A promise that resolves to the current permission status:
 * 'granted', 'denied', 'prompt', or 'unknown' if the API is not fully supported.
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
 * Requests camera access from the user and initializes the camera stream.
 * Sets the camera permission status and handles UI updates based on success or failure.
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
 * Captures a photo from the live camera stream.
 * The image is cropped to match the video container's aspect ratio,
 * converted to a WEBP File object, and then added to the photo gallery.
 * The camera interface is closed after capture.
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
      cardCtx.addPhoto({ file, previewUrl });

      // Update currentIndex to show the latest photo
      currentIndex = cardCtx.userData.photos.length - 1;

      // Close camera interface
      closeCameraInterface();
    },
    'image/webp',
    0.9
  ); // Use 90% quality for the WEBP
}

/**
 * Closes the camera interface and stops all tracks of the active media stream.
 */
function closeCameraInterface() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  showCameraInterface = false;
}

/**
 * Initiates the process of opening the camera.
 * It checks permissions and then either:
 * - Requests camera access if permission is 'granted' or 'prompt'.
 * - Shows a permission denied message and falls back to file input if 'denied'.
 * If the feature card is in `Display` mode, it switches to `AddPhoto` mode.
 */
async function openCamera() {
  if (cardCtx.getMode() === FeatureCardMode.Display) {
    cardCtx.setMode(FeatureCardMode.AddPhoto);
  }

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
 * Triggers a click on the hidden file input element.
 * This serves as a fallback mechanism when camera access is not available or has been denied.
 */
function useFileInput() {
  showPermissionDialog = false;
  fileInput.click();
}

// ======== CAROUSEL FUNCTIONALITY ========
/**
 * Calculates a wrapped index for an array, enabling "infinite" carousel scrolling.
 * @param {number} index - The raw index, which can be negative or exceed array bounds.
 * @returns {number} The wrapped index within the bounds of the `cardCtx.userData.photos` array. Returns 0 if the array is empty.
 */
function getImageIndex(index: number): number {
  if (cardCtx.userData.photos.length === 0) return 0;
  // Handle wrapping for infinite scroll
  const length = cardCtx.userData.photos.length;
  return ((index % length) + length) % length;
}

/**
 * Retrieves a photo from the gallery at a given raw index, which is wrapped internally.
 * @param {number} index - The raw index from which to retrieve the photo.
 * @returns {UploadedPhoto} The photo object at the calculated wrapped index.
 */
function getPhotoAtIndex(index: number): UploadedPhoto {
  return cardCtx.userData.photos[getImageIndex(index)];
}

// ======== LIFECYCLE HOOKS ========
onMount(() => {
  // Delay component visibility by 500ms
  setTimeout(() => {
    showComponent = true;
  }, 500);

  // Check camera permission on mount
  checkCameraPermission().then((status) => {
    cameraPermissionStatus = status;
  });

  return () => {
    // Clean up object URLs
    cardCtx.clearPhotos();

    // Stop camera stream if active
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
  };
});
</script>

<div class="relative grid h-full w-full grid-cols-1 grid-rows-1">
  <!-- ======== MAIN COMPONENT LAYOUT ======== -->
  {#if showComponent}
    <div in:fade={{ duration: 300 }}>
      {#if isLoadingCamera}
        <!-- Loading Camera State -->
        <div
          id="camera-loading"
          class="absolute inset-0 z-50 flex h-full w-full items-center justify-center bg-black/70"
          out:fade={{ duration: 300 }}>
          <div class="flex flex-col items-center gap-4">
            <div class="loading loading-ring loading-lg text-primary"></div>
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
              class="btn btn-circle h-16 w-16 bg-base-300 focus:outline-none focus:ring-2 focus:ring-primary"
              onclick={capturePhoto}
              aria-label="Take photo">
              <div class="m-0 h-12 w-12 rounded-full border-[5px] border-[#4987E2] p-0">
                <div class="flex h-full flex-col items-center justify-center gap-[2px]">
                  <div class="h-[2px] w-4 bg-[#4987E2]/40"></div>
                  <div class="h-[2px] w-4 bg-[#4987E2]/40"></div>
                  <div class="h-[2px] w-4 bg-[#4987E2]/40"></div>
                </div>
              </div>
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
            class="btn btn-ghost gap-2 rounded-full bg-base-100 text-white focus:outline-none focus:ring-2 focus:ring-primary"
            onclick={openCamera}
            aria-label={m.honest_fluffy_falcon_enjoy()}>
            <Icon src={Camera} class="h-6 w-6 text-primary" theme="solid" />
            {m.honest_fluffy_falcon_enjoy()}
          </button>
        </div>
      {:else}
        <!-- Photo Carousel -->
        <div id="photo-carousel" class="relative h-full w-full caret-transparent">
          <!-- Image counter -->
          {#if cardCtx.userData.photos.length > 1}
            <div
              class="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
              {currentIndex + 1} / {cardCtx.userData.photos.length}
            </div>
          {/if}

          <!-- Remove current photo button -->
          <button
            type="button"
            class="btn btn-circle btn-sm absolute bottom-2 right-2 z-10 h-10 w-10 bg-base-100"
            onclick={() => removePhoto(getPhotoAtIndex(currentIndex))}
            aria-label="Remove photo">
            <Icon src={Trash} class="h-6 w-6 text-error" />
          </button>

          <!-- Carousel container with touch handling -->
          <div class="relative h-full w-full touch-pan-y select-none">
            {#if cardCtx.userData.photos.length > 1}
              <!-- Previous Image -->
              <div class="absolute left-0 top-0 h-full w-full opacity-0">
                <img
                  src={getPhotoAtIndex(currentIndex - 1).previewUrl}
                  alt={m.slimy_helpful_shad_vent() + ' ' + m.hour_tame_ibex_absorb()}
                  class="h-full w-full object-contain" />
              </div>
            {/if}

            <!-- Current Image -->
            <div class="absolute left-0 top-0 h-full w-full">
              <img
                src={getPhotoAtIndex(currentIndex).previewUrl}
                alt={m.hour_tame_ibex_absorb()}
                class="h-full w-full object-contain" />
            </div>

            {#if cardCtx.userData.photos.length > 1}
              <!-- Next Image -->
              <div class="absolute left-0 top-0 h-full w-full opacity-0">
                <img
                  src={getPhotoAtIndex(currentIndex + 1).previewUrl}
                  alt={m.curly_flaky_panther_mop() + ' ' + m.hour_tame_ibex_absorb()}
                  class="h-full w-full object-contain" />
              </div>

              {#if cardCtx.userData.photos.length > 1}
                <!-- Navigation buttons - hidden on mobile -->
                <div class="hidden md:block">
                  <button
                    class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    onclick={() => {
                      currentIndex = getImageIndex(currentIndex - 1);
                    }}
                    aria-label="Previous image">
                    <Icon src={ChevronLeft} class="h-4 w-4" />
                  </button>

                  <button
                    class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    onclick={() => {
                      currentIndex = getImageIndex(currentIndex + 1);
                    }}
                    aria-label="Next image">
                    <Icon src={ChevronRight} class="h-4 w-4" />
                  </button>
                </div>
              {/if}
            {/if}
          </div>
          <!-- Add another photo button - moved to bottom center and restyled -->
          {#if cardCtx.userData.photos.length > 1}
            <div class="absolute bottom-4 left-0 right-0 flex justify-center">
              <button
                class="btn btn-ghost gap-2 rounded-full bg-base-100 text-white"
                onclick={openCamera}
                aria-label={m.honest_fluffy_falcon_enjoy()}>
                <Icon src={Camera} class="h-6 w-6 text-primary" theme="solid" />
                {m.honest_fluffy_falcon_enjoy()}
              </button>
            </div>
          {/if}
        </div>
      {/if}
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
            <h3 class="text-lg font-semibold">{m.camera__access_denied()}</h3>
          </div>
          <p class="mb-4">
            {m.camera__access_denied_note()}
          </p>
          <div class="flex justify-end gap-2">
            <button class="btn btn-primary" onclick={useFileInput}>
              <Icon src={Photo} class="mr-2 h-5 w-5" />
              {m.camera__choose_file()}
            </button>
          </div>
        {:else}
          <!-- Show a loader for 1s before showing the permission dialog -->
          <div class="mb-4 flex items-center gap-3 text-info">
            <Icon src={Camera} class="h-6 w-6" />
            <h3 class="text-lg font-semibold">{m.camera__permission()}</h3>
          </div>
          <p class="mb-4">{m.camera__permission_note()}</p>
          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost" onclick={useFileInput}>
              {m.camera_upload_file_instead()}
            </button>
            <button
              class="btn btn-primary"
              onclick={() => (showPermissionDialog = false)}>
              {m.ok()}
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
