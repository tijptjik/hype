<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { QuestionMarkCircle, XCircle } from '@steeze-ui/heroicons';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { PanelState } from '$lib/types';

let { panelType, title, subtitle, onToggleInfo } = $props<{
  panelType: keyof PanelState;
  title: string;
  onToggleInfo?: (e: MouseEvent | TouchEvent) => void;
}>();

const appCtx = getAppCtx();

// Setup and cleanup event listeners
$effect(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      appCtx.closePanel(panelType);
    }
  };

  window.addEventListener('keydown', handler);
  return () => {
    window.removeEventListener('keydown', handler);
  };
});
</script>

<header
  class="sticky top-0 z-30 flex h-16 select-none flex-row items-center justify-between border-b-3 border-base-300 bg-black px-6 py-2 caret-transparent focus:outline-none">
  <div class="flex flex-row items-center gap-2">
    <h2 class="text-lg font-semibold uppercase tracking-widest text-primary">
      {title}
    </h2>
  </div>
  <div class="flex flex-row items-center gap-4">
    {#if onToggleInfo}
      <button
        class="m-0 h-auto flex-none p-0 text-base-50 hover:bg-transparent hover:text-base-content/80 focus:outline-none focus:ring-0 focus-visible:text-primary"
        onclick={(e) => {
          onToggleInfo?.(e);
        }}>
        <span class="text-xl">?</span>
      </button>
    {/if}
    <button
      class="btn btn-ghost btn-sm m-0 h-auto flex-none p-0 hover:bg-transparent hover:text-base-content/80 focus:outline-none focus:ring-0 focus-visible:text-primary"
      onclick={() => {
        appCtx.closePanel(panelType);
      }}>
      <Icon src={XCircle} class="h-10 w-10 transition-transform duration-300" />
    </button>
  </div>
</header>
