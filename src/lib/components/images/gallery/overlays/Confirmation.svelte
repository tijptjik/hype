<script lang="ts">
import { fade } from 'svelte/transition';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';
// TYPES
import type { GetImageAPI } from '$lib/types';

const imageService = getImageService();

type Props = {
  image: GetImageAPI;
};

let { image }: Props = $props();
</script>

<div
  class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-base-100/50 p-4 text-center backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <p class="text-sm">Delete this image?</p>
  <div class="flex gap-2">
    <button
      class="btn btn-error btn-sm"
      onclick={(e) => {
        imageService.handleConfirmDelete(e, image);
      }}>
      Delete
    </button>
    <button
      class="btn btn-ghost btn-sm"
      onclick={(e) => {
        imageService.handleCancelDelete(e, image);
      }}>
      Cancel
    </button>
  </div>
</div>
