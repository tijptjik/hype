<script lang="ts">
import Uploading from './overlays/Uploading.svelte';
import UploadError from './overlays/UploadError.svelte';
import type { ImageUploadState } from '$lib/types';

type Props = {
  fileObject: ImageUploadState;
};

let { fileObject }: Props = $props();
</script>

<img
  src={URL.createObjectURL(fileObject.file)}
  alt=""
  class="h-full w-full rounded-lg object-cover" />

<!-- Loading overlay -->
{#if fileObject.status === 'uploading'}
  <Uploading />
{/if}

<!-- Error overlay -->
{#if fileObject.status === 'error'}
  <UploadError {fileObject} />
{/if}
