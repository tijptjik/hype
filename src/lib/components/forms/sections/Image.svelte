<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Header from '$lib/components/forms/extra/Header.svelte';
import PhotoFrame from '$lib/components/common/PhotoFrame.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
import Dropzone from 'svelte-file-dropzone';
import Uploading from '$lib/components/images/gallery/overlays/Uploading.svelte';
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';
// TYPES
import type { SectionProps, Image } from '$lib/types';

let sectionProps: SectionProps & { image: Image | null } = $props();

// CONTEXT
let imageCtx = getImageCtx();

// STATE
let showErrorOverlay = $state(false);
let errorMessage = $state('');

// Check if we're currently uploading
let isUploading = $derived(
  ['previewUploading', 'previewReplacement'].includes(imageCtx.viewerState)
);

// Dropzone handlers
function handleFilesSelect(
  e: CustomEvent<{ acceptedFiles: File[]; fileRejections: any[] }>
) {
  const { acceptedFiles, fileRejections } = e.detail;

  // Reset error state
  showErrorOverlay = false;
  errorMessage = '';

  // Use the image context to handle file selection
  // If there's an existing image, pass it for replacement
  imageCtx.handleFilesSelect(
    acceptedFiles,
    fileRejections,
    {
      onSuccess: (savedImage) => {
        // For fresh uploads (no existing image), ensure the uploaded image becomes active
        if (!sectionProps.image && savedImage) {
          imageCtx.setActiveImage(savedImage);
        }
      },
      onError: () => {
        errorMessage = m.error_message__upload_failed();
        showErrorOverlay = true;

        // Reset active image if this was a fresh upload (no existing image)
        if (!sectionProps.image) {
          imageCtx.resetActiveImage();
        }

        // Auto-hide error after 3 seconds
        setTimeout(() => {
          showErrorOverlay = false;
        }, 3000);
      }
    },
    sectionProps.image || undefined // Pass existing image for replacement, or undefined for new upload
  );
}
</script>

<div class="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-2xl">
  <Header {...sectionProps} />
  <main class="relative mt-2 w-full flex-grow overflow-hidden rounded-2xl bg-base-300">
    <div class="absolute inset-0 h-full w-full flex-none">
      <Dropzone
        accept={['image/*']}
        multiple={false}
        class="{isUploading
          ? ''
          : 'group'} flex h-full w-full flex-col justify-center gap-2 rounded-b-2xl bg-base-300 text-center align-middle transition-colors"
        disableDefaultStyles={true}
        disabled={isUploading}
        on:drop={handleFilesSelect}>
        {#if sectionProps.image || imageCtx.activePreview || imageCtx.activeImage}
          <!-- Existing image, upload preview, or uploaded image -->
          <PhotoFrame
            class="h-full w-full rounded-b-2xl"
            layout="contain"
            mode="standalone" />
          <!-- Replace overlay that appears on hover (hidden during upload) -->
          {#if !isUploading && sectionProps.image}
            <div
              class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 flex items-center justify-center rounded-xl border-4 border-dashed border-transparent opacity-0 transition-all delay-200 duration-300 group-hover:border-primary group-hover:opacity-100">
              <div
                class="h-400 w-400 rounded-xl bg-black/20 p-12 opacity-0 transition-opacity delay-[3s] duration-300 group-hover:bg-black/40 group-hover:opacity-100">
                <div class="text-center text-white">
                  <Icon src={Photo} class="mx-auto mb-2 h-8 w-8" />
                  <span class="text-md font-medium"> {m.close_odd_hornet_feast()}</span>
                </div>
              </div>
            </div>
          {/if}
        {:else}
          <!-- Empty state for new image -->
          <div
            class="border-offset-2 pointer-events-none absolute inset-0 z-50 m-4 rounded-xl border-4 border-dashed border-transparent transition-colors delay-500 group-hover:border-primary">
          </div>
          <div class="flex h-full flex-col items-center justify-center">
            <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
            <span class="mx-auto pb-6 text-sm">{m.born_plain_bulldog_stop()}</span>
          </div>
        {/if}

        <!-- Upload overlay with loading ring -->
        {#if isUploading}
          <div class="absolute inset-0 z-[60] rounded-b-2xl">
            <Uploading />
          </div>
        {/if}

        <!-- Error overlay for failed uploads -->
        {#if showErrorOverlay}
          <div
            class="absolute inset-0 z-[60] flex items-center justify-center rounded-b-2xl bg-error text-white transition-opacity duration-300"
            transition:fade>
            <div class="text-center">
              <Icon src={Photo} class="mx-auto mb-2 h-8 w-8" />
              <span class="text-md font-medium">{errorMessage}</span>
            </div>
          </div>
        {/if}
      </Dropzone>
    </div>
  </main>
</div>
