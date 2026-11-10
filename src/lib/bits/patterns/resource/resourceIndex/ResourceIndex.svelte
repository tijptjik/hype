<script lang="ts" generics="T extends Resource">
// SVELTE
import { untrack, type Snippet } from 'svelte'
import { page } from '$app/state'
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import ResourceCardRow from './components/ResourceCardRow.svelte'
import ResourceEmptyState from './components/ResourceEmptyState.svelte'
import ResourceLoadingState from './components/ResourceLoadingState.svelte'
import ResourceTableRow from './components/ResourceTableRow.svelte'
// BITS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { VirtualList } from '#lib/bits/custom/index/src/index.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { Resource } from '#lib/types.js'
import type { ResourceIndexRowSelectionState } from '#lib/client/services/bulkEdit.types.js'
import type {
  ResourceIndexGridRow,
  ResourceIndexItem,
  ResourceIndexProps,
} from './resourceIndex.types'
import {
  RESOURCE_INDEX_LIST_HORIZONTAL_PADDING_PX,
  RESOURCE_INDEX_TOTAL_HORIZONTAL_PADDING_PX,
} from './resourceIndex.constants'

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
  onNearEnd,
  hasMore = false,
  isLoadingMore = false,
  applyBottomOverflow = true,
  getRowSelectionState,
  onRowSelectionToggle,
}: ResourceIndexProps<T> = $props()

const adminCtx = getAdminCtx()

let gridWidth = $state(0)
let stableColumnCount = $state(1)
let lastKnownPanelOpenState = $state(
  adminCtx.view && typeof adminCtx.view.panels.isPanelOpenOrVisual === 'function'
    ? adminCtx.view.panels.isPanelOpenOrVisual(Panel.admin)
    : false,
)

const layoutMode = $derived(adminCtx.listUi.state.layoutMode[resource])
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

  const usableWidth = Math.max(
    0,
    gridWidth - RESOURCE_INDEX_TOTAL_HORIZONTAL_PADDING_PX,
  )
  const totalGapWidth = Math.max(0, columnCount - 1) * GRID_COLUMN_GAP_PX

  return Math.max(0, (usableWidth - totalGapWidth) / Math.max(1, columnCount))
})

function getColumnCount(nextGridWidth: number, nextLayoutMode: string): number {
  if (nextLayoutMode === 'table' || nextLayoutMode === 'list') {
    return 1
  }

  const usableWidth = Math.max(
    0,
    nextGridWidth - RESOURCE_INDEX_TOTAL_HORIZONTAL_PADDING_PX,
  )
  return Math.max(
    1,
    Math.floor(
      (usableWidth + GRID_COLUMN_GAP_PX) / (CARD_ITEM_WIDTH_PX + GRID_COLUMN_GAP_PX),
    ),
  )
}

