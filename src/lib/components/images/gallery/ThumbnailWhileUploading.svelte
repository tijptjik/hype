<script lang="ts">
import Uploading from './overlays/Uploading.svelte';
import UploadError from './overlays/UploadError.svelte';
import type { ImageUploadState } from '$lib/types';

type Props = {
  fileState: ImageUploadState;
  refs: any;
};

let { fileState, refs }: Props = $props();
</script>

<img
  src={URL.createObjectURL(fileState.file)}
  alt=""
  class="h-full w-full rounded-lg object-cover" />

<!-- Loading overlay -->
{#if fileState.status === 'uploading'}
  <Uploading />
{/if}

<!-- Error overlay -->
{#if fileState.status === 'error'}
  <UploadError {fileState} {refs} />
{/if}
