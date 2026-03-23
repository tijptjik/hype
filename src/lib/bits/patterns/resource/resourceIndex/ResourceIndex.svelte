<script lang="ts" generics="T extends Resource">
import type { Snippet } from 'svelte'
// COMPONENTS
import ResourceCardRow from './components/ResourceCardRow.svelte'
import ResourceEmptyState from './components/ResourceEmptyState.svelte'
import ResourceLoadingState from './components/ResourceLoadingState.svelte'
import ResourceTableRow from './components/ResourceTableRow.svelte'
// BITS
import { VirtualList } from '$lib/bits/custom/index/src'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { Resource } from '$lib/types'
import type {
  ResourceIndexGridRow,
  ResourceIndexItem,
  ResourceIndexProps,
} from './resourceIndex.types'

const GRID_HORIZONTAL_PADDING_PX = 16
const GRID_COLUMN_GAP_PX = 16
const GRID_ROW_GAP_PX = 16
const TABLE_ROW_GAP_PX = 6
const CARD_ITEM_WIDTH_PX = 340
const CARD_ROW_HEIGHT_PX = 396
const TABLE_ROW_HEIGHT_PX = 72
const PANEL_TRANSITION_SETTLE_MS = 300

let {
  resource,
  entities,
  card,
  row,
  listContainer = $bindable(),
  isInitialised = true,
  applyBottomOverflow = true,
}: ResourceIndexProps<T> = $props()

const adminCtx = getAdminCtx()

let gridWidth = $state(0)
let stableColumnCount = $state(1)
let lastKnownPanelOpenState = $state(
  adminCtx.appCtx && typeof adminCtx.appCtx.isPanelOpenOrVisual === 'function'
    ? adminCtx.appCtx.isPanelOpenOrVisual(Panel.admin)
    : false,
)

const layoutMode = $derived(adminCtx.appCtx.state.ui.layoutMode[resource])
const isRowLayout = $derived(layoutMode === 'table' || layoutMode === 'list')
const itemHeight = $derived(
  isRowLayout
    ? TABLE_ROW_HEIGHT_PX + TABLE_ROW_GAP_PX
    : CARD_ROW_HEIGHT_PX + GRID_ROW_GAP_PX,
)
const columnCount = $derived(isRowLayout ? 1 : stableColumnCount)

const cardWidth = $derived.by(() => {
  if (layoutMode !== 'card') {
    return 0
  }

  const usableWidth = Math.max(0, gridWidth - GRID_HORIZONTAL_PADDING_PX)
  const totalGapWidth = Math.max(0, columnCount - 1) * GRID_COLUMN_GAP_PX

  return Math.max(0, (usableWidth - totalGapWidth) / Math.max(1, columnCount))
})

function getColumnCount(nextGridWidth: number, nextLayoutMode: string): number {
  if (nextLayoutMode === 'table' || nextLayoutMode === 'list') {
    return 1
  }

  const usableWidth = Math.max(0, nextGridWidth - GRID_HORIZONTAL_PADDING_PX)
  return Math.max(
    1,
    Math.floor(
      (usableWidth + GRID_COLUMN_GAP_PX) / (CARD_ITEM_WIDTH_PX + GRID_COLUMN_GAP_PX),
    ),
  )
}

function buildItems(): Array<ResourceIndexItem<T>> {
  if (isRowLayout || columnCount <= 1) {
    return entities
  }

  const rows: ResourceIndexGridRow<T>[] = []

  for (let index = 0; index < entities.length; index += columnCount) {
    const rowEntities = entities.slice(index, index + columnCount)

    if (rowEntities.length > 0) {
      rows.push({
        id: rowEntities[0].id,
        entities: rowEntities,
        startingIndex: index,
      })
    }
  }

  return rows
}

const items = $derived.by(() => buildItems())

$effect(() => {
  gridWidth
  layoutMode

  const currentPanelState = adminCtx.appCtx.isPanelOpenOrVisual(Panel.admin)
  const nextColumnCount = getColumnCount(gridWidth, layoutMode)

  if (currentPanelState === lastKnownPanelOpenState) {
    stableColumnCount = nextColumnCount
    return
  }

  lastKnownPanelOpenState = currentPanelState

  const timeout = window.setTimeout(() => {
    stableColumnCount = getColumnCount(gridWidth, layoutMode)
  }, PANEL_TRANSITION_SETTLE_MS)

  return () => {
    window.clearTimeout(timeout)
  }
})
</script>

{#snippet children(item: ResourceIndexItem<T>, index: number)}
  {#if layoutMode === 'card'}
    {@const cardRow = item as ResourceIndexGridRow<T>}
    <ResourceCardRow
      entities={cardRow.entities}
      startingIndex={cardRow.startingIndex}
      {columnCount}
      {cardWidth}
      {card}
    />
  {:else if layoutMode === 'table' || layoutMode === 'list'}
    <ResourceTableRow
      entity={item as T}
      {index}
      row={row as Snippet<[T, number]> | undefined}
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
      <div class="bits-resource-index-wrapper relative min-h-0 flex-1">
        <VirtualList
          {items}
          {children}
          getKey={item => item.id}
          height="100%"
          {itemHeight}
          rowGap={isRowLayout ? TABLE_ROW_GAP_PX : GRID_ROW_GAP_PX}
          bufferBefore={8}
          bufferAfter={10}
          padding={10}
          {applyBottomOverflow}
        />
      </div>
    {:else}
      <div
        class="bits-resource-index-wrapper bits-resource-index-wrapper--empty relative min-h-0 flex-1"
      >
        <ResourceEmptyState />
      </div>
    {/if}
  {:else}
    <ResourceLoadingState />
  {/if}
</div>

<style>
.bits-resource-index-wrapper {
  --svrollbar-track-opacity: 1;
  --svrollbar-thumb-background: #1d232a;
  --svrollbar-thumb-opacity: 0.7;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}
</style>
