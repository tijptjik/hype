<script lang="ts" generics="T extends Resource">
import { tick, untrack } from 'svelte';
import { flip } from 'svelte/animate';
import { fade, scale, fly, blur } from 'svelte/transition';
import { onDestroy } from 'svelte';
import { cubicOut, expoIn, sineOut } from 'svelte/easing';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// COMPONENTS
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { Resource } from '$lib/types';
let {
  entities,
  children
}: {
  entities: T[];
  children: (entity: T, idx: number) => any;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

// STATE
let isInitialLoading = $state(true);

// INFINITE SCROLL
let visibleEntities: T[] = $state([]);
let currentPage = $state(0);
let isLoading = $state(false);
let observer: IntersectionObserver | null = $state(null);
let containerRef: HTMLDivElement;
let loadMoreTriggerRef: HTMLDivElement | null = $state(null);
const pageSize = 24;
let initialized = $state(false);
let initializedDOM = $state(false);
let updateTimeout: number;

// FILTER TEXT
let filterText = $derived(
  adminCtx.state.filters[adminCtx.activeResource as FirstClassResource]
    ?.text
);
let lastUsedFilterText = $state('');

// Create and manage the observer
function setupObserver() {
  // Cleanup old observer if it exists
  observer?.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      const trigger = entries[0];
      if (trigger.isIntersecting) {
        loadMore();
      }
    },
    {
      root: null,
      rootMargin: '200px',
      threshold: 0.1
    }
  );

  // Observe the trigger if it exists
  if (loadMoreTriggerRef) {
    observer.observe(loadMoreTriggerRef);
  }
}

$effect(() => {
  if (!entities) return;

  updateTimeout = setTimeout(
    (text: string, lastText: string) => {
      if (text !== lastText) {
        currentPage = 0;
        lastUsedFilterText = text;
      }
      // Re-setup observer after updating visible entities
      updateVisibleEntities();
      setupObserver();
      if (!initialized) {
        untrack(() => (initialized = true));
      }
      // Set initial loading to false once we've processed entities
      untrack(() => (isInitialLoading = false));
      tick().then(() => {
        setTimeout(() => {
          untrack(() => (initializedDOM = true));
        }, 1000);
      });
    },
    initialized ? 100 : 0,
    filterText,
    lastUsedFilterText
  ) as unknown as number;
  return () => clearTimeout(updateTimeout);
});

function updateVisibleEntities() {
  const start = 0;
  const end = Math.min((currentPage + 1) * pageSize, entities.length);
  visibleEntities = entities.slice(start, end);
}

async function loadMore() {
  if (isLoading || visibleEntities.length >= entities.length) return;

  isLoading = true;
  try {
    // Simulate a small delay to prevent rapid loading
    await new Promise((resolve) => setTimeout(resolve, 300));
    currentPage++;
    updateVisibleEntities();
  } finally {
    isLoading = false;
  }
}

onDestroy(() => {
  clearTimeout(updateTimeout);
  observer?.disconnect();
});
</script>

<div
  bind:this={containerRef}
  class="from-rose-500 to-fuchsia-800 h-full overflow-y-auto bg-gradient-to-bl bg-fixed pb-16 @container/grid">
  <div
    class="flex w-full flex-auto p-4 {entities.length === 0 && !isInitialLoading
      ? 'h-full w-full items-center justify-center text-center'
      : ''}">
    <!-- Loading State -->
    {#if isInitialLoading}
      <div class="flex h-full w-full items-center justify-center">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
      <!-- Empty State -->
    {:else if entities.length === 0}
      <h2
        class="w-full text-center text-xl text-base-content/70 transition-opacity delay-75 duration-500">
        No items found
      </h2>
    {/if}

    <!-- Only show the grid if we have entities and we're not in initial loading -->
    {#if entities.length > 0 || isInitialLoading}
      <div
        class="grid grid-cols-1 gap-4 @[58rem]/grid:grid-cols-2 @[72rem]/grid:grid-cols-3 @[96rem]/grid:grid-cols-4 @[120rem]/grid:grid-cols-5 @[144rem]/grid:grid-cols-6 @[168rem]/grid:grid-cols-7 @[192rem]/grid:grid-cols-8 @[216rem]/grid:grid-cols-9 @[240rem]/grid:grid-cols-10"
        role="feed"
        aria-busy={isLoading}>
        {#each visibleEntities as entity, idx (entity.id)}
          <div
            in:blur={{
              delay: initializedDOM ? 0 : 50 + (idx % pageSize) * 25,
              duration: initializedDOM ? 0 : 250,
              easing: cubicOut
            }}
            animate:flip={{ delay: 0, duration: 250, easing: cubicOut }}>
            {@render children(entity, idx)}
          </div>
        {/each}

        <!-- Load More Trigger -->
        {#if visibleEntities.length < entities.length}
          <div
            bind:this={loadMoreTriggerRef}
            class="col-span-full flex justify-center p-4"
            aria-hidden="true">
            <span class="loading loading-dots loading-md"></span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
