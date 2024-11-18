<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { InformationCircle } from '@steeze-ui/heroicons';
import { slide } from 'svelte/transition';
// TYPES
import type { Snippet } from 'svelte';

// STATE
let showInfo = $state(false);
let panel = $state<HTMLDivElement | null>(null);

// STATE : PROPS
let {
  children
}: {
  children: Snippet;
} = $props();

function handleClickOutside(event: MouseEvent) {
  if (showInfo && panel && !panel.contains(event.target as Node)) {
    showInfo = false;
  }
}

$effect(() => {
  if (showInfo) {
    document.addEventListener('click', handleClickOutside);
  } else {
    document.removeEventListener('click', handleClickOutside);
  }

  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
});
</script>

<div class="relative">
  <button
    class="btn-rounded btn btn-ghost btn-sm p-1"
    onclick={(e) => {
      e.stopPropagation();
      showInfo = !showInfo;
    }}
    aria-label="Toggle form information">
    <Icon src={InformationCircle} class="h-4 w-4" />
  </button>

  {#if showInfo}
    <div
      bind:this={panel}
      transition:slide={{ duration: 250 }}
      class="absolute right-1 top-14 z-50 w-[34rem] rounded-b-xl border border-2 border-t-0 border-primary bg-base-100 p-6 shadow-lg">
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/10 to-transparent"
        aria-hidden="true">
      </div>
      <div class="relative space-y-4">
        {@render children()}
      </div>
    </div>
  {/if}
</div>
