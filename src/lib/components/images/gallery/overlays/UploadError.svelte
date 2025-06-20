<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationCircle } from '@steeze-ui/heroicons';
import { fade } from 'svelte/transition';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
// TYPES
import type { ImageUpload } from '$lib/types';

type Props = {
  fileObject: ImageUpload;
};

let { fileObject }: Props = $props();

const imageCtx = getImageContext();
</script>

<div
  class="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <Icon src={ExclamationCircle} class="h-8 w-8 text-error" />
  <button
    class="btn btn-error btn-sm mt-2"
    onclick={() => imageCtx.retryUpload(fileObject)}>
    Retry
  </button>
</div>
