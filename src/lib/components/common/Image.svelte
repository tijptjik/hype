<script lang="ts">
// COMPONENTS
import Loading from '$lib/components/images/gallery/overlays/Loading.svelte';
import LoadError from '$lib/components/images/gallery/overlays/LoadError.svelte';

// TYPES

type Props = {
  src: string;
  alt: string;
  class?: string;
  layout?: 'cover' | 'fill' | 'fit' | 'contain';
  showLoading?: boolean;
  showError?: boolean;
  onLoad?: () => void;
  onError?: () => void;
};

let loaded = $state(false);
let error = $state(false);

let {
  src,
  alt,
  class: className = '',
  layout = 'fill',
  showLoading = true,
  showError = true,
  onLoad,
  onError
}: Props = $props();
</script>

<figure
  class="{className.includes('absolute') ? '' : 'relative'} {className ? className : 'h-64 w-full'}">
  {#if showLoading && !loaded}
    <Loading />
  {/if}
  {#if showError && error}
    <LoadError />
  {/if}
  <img
    {src}
    {alt}
    class="{className ? className : ''} {layout === 'cover'
      ? 'h-full w-full object-cover'
      : layout === 'fill'
        ? 'object-fill'
        : layout === 'fit'
          ? 'object-fit'
          : 'object-contain'}
      {!loaded ? 'invisible' : ''}"
    onload={() => {
      loaded = true;
      onLoad?.();
    }}
    onerror={() => {
      error = true;
      loaded = true;
      onError?.();
    }} />
</figure>