function buildItems(): Array<ResourceIndexItem<T>> {
  if (isRowLayout) {
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

type IndexItem = { id: string; value: ResourceIndexItem<T> | null }
type IndexCell = { id: string; entity: T | null; index: number }

// Loading rows live inside the scrollable list, so pagination never shrinks its viewport.
const items = $derived.by((): IndexItem[] => [
  ...buildItems().map(value => ({ id: `resource:${value.id}`, value })),
  ...(hasMore
    ? Array.from({ length: 3 }, (_, index) => ({ id: `loading:${index}`, value: null }))
    : []),
])
let visibleEnd = $state(0)

/** Expand a grid row into stable cells, including placeholders for the next page.
 * @param item Virtual resource or loading row.
 * @returns Real cards or skeleton cells sharing the same grid geometry.
 */
function getGridCells(item: IndexItem): IndexCell[] {
  if (!item.value)
    return Array.from({ length: columnCount }, (_, index) => ({
      id: `${item.id}:${index}`,
      entity: null,
      index,
    }))
  const gridRow = item.value as ResourceIndexGridRow<T>
  return gridRow.entities.map((entity, offset) => ({
    id: entity.id,
    entity,
    index: gridRow.startingIndex + offset,
  }))
}

// Recheck after a page settles even when the visible range did not move.
$effect(() => {
  if (
    isInitialised &&
    entities.length > 0 &&
    hasMore &&
    !isLoadingMore &&
    entities.length - visibleEnd * columnCount <= 10
  ) {
    untrack(() => onNearEnd?.())
  }
})

$effect(() => {
  gridWidth
  layoutMode

  const currentPanelState = adminCtx.view.panels.isPanelOpenOrVisual(Panel.admin)
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

{#snippet children(item: IndexItem, index: number)}
  {#if !item.value}
    <div
      class="px-2"
      role="status"
      aria-busy={isLoadingMore}
      aria-label={m.resource_loading()}
    >
      {@render scrollPlaceholder(TABLE_ROW_HEIGHT_PX)}
    </div>
  {:else if layoutMode === 'card'}
    {@const cardRow = item.value as ResourceIndexGridRow<T>}
    <ResourceCardRow
      entities={cardRow.entities}
      startingIndex={cardRow.startingIndex}
      {columnCount}
      {cardWidth}
      {card}
    />
  {:else if layoutMode === 'table' || layoutMode === 'list'}
    <ResourceTableRow
      entity={item.value as T}
      {index}
      row={row as
        | Snippet<[T, number, ResourceIndexRowSelectionState | null, boolean]>
        | undefined}
      selectionState={getRowSelectionState?.(item.value as T) ?? null}
      onSelectionToggle={onRowSelectionToggle}
    />
  {/if}
{/snippet}

{#snippet cardCell(cell: IndexCell, _index: number)}
  {#if !cell.entity}
    <div role="status" aria-busy={isLoadingMore} aria-label={m.resource_loading()}>
      {@render scrollPlaceholder(CARD_ROW_HEIGHT_PX)}
    </div>
  {:else if card}
    {@render card(cell.entity, cell.index)}
  {:else}
    <article class="rounded-lg p-4"><p>{cell.entity.id}</p></article>
  {/if}
{/snippet}

{#snippet scrollPlaceholder(contentHeight: number)}
  <div
    aria-hidden="true"
    class="border-border bg-panel flex items-center gap-4 overflow-hidden rounded-xl border px-4"
    style:height={`${contentHeight}px`}
  >
    <Skeleton class="size-10 shrink-0 rounded-lg" />
    <Skeleton class="h-4 w-1/3" />
    <Skeleton class="ml-auto h-3 w-1/5" />
  </div>
{/snippet}

<div
  bind:clientWidth={gridWidth}
  bind:this={listContainer}
  data-resource-index
  class="@container/grid flex min-h-0 flex-1 flex-col overflow-hidden overscroll-auto caret-transparent"
>
  {#if isInitialised}
    {#if entities.length > 0 && items.length > 0}
      <div class="bits-resource-index-wrapper relative min-h-0 flex-1">
        <VirtualList
          {items}
          getCells={layoutMode === 'card' ? getGridCells : undefined}
          getCellKey={(cell: IndexCell) =>
            `${page.url.pathname}:${resource}:${cell.id}`}
          cell={cardCell}
          {columnCount}
          columnGap={GRID_COLUMN_GAP_PX}
          {children}
          placeholder={scrollPlaceholder}
          getKey={item => item.id}
          height="100%"
          {itemHeight}
          rowGap={isRowLayout ? TABLE_ROW_GAP_PX : GRID_ROW_GAP_PX}
          bufferBefore={8}
          bufferAfter={10}
          padding={RESOURCE_INDEX_LIST_HORIZONTAL_PADDING_PX}
          {applyBottomOverflow}
          onRangeChange={(_start, end) => {
            visibleEnd = end
          }}
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
    <ResourceLoadingState {isRowLayout} />
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
