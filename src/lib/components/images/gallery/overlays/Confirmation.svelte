<script lang="ts">
import { fade } from 'svelte/transition';
import { confirmDelete, cancelDelete } from '$lib/images/index.svelte';
import type { GetImageAPI, ImageEditRefs } from '$lib/types';

type Props = {
  image: GetImageAPI;
  refs: ImageEditRefs;
};

let { image, refs }: Props = $props();
</script>

<div
  class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-base-100/50 p-4 text-center backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <p class="text-sm">Delete this image?</p>
  <div class="flex gap-2">
    <button class="btn btn-error btn-sm" onclick={(e) => confirmDelete(e, image, refs)}>
      Delete
    </button>
    <button class="btn btn-ghost btn-sm" onclick={(e) => cancelDelete(e, image)}>
      Cancel
    </button>
  </div>
</div>
