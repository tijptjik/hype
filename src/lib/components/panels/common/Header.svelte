<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { XMark } from '@steeze-ui/heroicons';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

let { panel, title, subtitle } = $props<{
  panel: string;
  title: string;
  subtitle?: string;
}>();

const mapContext = getMapContext();

// Setup and cleanup event listeners
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      mapContext.closePanel(panel);
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});
</script>

<header
  class="sticky top-0 z-10 flex-shrink-0 flex-grow-0 border-b border-base-300 bg-black px-4 py-3">
  <div class="flex flex-row justify-between">
    <div class="flex flex-row items-center items-baseline gap-2">
      <h2 class="text-lg font-semibold uppercase tracking-widest text-primary">
        {title}
      </h2>
      {#if subtitle}
        <p class="text-sm text-neutral-700">{subtitle}</p>
      {/if}
    </div>
    <button
      class="flex flex-row items-center items-baseline gap-2"
      onclick={() => {
        mapContext.closePanel(panel);
      }}>
      <Icon src={XMark} class="h-8 w-8 font-bold text-white" />
    </button>
  </div>
</header>
