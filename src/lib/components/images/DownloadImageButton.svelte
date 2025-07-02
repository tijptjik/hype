<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { CloudArrowDown } from '@steeze-ui/heroicons';
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// SERVICES
import { getImageCtx } from '$lib/context/image.svelte';
// TYPES
import type { Image } from '$lib/types';

type Props = {
  image: Image;
  class?: string;
};

let { image, class: className = '' } = $props();

// SERVICES
const imageCtx = getImageCtx();
</script>

<button
  class="btn btn-circle border-none bg-glass-result opacity-70 hover:bg-glass-result/100 hover:shadow-sm {className}"
  onclick={(e) => imageCtx.downloadImage(e, image, getFlash(page))}>
  <Icon src={CloudArrowDown} class="h-6 w-6 stroke-[2px]" />
</button>
