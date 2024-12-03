<script lang="ts">
import { fade } from 'svelte/transition';
import Icon from '$lib/components/common/Icon.svelte';
import { Trash } from '@steeze-ui/heroicons';
import { handleDelete } from '$lib/images/index.svelte';
import type { GetImageAPI } from '$lib/types';

type Props = {
  image: GetImageAPI;
};

let { image }: Props = $props();
</script>

<div
  class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/50 backdrop-blur-sm"
  transition:fade={{ duration: 200 }}>
  <button
    class="btn btn-circle btn-error btn-sm"
    onclick={(e) => {
      e.stopPropagation();
      handleDelete(e, image);
    }}>
    <Icon src={Trash} class="h-4 w-4" />
  </button>
</div>
