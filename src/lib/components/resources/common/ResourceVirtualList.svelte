<script lang="ts" generics="T extends Resource">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// COMPONENTS
import VirtualList from '$lib/components/layout/VirtualList.svelte'
import ResourceCardRow from './ResourceCardRow.svelte'
import ResourceTableRow from './ResourceTableRow.svelte'
import ResourceEmptyState from './ResourceEmptyState.svelte'
import ResourceLoadingState from './ResourceLoadingState.svelte'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { Resource, EntityWithOptionalImage } from '$lib/types'
import type { Snippet } from 'svelte'

let {
  entities,
  card,
  row,
  listContainer = $bindable(),
  isInitialised = true,
  applyBottomOverflow = true,
}: {
  entities: T[]
  card?: Snippet<[T, number]>
  row?: Snippet<[T, number]>
  listContainer?: HTMLElement | null
  isInitialised?: boolean
  applyBottomOverflow?: boolean
} = $props()

// CONTEXT
const adminCtx = getAdminCtx()

// STATE
let gridWidth = $state(0)
let stableColumnCount = $state(1)
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
let lastKnownPanelOpenState = $state(
  adminCtx.appCtx && typeof adminCtx.appCtx.isPanelOpenOrVisual === 'function'
    ? adminCtx.appCtx.isPanelOpenOrVisual(Panel.admin)
    : false,
)
let isTransitioning = $state(false)

let layoutMode = $derived(
  adminCtx.activeResourceType
    ? adminCtx.appCtx.state.ui.layoutMode[adminCtx.activeResourceType]
    : null,
)

// GRID CONFIGURATION
let itemWidth = 340 // Approximate width of EntityCard + margins
let itemHeight = $derived(layoutMode === 'table' || layoutMode === 'list' ? 88 : 396) // Approximate row/card heights

// Smart column count calculation - debounce only during panel transitions
$effect(() => {
  gridWidth
  layoutMode
  const currentPanelState = adminCtx.appCtx.isPanelOpenOrVisual(Panel.admin)
  const isTransition = lastKnownPanelOpenState !== currentPanelState
  untrack(() => {
    if (!isTransition && !isTransitioning) {
      stableColumnCount =
        layoutMode === 'table' || layoutMode === 'list'
          ? 1
          : gridWidth > itemWidth
            ? Math.floor(gridWidth / itemWidth)
            : 1
    } else if (isTransition && !isTransitioning) {
      // Panel state changed - update immediately and start debounce for column calculation
      lastKnownPanelOpenState = currentPanelState
      isTransitioning = true
      // Debounce column count update during transitions
      resizeTimeout = setTimeout(() => {
        isTransitioning = false
        resizeTimeout = null
      }, 1000)
    }
  })
})

let columnCount = $derived(stableColumnCount)

// Function to calculate grid data
const calculateGridData = () => {
  const acc: { id: string; entities: T[]; startingIndex: number }[] = []
  if (layoutMode === 'table' || layoutMode === 'list' || columnCount === 0) {
    return entities.map((e, i) => ({ id: e.id, entities: [e], startingIndex: i }))
  }
  for (let i = 0; i < entities.length; i += columnCount) {
    const rowEntities = entities.slice(i, i + columnCount)
    acc.push({
      id: rowEntities[0].id,
      entities: rowEntities,
      startingIndex: i,
    })
  }
  return acc
}

// Simple reactive calculation - recalculate when dependencies change
const items = $derived(calculateGridData())

onDestroy(() => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})
</script>

{#snippet children(item: { id: string; entities: T[]; startingIndex: number })}
  {#if layoutMode === 'card'}
    <!-- Grid Row -->
    <ResourceCardRow
      entities={item.entities}
      startingIndex={item.startingIndex}
      {columnCount}
      {card}
    />
  {:else if layoutMode === 'table' || layoutMode === 'list'}
    <!-- For table mode, render the first (and only) entity -->
    <ResourceTableRow
      entity={item.entities[0] as EntityWithOptionalImage}
      index={item.startingIndex}
      row={row as Snippet<[EntityWithOptionalImage, number]> | undefined}
    />
  {/if}
{/snippet}

<div
  bind:clientWidth={gridWidth}
  bind:this={listContainer}
  class="flex min-h-0 flex-1 flex-col gap-12 overflow-hidden overscroll-auto caret-transparent @container/grid"
>
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
          padding={10}
          {applyBottomOverflow}
        />
      </div>
    {:else}
      <ResourceEmptyState />
    {/if}
  {:else}
    <ResourceLoadingState />
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
