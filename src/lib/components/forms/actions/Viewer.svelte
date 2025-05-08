<script lang="ts">
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// EASING
import { cubicInOut } from 'svelte/easing';
// TRANSITIONS
import { slide } from 'svelte/transition';
// SERVICES
import { getImageContext } from '$lib/context/images.svelte';
// COMPONENTS
import { ArrowDownTray } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import Toggle from '$lib/components/forms/fields/Toggle.svelte';

// SERVICES
const imageCtx = getImageContext();
</script>

{#if imageCtx.activeImage}
  <div
    class="flex h-12 flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap align-baseline"
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <div class="text-sm font-light">Published</div>
    <Toggle
      size="sm"
      checked={imageCtx.activeImage?.isPublished ?? false}
      onChange={() => imageCtx.handlePublishToggle()} />
  </div>

  <div
    class="flex h-12 cursor-pointer flex-row flex-nowrap items-center justify-between gap-2 overflow-hidden whitespace-nowrap text-nowrap align-baseline transition-colors duration-200 hover:text-neutral-content active:text-primary"
    onclick={(e) => imageCtx.downloadImage(e, imageCtx.activeImage!, getFlash(page))}
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <Icon src={ArrowDownTray} />
  </div>
{/if}
