<script lang="ts">
  import { fade, crossfade } from 'svelte/transition';

// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { getHierarchicalResourceState as getResourceState } from '$lib/context/resources.svelte';
// COMPONENTS
import Dropzone from 'svelte-file-dropzone';
import Header from '$lib/components/forms/extra/Header.svelte';
import Image from '$lib/components/common/Image.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, ExclamationCircle, Trash } from '@steeze-ui/heroicons';
// TYPES
import type { EntityRouter, SectionProps, FormField, GetImageAPI } from '$lib/types';

let sectionProps: SectionProps = $props();

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;
const resourceState = getResourceState();

let activeImage = $state(null);
let activeResource = $state(null);
let activeResourceId = $state(null);
let imageSrc = $derived(
  `https://res.cloudinary.com/${activeImage?.env}/image/upload/c_fit,h_1000,w_1000/v${activeImage?.version}/${activeImage?.publicId}`
);

let isLoading = $state(false);

// Setup crossfade
const [send, receive] = crossfade({
  duration: 500,
  fallback: fade
});

$effect(() => {
  // GET IMAGE for ENTITY
  if (routerState.resource && routerState.entity) {
    if (routerState.resource !== activeResource || resourceState.state[routerState.resource].id !== activeResourceId) {
      let url = `/api/images?${routerState.resource}Id=${resourceState.state[routerState.resource].id}`;
      fetch(url)
      .then((res) => {
        return res.json()
      })
      .then((data) => {
        if (data.length > 0) {
          activeImage = data[0];
        }
        else {
          activeImage = null;
        }
        activeResource = routerState.resource;
        activeResourceId = resourceState.state[routerState.resource].id;
      }).catch((err) => {
        console.error('error', err);
      })
    }
  }
});

let files = $state({
  accepted: [],
  rejected: []
});

// DOM
let inputElement = $state<HTMLInputElement>();
let isFileDialogActive = $state(false);

// Add these types for tracking upload status
type UploadStatus = 'uploading' | 'error' | 'done';
type ImageUploadState = {
  file: File;
  status: UploadStatus;
  retries: number;
};

let uploadQueue = $state<ImageUploadState[]>([]);
let rejectedImages = $state<File[]>([]);

// Add state for tracking upload
let isUploading = $state(false);

function handleFilesSelect(event: {
  detail: { acceptedFiles: File[]; fileRejections: File[] };
}) {
  const newFiles = event.detail.acceptedFiles.map((file) => ({
    file,
    status: 'uploading' as UploadStatus,
    retries: 0
  }));

  uploadQueue = [...uploadQueue, ...newFiles];
  rejectedImages = [...rejectedImages, ...event.detail.fileRejections];

  // Start upload for each new file
  newFiles.forEach((fileState) => handleUpload(fileState));
}

// Update handleUpload to use the sorting function
const handleUpload = async (fileState: ImageUploadState) => {
  if (!resourceState.state.organisation && !resourceState.state.project) return;
  isLoading = true;

  let folder = resourceState.state.organisation?.code ?? 'misc';
  let public_id = resourceState.state[routerState.resource]?.id;
  if (routerState.resource === 'project') {
    folder = `${folder}/${resourceState.state.project?.code ?? 'misc'}`;
  }


  try {
    const signResponse = await fetch('/api/cloudinary', {
      method: 'POST',
      body: JSON.stringify({ paramsToSign: { folder, public_id } })
    });
    const signData = await signResponse.json();

    const url = `https://api.cloudinary.com/v1_1/${signData.cloudname}/auto/upload`;
    const formData = new FormData();

    formData.append('file', fileState.file);
    formData.append('public_id', public_id);
    formData.append('folder', folder);
    formData.append('api_key', signData.apikey);
    formData.append('timestamp', signData.timestamp);
    formData.append('signature', signData.signature);

    // Upload to Cloudinary
    const cloudinaryResponse = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const cloudinaryData = await cloudinaryResponse.json();

    // Prepare the image data for our database
    const imageData = {
      cdn: 'cloudinary' as const,
      env: import.meta.env.VITE_CLOUDINARY_ENV,
      cdnId: cloudinaryData.asset_id,
      publicId: cloudinaryData.public_id,
      version: cloudinaryData.version,
      originalFilename: cloudinaryData.original_filename,
      originalExtension: cloudinaryData.format,
      originalWidth: cloudinaryData.width,
      originalHeight: cloudinaryData.height,
      capturedAt: cloudinaryData.created_at,
      // RELATED ENTITY
      refType: routerState.resource,
      refId: resourceState.state[routerState.resource]?.id
    };

    // Save to our database
    const dbResponse = await fetch('/api/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(imageData)
    });

    if (!dbResponse.ok) {
      throw new Error('Failed to save image to database');
    }

    // Get the saved image data
    const savedImage = await dbResponse.json();
    // Remove from upload queue
    uploadQueue = uploadQueue.filter((item) => item.file !== fileState.file);

    // Select the new image
    selectActiveImage(savedImage);
    isLoading = false;
  } catch (error) {
    console.error('Failed to process image:', error);
    // Update status to error in upload queue
    uploadQueue = uploadQueue.map((item) =>
      item.file === fileState.file ? { ...item, status: 'error' as UploadStatus } : item
    );
  }
};

// UTILS

// Add hover handler
const selectActiveImage = (image: GetImageAPI) => {
  activeImage = image;
};
</script>

<div
  class="relative z-10 flex h-[calc(100vh-196px)] w-full flex-col overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500/70 to-fuchsia-800/70 p-0">
  <Header {...sectionProps} />
  <main class="relative w-full flex-grow overflow-hidden rounded-b-2xl bg-base-300">
    <div class="absolute inset-0 h-full w-full flex-none">
      <Dropzone
        accept={['image/*']}
        on:drop={handleFilesSelect}
        on:select={handleFilesSelect}
        multiple={false}
        class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
        disableDefaultStyles={true}
        bind:inputElement>
        {#if !activeImage}
          {#if isLoading}
            <div class="flex flex-col items-center justify-center">
              <span class="loading loading-spinner loading-md text-primary"></span>
              <span class="mx-auto mt-2 text-sm">Uploading...</span>
            </div>
          {:else}
            <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
            <span class="mx-auto pb-6 text-sm">Drop image</span>
          {/if}
        {:else}
          {#key activeImage.id}
            <!-- Background Image -->
            <div
              class="absolute transition-opacity duration-1500 ease-in-out inset-0 z-10 h-full w-full rounded-b-2xl bg-neutral opacity-30"
              class:opacity-10={isLoading}
              in:receive={{ key: `${activeImage.id}` }}
              out:send={{ key: `${activeImage.id}` }}>
              <Image
                src={imageSrc}
                alt="Background Image"
                class="h-full w-full rounded-b-2xl text-base-100 blur-sm"
                layout="cover"
                showLoading={false}
                showError={false} />
            </div>
            <!-- Main Image -->
            <div
              class="absolute z-20 transition-all duration-1500 ease-in-out h-full w-full overflow-hidden rounded-2xl p-4 opacity-100"
              class:opacity-50={isLoading}
              in:receive={{ key: `${activeImage.id}` }}
              out:send={{ key: `${activeImage.id}` }}>
              <Image
                class="mx-auto h-full overflow-hidden rounded-xl text-base-100"
                src={imageSrc}
                alt="Feature Image"
                layout="contain"
                showLoading={false}
                showError={false} />
            </div>
          {/key}
        {/if}
      </Dropzone>
    </div>
  </main>
</div>
