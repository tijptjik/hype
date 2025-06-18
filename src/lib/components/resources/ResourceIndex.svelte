<script lang="ts" generics="T extends Resource">
// SVELTE
import { slide } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
// VIRTUAL LIST
import SvelteVirtualList from '$lib/components/layout/virtual-list/SvelteVirtualList.svelte';
// COMPONENTS
import EntityCard from '$lib/components/resources/EntityCard.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Task, Resource, LayoutMode, ControlMode } from '$lib/types';

let {
  entities,
  layoutMode,
  controlMode,
  card,
  row,
  controlBar,
  bufferSize = 20
}: {
  entities: T[];
  layoutMode: LayoutMode;
  controlMode: ControlMode;
  card?: (entity: T, idx: number) => any;
  row?: (entity: T, idx: number) => any;
  controlBar?: () => any;
  bufferSize?: number;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

// STATE
let isInitialised = $state(true);
let gridWidth = $state(0);

// GRID CONFIGURATION
let itemWidth = 340; // Approximate width of EntityCard + margins
let itemHeight = layoutMode === 'table' ? 80 : 500; // Approximate width of EntityCard + margins
let columnCount = $derived(
  layoutMode === 'table'
    ? 1
    : gridWidth > itemWidth
      ? Math.floor(gridWidth / itemWidth)
      : 1
);

const gridData = $derived.by(() => {
  const acc: { id: string; entities: T[]; startingIndex: number }[] = [];
  if (layoutMode === 'table' || columnCount === 0) {
    return entities.map((e, i) => ({ id: e.id, entities: [e], startingIndex: i }));
  }
  for (let i = 0; i < entities.length; i += columnCount) {
    const rowEntities = entities.slice(i, i + columnCount);
    acc.push({
      id: rowEntities[0].id,
      entities: rowEntities,
      startingIndex: i
    });
  }
  return acc;
});
</script>

<!-- Control Bar (slides down when controlMode is active) -->
{#if controlMode === 'filter'}
  <div transition:slide>
    {#if controlBar}
      {@render controlBar()}
    {/if}
  </div>
{/if}

<div
  bind:clientWidth={gridWidth}
  class="grid flex-1 gap-12 overflow-y-auto bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed px-4 pt-4 @container/grid"
  style="height: calc(100vh - 164px);">
  <!-- Loading State -->
  {#if isInitialised}
    {#if entities.length > 0}
      <div class="h-full">
        <SvelteVirtualList
          defaultEstimatedItemHeight={itemHeight}
          items={gridData}
          {bufferSize}>
          {#snippet renderItem(item, index)}
            {@const { entities: rowItem, startingIndex: rowIdx } = item}
            {#if layoutMode === 'card'}
              <!-- Grid Row -->
              <div
                class="grid gap-4 px-2 py-2"
                style="grid-template-columns: repeat({columnCount}, minmax(0, 1fr));">
                {#each rowItem as entity, colIdx}
                  {@const entityIdx = rowIdx + colIdx}
                  {#if entity}
                    <div class="transition-all duration-200 hover:scale-105">
                      {#if card}
                        {@render card(entity, entityIdx)}
                      {:else}
                        <EntityCard
                          entity={entity as any}
                          keyMap={{ id: 'id', title: 'id', image: '' }} />
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            {:else if layoutMode === 'table'}
              <div class="px-2 py-1">
                {#if row}
                  {@render row(rowItem[0] as T, rowIdx)}
                {:else}
                  <a
                    href={`/admin/${adminCtx.getEntityPath(
                      adminCtx.activeResourceType as FirstClassResource,
                      (rowItem[0] as T).id
                    )}`}>
                    <div class="rounded-lg bg-base-100 p-4 shadow-sm">
                      <div class="text-lg font-semibold">{(rowItem[0] as T).id}</div>
                    </div>
                  </a>
                {/if}
              </div>
            {/if}
          {/snippet}
        </SvelteVirtualList>
      </div>
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
