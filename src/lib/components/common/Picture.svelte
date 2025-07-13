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
    : 'h-full w-full'} bg-transparent">
  {#if showLoading && !loaded && !error}
    <Loading />
  {/if}

  {#if showError && error}
    <LoadError />
  {/if}

  {#if showBackground}
    <!-- Background Image (blurred) -->
    <img
      {src}
      {alt}
      class="absolute inset-0 h-full w-full object-cover text-transparent blur-sm"
      style="opacity: {(opacity / 10) * 6 * (loaded && !error ? 1 : 0)}" />
  {/if}
  <!-- Foreground Image -->
  <img
    {src}
    {alt}
    style="opacity: {opacity * (loaded && !error ? 1 : 0)}"
    class="relative text-transparent {layout === 'cover'
      ? 'h-full w-full object-cover'
      : layout === 'fill'
        ? 'h-full w-full object-fill'
        : layout === 'fit'
          ? 'h-full w-full object-scale-down'
          : 'h-full w-full object-contain'} bg-transparent"
    onload={handleLoad}
    onerror={handleError} />
</figure>
