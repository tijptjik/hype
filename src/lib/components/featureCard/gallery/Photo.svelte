<script lang="ts">
import Image from '$lib/components/common/Image.svelte';
import { getURLfromImage } from '$lib/images/index.svelte';

// STATE : PROPS
let {
  image,
  alt = 'Feature image',
  position = 'current'
}: {
  image: any;
  alt?: string;
  position?: 'previous' | 'current' | 'next';
} = $props();

// Derive proper alt text based on position
let imageAlt = $derived(
  `${position.charAt(0).toUpperCase() + position.slice(1)} ${alt}`
);
</script>

<div
  class={`${position === 'current' ? 'relative inset-0 z-10' : position === 'previous' ? 'absolute left-[-100%] top-0' : 'absolute right-[-100%] top-0'} h-full w-full`}>
  <Image
    class="z-20 h-full w-full overflow-hidden text-base-100"
    src={getURLfromImage({ image })}
    alt={imageAlt}
    layout="contain"
    showLoading={false}
    showError={false} />
  <Image
    class="absolute top-0 z-10 h-full w-full bg-neutral blur-sm"
    src={getURLfromImage({ image })}
    alt={imageAlt}
    layout="cover"
    showLoading={false}
    showError={false} />
</div>
