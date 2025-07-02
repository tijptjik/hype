<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
import { onClickOutside } from 'runed';
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte';
// SERVICES
import { adminIntentOrder } from '$lib/api/services/image';
// TYPES
import type { Intent } from '$lib/types';

// SERVICES
const imageCtx = getImageCtx();

// TYPES
type Props = {
  intent: string;
  idx: number;
  imageId: string;
  container: HTMLDivElement;
};

let { intent, idx, imageId, container }: Props = $props();

let images = $derived(imageCtx.getImages());
const intentContext = $state({
  id: null as string | null,
  ref: null as HTMLDivElement | null
});

// HANDLERS :: INTENT
function handleIntentKeydown(e: KeyboardEvent, imageId: string, intent: Intent) {
  e.stopPropagation();
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    imageCtx.handleSetIntent(imageId, intent);
    intentContext.id = null;
  } else if (e.key === 'Escape') {
    e.preventDefault();
    intentContext.id = null;
  }
}

onClickOutside(
  () => intentContext.ref,
  () => (intentContext.id = null)
);

container.addEventListener('mouseleave', () => {
  intentContext.id = null;
});
</script>

<div
  class="absolute bottom-0 left-0 right-0 z-20 flex justify-center p-2"
  transition:fade={{ duration: 200, delay: 150 + idx * 50 }}>
  <div class="relative">
    <button
      class="rounded-lg px-3 py-[6px] text-sm font-medium backdrop-blur-sm transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary
          {intent === 'canonical'
        ? 'bg-primary hover:bg-primary/80'
        : 'bg-glass-result hover:bg-glass-result/80'}"
      onmouseenter={() => {
        intentContext.id = imageId;
      }}
      onclick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        intentContext.id = intentContext.id === imageId ? null : imageId;
      }}>
      {intent}
    </button>

    {#if intentContext.id === imageId}
      <div
        class="absolute bottom-[34px] left-[-20px] mb-1 w-32 overflow-hidden rounded-lg bg-glass-result shadow-lg"
        bind:this={intentContext.ref}
        transition:fade={{ duration: 150 }}>
        {#each adminIntentOrder.filter((option) => option !== intent) as option, idx}
          <button
            class="w-full px-2 py-[5px] text-center text-sm hover:bg-primary focus:bg-primary
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary
                  {option === intent ? 'bg-glass-result' : ''}
                  {option === 'canonical' &&
            images.some(
              (img) => img.id !== imageId && (img as any).intent === 'canonical'
            )
              ? 'text-primary hover:text-white'
              : ''}"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              imageCtx.handleSetIntent(imageId, option);
              intentContext.id = null;
            }}
            onkeydown={(e) => handleIntentKeydown(e, imageId, option)}
            transition:fade={{ duration: 150, delay: 100 + idx * 100 }}
            tabindex="0">
            {option}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
