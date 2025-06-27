<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
import Portal from 'svelte-portal';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { XMark, InformationCircle } from '@steeze-ui/heroicons';

// TYPES
import type { Snippet } from 'svelte';

// STATE : PROPS
let {
  children,
  borderColor = 'border-primary'
}: {
  children: Snippet;
  borderColor?: string;
} = $props();

// STATE : LOCAL
let isOpen = $state(false);
let buttonElement: HTMLButtonElement;

// METHODS
function togglePopover(event: MouseEvent) {
  event.preventDefault();
  isOpen = !isOpen;
}

function closePopover() {
  isOpen = false;
}

// Handle click outside to close
onMount(() => {
  function handleClickOutside(event: MouseEvent) {
    if (isOpen && !buttonElement?.contains(event.target as Node)) {
      closePopover();
    }
  }

  document.addEventListener('click', handleClickOutside);
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
});

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen) {
    closePopover();
  }
}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="flex items-center gap-6">
  <button
    bind:this={buttonElement}
    class="btn-rounded btn btn-ghost btn-sm mr-2 p-1"
    onclick={togglePopover}
    aria-label="Toggle form information"
    aria-expanded={isOpen}>
    <Icon src={InformationCircle} class="h-6 w-6" />
  </button>

  {#if isOpen}
    <Portal target="body">
      <div
        class="pointer-events-auto fixed z-[9999] w-full max-w-[40rem] rounded-xl border-4 {borderColor} left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-glass-300-solid p-12 shadow-2xl"
        role="dialog"
        aria-modal="true">
        <div class="space-y-4">
          {@render children()}
        </div>
        <button
          class="btn btn-circle btn-ghost btn-sm absolute right-6 top-6 p-1"
          onclick={closePopover}
          aria-label="Close information">
          <Icon src={XMark} class="h-6 w-6" />
        </button>
      </div>
      <!-- Backdrop to close on click -->
      <div
        class="fixed inset-0 z-[9998] bg-black/20"
        onclick={closePopover}
        aria-hidden="true">
      </div>
    </Portal>
  {/if}
</div>
