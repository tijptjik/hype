<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { QuestionMarkCircle, XCircle } from '@steeze-ui/heroicons';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';

let { panel, title, subtitle, onToggleInfo } = $props<{
  panel: string;
  title: string;
  onToggleInfo?: (e: MouseEvent | TouchEvent) => void;
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
  class="sticky top-0 z-10 flex h-16 flex-row items-center justify-between border-b-3 border-base-300 bg-black px-6 py-2">
  <div class="flex flex-row items-center gap-2">
    <h2 class="text-lg font-semibold uppercase tracking-widest text-primary">
      {title}
    </h2>
  </div>
  <div class="flex flex-row items-center gap-4">
    <button
      class="m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
      onclick={(e) => {
        onToggleInfo?.(e);
      }}>
      <span class="text-xl text-base-50">?</span>
    </button>
    <button
      class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80"
      onclick={() => {
        mapContext.closePanel(panel);
      }}>
      <Icon src={XCircle} class="h-10 w-10 transition-transform duration-300" />
    </button>
  </div>
</header>
