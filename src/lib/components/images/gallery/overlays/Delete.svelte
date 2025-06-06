<script lang="ts">
import { fade } from 'svelte/transition';
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
import type { Image } from '$lib/types';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';

type Props = {
  image: Image;
};

let { image }: Props = $props();

const imageCtx = getImageContext();
</script>

<div
  class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <button
    class="btn btn-circle btn-error btn-sm"
    onclick={(e) => {
      imageCtx.handlePreDelete(e, image);
    }}>
    <Icon src={Trash} class="h-4 w-4" />
  </button>
</div>
