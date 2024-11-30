<script lang="ts">
import { slide } from 'svelte/transition';
import { cubicInOut } from 'svelte/easing';
import Icon from '$lib/components/common/Icon.svelte';
import { Photo, XMark, Trash } from '@steeze-ui/heroicons';
import { imageSets } from '$lib/images/index.svelte';

// TYPES
import type { FieldProps, ModalProps } from '$lib/types';

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false),
  actions
}: FieldProps & ModalProps = $props();

// Add and remove event listener
$effect(() => {
  window.addEventListener('keydown', handleKeydown);
  return () => {
    window.removeEventListener('keydown', handleKeydown);
  };
});

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && removeMode) {
    removeMode = false;
  }
}
$effect(() => {
  if (imageSets.images.length == 0) {
    removeMode = false;
  }
});
</script>

<div class="flex flex-row items-center justify-end gap-4">
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost flex-nowrap ml-auto bg-base-100 whitespace-nowrap text-nowrap h-12"
      onclick={(e) => actions?.add(e)}
      data-testid="addImageButton">
      <Icon src={Photo} class="mr-2 h-4 w-4" />
      <span class="hidden md:block">Add</span>
    </button>
  {/if}
  {#if imageSets.images.length > 0}
    <button
      class="btn-rounded btn btn-ghost flex-nowrap ml-auto bg-base-100 overflow-hidden whitespace-nowrap text-nowrap h-12"
      onclick={(e) => actions?.remove(e)}
      transition:slide={{ axis: 'x', duration: 500, easing: cubicInOut }}>
      {#if !removeMode}
        <Icon src={Trash} class="mr-2 h-4 w-4" />
        <span class="hidden md:block text-nowrap">Remove</span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        <span class="hidden md:block whitespace-nowrap text-nowrap">Stop Removing</span>
      {/if}
    </button>
  {/if}
</div>
