<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { CloudArrowDown } from '@steeze-ui/heroicons';
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';
// TYPES
import type { GetImageAPI } from '$lib/types';

type Props = {
  image: GetImageAPI;
  class?: string;
};

let { image, class: className = '' } = $props();

// SERVICES
const imageService = getImageService();
</script>

<button
  class="btn btn-circle opacity-70 hover:text-neutral-content hover:opacity-100 hover:shadow-sm {className}"
  onclick={(e) => imageService.downloadImage(e, image, getFlash(page))}>
  <Icon src={CloudArrowDown} class="h-6 w-6" />
</button>
