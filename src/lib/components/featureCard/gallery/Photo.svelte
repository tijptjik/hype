<script lang="ts">
import Image from '$lib/components/common/Image.svelte';
// SERVICES
import { getURLfromImage } from '$lib/context/images.svelte';

// STATE : PROPS
let {
  image,
  alt = 'Feature image'
}: {
  image: any;
  alt?: string;
} = $props();
</script>

<div class="h-full w-full">
  <Image
    class="z-20 h-full w-full overflow-hidden text-base-100"
    src={getURLfromImage({ image })}
    alt="image"
    layout="contain"
    showLoading={false}
    showError={false} />
  <Image
    class="absolute top-0 z-10 h-full w-full bg-neutral blur-sm"
    src={getURLfromImage({ image })}
    alt="image"
    layout="cover"
    showLoading={false}
    showError={false} />
</div>
