<script lang="ts">
import { getForm } from '$lib/context/forms.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo } from '@steeze-ui/heroicons';
// COMPONENTS
import { CldImage } from 'svelte-cloudinary';
import Dropzone from 'svelte-file-dropzone';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { Image } from '$lib/types';
import type { EntityRouter } from '$lib/types';

// CONFIG
const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'evidence',
  'undefined'
];

// CONTEXT
const routerState = getRouterState() as EntityRouter;

// STATE : CONTEXT
const { form } = getForm(routerState.resource, routerState.entity);

// STATE : DERIVED
let images: Image[] = $state([]);
let selectedImages: File[] = $state([]);
let rejectedImages: File[] = $state([]);

$effect(async () => {
  const response = await fetch(`/api/images?featureId=${routerState.entity}`);
  if (response.ok) {
    const fetchedImages = await response.json();
    // Sort images by intent order and publication status
    images = fetchedImages.sort((a: Image, b: Image) => {
      // First sort by publication status
      if (a.isPublished !== b.isPublished) {
        return a.isPublished ? -1 : 1;
      }
      // Then sort by intent order
      return intentOrder.indexOf(a.intent) - intentOrder.indexOf(b.intent);
    });
  }
});

function handleFilesSelect(event: {
  detail: { acceptedFiles: File[]; fileRejections: File[] };
}) {
  selectedImages = [...selectedImages, ...event.detail.acceptedFiles];
  rejectedImages = [...rejectedImages, ...event.detail.fileRejections];
  // Handle file upload logic here
  handleUpload()
}

const handleUpload = async () => {
  const signResponse = await fetch('/api/cloudinary', {
    method: 'POST',
    body: JSON.stringify({ paramsToSign: selectedImages })
  });
  const signData = await signResponse.json();

  const url = `https://api.cloudinary.com/v1_1/${signData.cloudname}/auto/upload`;
  const form = document.querySelector('form');

  const formData = new FormData();

  // Append parameters to the form data. The parameters that are signed using
  // the signing function (signuploadform) need to match these.
  for (let i = 0; i < selectedImages.length; i++) {
    let file = selectedImages[i];
    formData.append('file', file);
    formData.append('api_key', signData.apikey);
    formData.append('timestamp', signData.timestamp);
    formData.append('signature', signData.signature);
    // formData.append('eager', 'c_pad,h_300,w_400|c_crop,h_200,w_260');
    // TODO: Add to Organisation/Project folder
    // formData.append('folder', 'ghostsigns');

    fetch(url, {
      method: 'POST',
      body: formData
    })
      .then((response) => {
        return response.text();
      })
      .then((data) => {
        console.log(JSON.parse(data));
      });
  }
};
</script>

<section class="w-full space-y-4">
  <header class="flex items-center justify-between">
    <h3 class="text-lg font-semibold">Gallery</h3>
  </header>

  <main class="relative w-full overflow-x-auto">
    <div class="flex gap-4 pb-4">
      {#each images as image, i (image.id)}
        {@const isFirstUnpublished =
          i > 0 && images[i - 1].isPublished && !image.isPublished}

        {#if isFirstUnpublished}
          <div class="h-[200px] w-0.5 bg-primary"></div>
        {/if}

        <div class="relative" class:opacity-80={!image.isPublished}>
          <CldImage
            width="200"
            height="200"
            src={image.publicId}
            alt="{image.intent} image of {$form.name}"
            crop="fill"
            class="rounded-lg object-cover" />
          <div class="absolute bottom-0 left-0 right-0 flex justify-center p-2">
            <span class="rounded bg-base-100/80 px-2 py-1 text-sm">
              {image.intent}
            </span>
          </div>
        </div>
      {/each}

      <!-- Dropzone -->
      <div class="h-[200px] w-[200px] shrink-0">
        <Dropzone
          accept={['image/*']}
          on:drop={handleFilesSelect}
          class="flex h-full w-full flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-base-content/10 bg-base-100/50 text-center align-middle transition-colors hover:border-primary"
          disableDefaultStyles={true}>
          <button class="btn btn-sm mx-auto w-32">Select files</button>
          <Icon src={Photo} class="mx-auto mt-4 h-8 w-8" />
          <span class="mx-auto pb-6 text-sm">Drop images</span>
        </Dropzone>
      </div>
      {#if selectedImages.length > 0}
        {#each selectedImages as image}
          <img
            src={`${URL.createObjectURL(image)}`}
            alt=""
            class="h-[200px] w-[200px] rounded-lg object-cover" />
        {/each}
      {/if}
    </div>
  </main>
</section>

<style>
/* Hide scrollbar but keep functionality */
.overflow-x-auto {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.overflow-x-auto::-webkit-scrollbar {
  display: none; /* Chrome, Safari and Opera */
}
</style>
