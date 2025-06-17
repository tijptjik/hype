<script lang="ts" generics="T extends Resource">
// I18N
import { m } from '$lib/i18n';
// VIRTUA
import { VList } from 'virtua/svelte';
// COMPONENTS
import EntityCard from '$lib/components/layout/EntityCard.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { Task, Resource, LayoutMode, ControlMode } from '$lib/types';

let {
  entities,
  layoutMode,
  controlMode,
  card,
  row
}: {
  entities: T[];
  layoutMode: LayoutMode;
  controlMode: ControlMode;
  card?: (entity: T, idx: number) => any;
  row?: (entity: T, idx: number) => any;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

// STATE
let isInitialised = $state(true);
let gridHeight = $state(0);
let gridWidth = $state(0);

// GRID CONFIGURATION
let itemHeight = layoutMode === 'table' ? 80 : 500; // Approximate height of EntityCard + margins
let itemWidth = 340; // Approximate width of EntityCard + margins
let columnCount = $derived(
  layoutMode === 'table'
    ? 1
    : gridWidth > itemWidth
      ? Math.floor(gridWidth / itemWidth)
      : 1
);
</script>

<div
  bind:clientHeight={gridHeight}
  bind:clientWidth={gridWidth}
  class="mb-12 grid h-full gap-12 overflow-hidden bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed @container/grid"
  style="grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));">
  <!-- Loading State -->
  {#if isInitialised}
    {#if entities.length > 0}
      <VList
        data={entities}
        class="h-full w-full p-6"
        getKey={(item: Exclude<T, Task>) => (item as T).id}>
        {#snippet children(item: Exclude<T, Task>, rowIdx: number)}
          {#if layoutMode === 'card'}
            <!-- Grid Row -->
            <div
              class="grid gap-4 px-2 py-2"
              style="grid-template-columns: repeat({columnCount}, minmax(0, 1fr));">
              {#each Array(columnCount) as _, colIdx}
                {@const entity: T = entities[rowIdx * columnCount + colIdx]}
                {#if entity}
                  <div class="transition-all duration-200 hover:scale-105">
                    {#if card}
                      {@render card(entity, rowIdx * columnCount + colIdx)}
                    {:else}
                      <EntityCard {entity} keyMap={{}} />
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {:else if layoutMode === 'table'}
            <div class="px-2 py-1">
              {#if row}
                {@render row(item as T, rowIdx)}
              {:else}
                <div class="rounded-lg bg-base-100 p-4 shadow-sm">
                  <div class="text-lg font-semibold">{(item as T).id}</div>
                </div>
              {/if}
            </div>
          {/if}
        {/snippet}
      </VList>
    {:else}
      <!-- Empty State -->
      <div class="flex h-full w-full items-center justify-center text-center">
        <h2
          class="w-full text-center text-xl text-base-content/70 transition-opacity delay-75 duration-500">
          {m.omni__no_results()}
        </h2>
      </div>
    {/if}
  {:else}
    <!-- Loading State -->
    <div class="flex h-full w-full items-center justify-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
    </div>
  {/if}
</div>
