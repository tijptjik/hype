<script lang="ts">
import { cubicInOut } from 'svelte/easing';
import { slide } from 'svelte/transition';
import {
  imageSets,
  downloadImage,
  handlePublishToggle
} from '$lib/images/index.svelte';
// COMPONENTS
import { ArrowDownTray } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import Toggle from '$lib/components/forms/fields/Toggle.svelte';
// TYPES
import type { ImageEditRefs } from '$lib/types';

let { refs }: { refs: ImageEditRefs } = $props();
</script>

{#if imageSets.activeImage}
  <div
    class="flex flex-row items-center justify-between gap-2 align-baseline flex-nowrap overflow-hidden whitespace-nowrap text-nowrap h-12"
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <div class="text-sm font-light">Published</div>
    <Toggle
      size="sm"
      checked={imageSets.activeImage?.isPublished ?? false}
      onChange={() => handlePublishToggle(refs)} />
  </div>

  <div
    class="flex cursor-pointer flex-row items-center justify-between gap-2 align-baseline transition-colors duration-200 hover:text-neutral-content active:text-primary flex-nowrap overflow-hidden whitespace-nowrap text-nowrap h-12"
    onclick={downloadImage}
    transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
    <Icon src={ArrowDownTray} />
  </div>
{/if}
