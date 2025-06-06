<script lang="ts">
import Image from '$lib/components/common/Image.svelte';
// SERVICES
import { getURLfromImage } from '$lib/client/services/image';

// STATE : PROPS
let {
  image,
  alt = 'Feature image'
}: {
  image: any;
  alt?: string;
} = $props();
</script>

<div class="h-full w-full overflow-hidden">
  <Image
    class="absolute inset-0 z-20 h-full w-full overflow-hidden text-base-100"
    src={getURLfromImage({ image })}
    alt=""
    layout="contain"
    showLoading={false}
    showError={false} />
  <Image
    class="absolute inset-0 z-10 h-full w-full overflow-hidden blur-sm"
    src={getURLfromImage({ image })}
    alt=""
    layout="cover"
    showLoading={false}
    showError={false} />
</div>
