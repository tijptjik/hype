<script lang="ts">
// COMPONENTS
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import LoadError from '$lib/components/images/gallery/overlays/LoadError.svelte';

// TYPES
type Props = {
  src: string;
  alt?: string;
  class?: string;
  layout?: 'cover' | 'fill' | 'fit' | 'contain';
  showLoading?: boolean;
  showError?: boolean;
  showBackground?: boolean;
  opacity?: number;
  onLoad?: () => void;
  onError?: () => void;
};

let {
  src,
  alt = 'Image from Hype.HK',
  class: className = '',
  layout = 'fill',
  showLoading = true,
  showError = true,
  showBackground = true,
  opacity = 1,
  onLoad,
  onError
}: Props = $props();

let loaded = $state(false);
let error = $state(false);

// Debug opacity changes

const handleLoad = () => {
  loaded = true;
  error = false;
  onLoad?.();
};

const handleError = () => {
  error = true;
  loaded = true;
  onError?.();
};
</script>

<figure
  class="{className.includes('absolute') ? '' : 'relative'} {className
    ? className
    : 'h-full w-full'} bg-transparent"
  style="opacity: {opacity}">
  {#if showLoading && !loaded && !error}
    <Loading />
  {/if}

  {#if showError && error}
    <LoadError />
  {/if}

  <!-- Foreground Image -->
  <img
    {src}
    {alt}
    class="relative z-10 text-transparent {loaded && !error
      ? 'opacity-100'
      : 'opacity-0'} {layout === 'cover'
      ? 'h-full w-full object-cover'
      : layout === 'fill'
        ? 'h-full w-full object-fill'
        : layout === 'fit'
          ? 'h-full w-full object-scale-down'
          : 'h-full w-full object-contain'} bg-transparent"
    onload={handleLoad}
    onerror={handleError} />

  {#if showBackground}
    <!-- Background Image (blurred) - delayed to prevent pop-in -->
    <img
      {src}
      {alt}
      class="absolute inset-0 z-0 h-full w-full object-cover blur-sm"
      style="opacity: {(opacity / 10) * 6}" />
  {/if}
</figure>
