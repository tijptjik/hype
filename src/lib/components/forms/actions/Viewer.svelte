<script lang="ts">
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// EASING
import { cubicInOut } from 'svelte/easing';
// TRANSITIONS
import { slide } from 'svelte/transition';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';
// COMPONENTS
import { ArrowDownTray } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import Toggle from '$lib/components/forms/fields/Toggle.svelte';

// SERVICES
const imageCtx = getImageContext();

// STATE
let activeImage = $derived(imageCtx.activeImage);
let isPublished = $derived.by(() => {
  if (!activeImage) return false;
  // Get the latest image state from context to ensure reactivity
  const contextImage = imageCtx.getImage(activeImage.id);
  return (contextImage as any)?.isPublished ?? activeImage.isPublished ?? false;
});
</script>

{#if activeImage}
  <div
    class="flex h-12 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap align-baseline"
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <Toggle
      label="Published"
      size="sm"
      checked={isPublished}
      onChange={() => imageCtx.handlePublishToggle()}
      isSolid={false} />
  </div>

  <div
    class="flex h-12 cursor-pointer flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap align-baseline transition-colors duration-200 hover:text-neutral-content active:text-primary"
    onclick={(e) => imageCtx.downloadImage(e, activeImage!, getFlash(page))}
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <Icon src={ArrowDownTray} />
  </div>
{/if}
