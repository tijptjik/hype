<script lang="ts">
import { fade } from 'svelte/transition';
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
import type { GetImageAPI } from '$lib/types';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';

type Props = {
  image: GetImageAPI;
};

let { image }: Props = $props();

const imageService = getImageService();
</script>

<div
  class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <button
    class="btn btn-circle btn-error btn-sm"
    onclick={(e) => {
      e.stopPropagation();
      imageService.handlePreDelete(image);
    }}>
    <Icon src={Trash} class="h-4 w-4" />
  </button>
</div>
