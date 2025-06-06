<script lang="ts">
import { slide } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, XMark, Trash } from '@steeze-ui/heroicons';
// SERVICES
import { getImageContext } from '$lib/context/image.svelte';

// SERVICES
const imageCtx = getImageContext();

type GalleryActionsProps = {
  removeMode: boolean;
  actions: Record<'add' | 'remove', (...args: any[]) => void>;
};

// STATE : PROPS
let { removeMode = $bindable(false), actions }: GalleryActionsProps = $props();

// Add and remove event listener
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && removeMode) {
      removeMode = false;
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});

$effect(() => {
  if (imageCtx.getImages().length == 0) {
    removeMode = false;
  }
});
</script>

<div class="flex flex-row items-center justify-end gap-4">
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost ml-auto h-12 flex-nowrap whitespace-nowrap text-nowrap bg-base-100"
      onclick={(e) => actions?.add(e)}
      data-testid="addImageButton">
      <Icon src={Photo} class="mr-2 h-4 w-4" />
      <span class="hidden md:block">Add</span>
    </button>
  {/if}
  {#if imageCtx.getImages().length > 0}
    <button
      class="btn-rounded btn btn-ghost ml-auto h-12 flex-nowrap overflow-hidden whitespace-nowrap text-nowrap bg-base-100"
      onclick={(e) => actions?.remove(e)}
      transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
      {#if !removeMode}
        <Icon src={Trash} class="mr-2 h-4 w-4" />
        <span class="hidden text-nowrap md:block">Remove</span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        <span class="hidden whitespace-nowrap text-nowrap md:block">Stop Removing</span>
      {/if}
    </button>
  {/if}
</div>
