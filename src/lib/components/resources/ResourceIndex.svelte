<script lang="ts" generics="T extends Resource">
// SVELTE
import { slide } from 'svelte/transition';
// I18N
import { m } from '$lib/i18n';
import { getLocale } from '$lib/i18n';
// COMPONENTS
import EntityCard from '$lib/components/resources/EntityCard.svelte';
import VirtualList from '$lib/components/layout/VirtualList.svelte';
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { Resource, LayoutMode, ControlMode } from '$lib/types';

let {
  entities,
  layoutMode,
  controlMode,
  card,
  row,
  controlBar,
  listContainer = $bindable()
}: {
  entities: T[];
  layoutMode: LayoutMode;
  controlMode: ControlMode;
  card?: (entity: T, index: number) => any;
  row?: (entity: T, index: number) => any;
  controlBar?: () => any;
  listContainer?: HTMLElement | null;
} = $props();

// CONTEXT
const adminCtx = getAdminCtx();

// STATE
let isInitialised = $state(true);
let gridWidth = $state(0);

// GRID CONFIGURATION
let itemWidth = 340; // Approximate width of EntityCard + margins
let itemHeight = layoutMode === 'table' ? 88 : 396; // Approximate width of EntityCard + margins
let columnCount = $derived(
  layoutMode === 'table'
    ? 1
    : gridWidth > itemWidth
      ? Math.floor(gridWidth / itemWidth)
      : 1
);

// Non-reactive grid data - populated on mount
// let items: { id: string; entities: T[]; startingIndex: number }[] = $state([]);

// Function to calculate grid data
const calculateGridData = () => {
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
};

// Simple reactive calculation - recalculate when dependencies change
const items = $derived(calculateGridData());
</script>

{#snippet cardRow(item: { id: string; entities: T[]; startingIndex: number })}
  <div
    class="grid gap-4 px-2 py-2 first:pt-1"
    style="grid-template-columns: repeat({columnCount}, minmax(0, 1fr));">
    {#each item.entities as entity, columnIndex (entity.id)}
      {#if entity}
        <div class="transition-all duration-200 hover:scale-[1.01]">
          {#if card}
            {@render card(entity, item.startingIndex + columnIndex)}
          {:else}
            <EntityCard
              entity={entity as any}
              keyMap={{ id: 'id', title: 'id', image: '' }} />
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet tableRow(item: { id: string; entities: T[]; startingIndex: number })}
  <div class="px-2 py-1">
    {#if row}
      {@render row(item.entities[0], item.startingIndex)}
    {:else}
      <div
        onclick={() =>
          navigateOnAdmin(
            adminCtx,
            adminCtx.activeResourceType as FirstClassResource,
            (item.entities[0] as T).id
          )}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            navigateOnAdmin(
              adminCtx,
              adminCtx.activeResourceType as FirstClassResource,
              (item.entities[0] as T).id
            );
          }
        }}
        role="button"
        tabindex="0"
        class="cursor-pointer rounded-lg bg-base-100 p-4 shadow-sm hover:shadow-md">
        <div class="text-lg font-semibold">
          {(item.entities[0] as any)?.i18n?.[getLocale()]?.name ??
            (item.entities[0] as T).id}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet children(item: { id: string; entities: T[]; startingIndex: number })}
  {#if layoutMode === 'card'}
    <!-- Grid Row -->
    {@render cardRow(item)}
  {:else if layoutMode === 'table'}
    <!-- For table mode, render the first (and only) entity -->
    {@render tableRow(item)}
  {/if}
{/snippet}

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
  bind:this={listContainer}
  class="flex min-h-0 flex-1 flex-col gap-12 overflow-hidden bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed caret-transparent @container/grid">
  <!-- Loading State -->
  {#if isInitialised}
    {#if entities.length > 0 && items.length > 0}
      <div class="wrapper relative min-h-0 flex-1">
        <VirtualList
          {items}
          {children}
          getKey={(item) => item.id}
          height="100%"
          {itemHeight}
          bufferBefore={8}
          bufferAfter={10}
          padding={10} />
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
      <span class="loading loading-ring loading-lg text-primary"></span>
    </div>
  {/if}
</div>

<style>
.wrapper {
  --svrollbar-track-opacity: 1;
  --svrollbar-thumb-background: #1d232a;
  --svrollbar-thumb-opacity: 0.7;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}
</style>
