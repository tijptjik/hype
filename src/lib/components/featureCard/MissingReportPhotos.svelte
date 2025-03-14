<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { PlusCircle, XCircle } from '@steeze-ui/heroicons';

// TYPES
type UploadedPhoto = {
  file: File;
  previewUrl: string;
};

// STATE
let photos = $state<UploadedPhoto[]>([]);
let fileInput: HTMLInputElement;
let { onPhotosChange } = $props<{
  onPhotosChange: (photos: File[]) => void;
}>();

// FUNCTIONS
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;

  const newFiles = Array.from(input.files);

  // Create preview URLs for each file
  const newPhotos = newFiles.map((file) => ({
    file,
    previewUrl: URL.createObjectURL(file)
  }));

  // Add new photos to the existing array
  photos = [...photos, ...newPhotos];

  // Reset the input to allow selecting the same file again
  input.value = '';

  // Notify parent component
  onPhotosChange(photos.map((p) => p.file));
}

function removePhoto(index: number) {
  // Release the object URL to avoid memory leaks
  URL.revokeObjectURL(photos[index].previewUrl);

  // Remove the photo from the array
  photos = photos.filter((_, i) => i !== index);

  // Notify parent component
  onPhotosChange(photos.map((p) => p.file));
}

// Clean up object URLs when component is destroyed
$effect.root(() => {
  return () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  };
});
</script>

<div class="mt-4">
  <label class="mb-2 block font-medium text-white"> Upload Evidence Photos </label>

  <div class="flex flex-wrap gap-2">
    {#each photos as photo, index}
      <div class="relative h-24 w-24 overflow-hidden rounded-md">
        <img src={photo.previewUrl} alt="Evidence" class="h-full w-full object-cover" />
        <button
          type="button"
          class="absolute right-1 top-1 rounded-full bg-black bg-opacity-50 p-1 text-white"
          onclick={() => removePhoto(index)}>
          <Icon src={XCircle} class="h-4 w-4" />
        </button>
      </div>
    {/each}

    <button
      type="button"
      class="flex h-24 w-24 flex-col items-center justify-center rounded-md border border-dashed border-gray-500 bg-gray-800 text-white"
      onclick={() => fileInput.click()}>
      <Icon src={PlusCircle} class="h-6 w-6" />
      <span class="mt-1 text-xs">Add Photo</span>
    </button>
  </div>

  <input
    type="file"
    accept="image/*"
    multiple
    class="hidden"
    bind:this={fileInput}
    onchange={handleFileSelect} />
</div>
