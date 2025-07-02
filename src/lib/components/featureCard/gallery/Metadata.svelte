<script lang="ts">
/**
 * @component Displays image metadata including attribution and intent
 * @param {Image} currentImage - The currently displayed image
 */
// COMPONENTS
import Attribution from '$lib/components/featureCard/gallery/Attribution.svelte';
// TYPES
import type { Image } from '$lib/types';

// PROPS
let { currentImage }: { currentImage: Image } = $props();

const intent = $derived(currentImage?.intent || '');
</script>

<div
  class="absolute bottom-2 left-2 z-10 flex h-6 select-none flex-row gap-2 overflow-visible caret-transparent">
  <Attribution {currentImage} />
  <div class="grid grid-cols-1 grid-rows-1">
    <div
      class="grid-row-1 grid-col-1 h-6 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white">
      {intent}
    </div>
  </div>
</div>
