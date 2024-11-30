<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte';
import { CloudArrowDown } from '@steeze-ui/heroicons';
import { downloadImage } from '$lib/images/index.svelte';
import type { GetImageAPI } from '$lib/types';

type Props = {
  image: GetImageAPI;
  class?: string;
};

let { image, class: className = '' } = $props();
</script>

<button
  class="btn btn-circle opacity-70 hover:text-neutral-content hover:opacity-100 hover:shadow-sm {className}"
  onclick={(e) => downloadImage(e, image)}>
  <Icon src={CloudArrowDown} class="h-6 w-6" />
</button>
