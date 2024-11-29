<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationCircle } from '@steeze-ui/heroicons';
import { retryUpload } from '$lib/images/index.svelte';
import { fade } from 'svelte/transition';
import type { GetImageAPI, ImageUploadState, ResourceType, Id } from '$lib/types';

type Props = {
  fileState: ImageUploadState;
  refs: { resource: ResourceType; entity: Id };
};

let { fileState, refs }: Props = $props();
</script>

<div
  class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <Icon src={ExclamationCircle} class="h-8 w-8 text-error" />
  <button
    class="btn btn-error btn-sm mt-2"
    onclick={() => retryUpload({ fileState, refs })}>
    Retry
  </button>
</div>
