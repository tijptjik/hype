<script lang="ts">
import { fade } from 'svelte/transition';
import { intentOrder } from '$lib/context/images.svelte';
// SERVICES
import { getImageService } from '$lib/context/images.svelte';
// TYPES
import type { Intent } from '$lib/types';

// SERVICES
const imageService = getImageService();

// TYPES
type Props = {
  intent: string;
  idx: number;
  imageId: string;
};

let { intent, idx, imageId }: Props = $props();

let images = $derived(imageService.getImages());
const intentContext = $state({
  id: null as string | null,
  ref: null as HTMLDivElement | null
});

// HANDLERS :: INTENT
function handleIntentKeydown(e: KeyboardEvent, imageId: string, intent: Intent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    imageService.handleSetIntent(imageId, intent);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    intentContext.id = null;
  }
}

$effect(() => {
  if (intentContext.id) {
    const handleClickOutside = (e: MouseEvent) => {
      if (intentContext.ref && !intentContext.ref.contains(e.target as Node)) {
        intentContext.id = null;
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }
});
</script>

<div
  class="absolute bottom-0 left-0 right-0 flex justify-center p-2"
  transition:fade={{ duration: 200, delay: 150 + idx * 50 }}>
  <div class="relative">
    <button
      class="rounded-lg px-3 py-[6px] text-sm font-medium backdrop-blur-sm transition-all duration-200
          {intent === 'canonical'
        ? 'bg-primary hover:bg-primary/90'
        : 'bg-base-100/80 hover:bg-base-200/80'}"
      onclick={(e) => {
        e.stopPropagation();
        intentContext.id = intentContext.id === imageId ? null : imageId;
      }}>
      {intent}
    </button>

    {#if intentContext.id === imageId}
      <div
        class="absolute bottom-[34px] left-[-20px] mb-1 w-32 overflow-hidden rounded-lg bg-base-100 shadow-lg"
        bind:this={intentContext.ref}
        transition:fade={{ duration: 150 }}>
        {#each intentOrder.filter((option) => option !== intent) as option, idx}
          <button
            class="w-full px-2 py-[5px] text-center text-sm hover:bg-base-200 focus:bg-base-200 focus:outline-none
                  {option === intent ? 'bg-base-200' : ''}
                  {option === 'canonical' &&
            images.some((img) => img.id !== imageId && img.intent === 'canonical')
              ? 'text-primary'
              : ''}"
            onclick={(e) => {
              e.stopPropagation();
              imageService.handleSetIntent(imageId, option);
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
