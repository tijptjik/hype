<script lang="ts" generics="T extends Resource, G extends Record<string, unknown>">
// SVELTE
import { untrack } from 'svelte'
// COMPONENTS
import GroupHeader from './components/GroupHeader.svelte'
import ResourceCardRow from './components/ResourceCardRow.svelte'
import ResourceEmptyState from './components/ResourceEmptyState.svelte'
import ResourceTableRow from './components/ResourceTableRow.svelte'
// BITS
import { VirtualList } from '$lib/bits/custom/index/src'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { Panel } from '$lib/enums'
// TYPES
import type { Resource } from '$lib/types'
import type { GroupedResourceIndexProps } from './resourceIndex.types'
import {
  RESOURCE_INDEX_LIST_HORIZONTAL_PADDING_PX,
  RESOURCE_INDEX_TOTAL_HORIZONTAL_PADDING_PX,
} from './resourceIndex.constants'

const GRID_COLUMN_GAP_PX = 16
const CARD_ITEM_WIDTH_PX = 340
const CARD_ROW_HEIGHT_PX = 396
const GRID_ROW_GAP_PX = 16
const TABLE_ROW_HEIGHT_PX = 72
const TABLE_ROW_GAP_PX = 6
const PANEL_TRANSITION_SETTLE_MS = 300

type GroupedResourceIndexItem<T extends Resource, G extends Record<string, unknown>> =
  | {
      kind: 'header'
      id: string
      group: G
      groupId: string
      entityCount: number
      isCollapsed: boolean
    }
  | {
      kind: 'row'
      id: string
      entity: T
      entityIndex: number
    }
  | {
      kind: 'card-row'
      id: string
      entities: T[]
      startingIndex: number
    }

let {
  resource,
  groupedEntities,
  card,
  row,
  listContainer = $bindable(),
  scrollIndexByEntityId = $bindable(),
}: GroupedResourceIndexProps<T, G> = $props()

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

function createCollapsedGroups(
  groups: GroupedResourceIndexProps<T, G>['groupedEntities'],
  currentGroups: Record<string, boolean> = {},
): Record<string, boolean> {
  const nextGroups: Record<string, boolean> = {}

  groups.forEach(({ group }) => {
    const groupId = getGroupId(group)
    nextGroups[groupId] = currentGroups[groupId] ?? false
  })

  return nextGroups
}

function toggleGroup(groupId: string): void {
  collapsedGroups = {
    ...collapsedGroups,
    [groupId]: !(collapsedGroups[groupId] ?? false),
  }
}

// STATE - Track collapsed state for each group
let collapsedGroups = $state.raw<Record<string, boolean>>({})

// Keep group state aligned when the grouped dataset changes.
$effect(() => {
  collapsedGroups = createCollapsedGroups(
    groupedEntities,
    untrack(() => collapsedGroups),
  )
})

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

const flattenedModel = $derived.by(() => {
  const items: GroupedResourceIndexItem<T, G>[] = []
  const nextScrollIndexByEntityId = new Map<string, number>()
  let entityIndex = 0

  for (const groupedEntity of groupedEntities) {
    const groupId = getGroupId(groupedEntity.group)
    const isCollapsed = collapsedGroups[groupId] ?? false

    items.push({
      kind: 'header',
      id: `header:${groupId}`,
      group: groupedEntity.group,
      groupId,
      entityCount: groupedEntity.entities.length,
      isCollapsed,
    })

    if (isCollapsed) {
      continue
    }

    if (isRowLayout || columnCount <= 1) {
      for (const entity of groupedEntity.entities) {
        nextScrollIndexByEntityId.set(entity.id, items.length)
        items.push({
          kind: 'row',
          id: `row:${entity.id}`,
          entity,
          entityIndex,
        })
        entityIndex += 1
      }

      continue
    }

    for (
      let groupEntityIndex = 0;
      groupEntityIndex < groupedEntity.entities.length;
      groupEntityIndex += columnCount
    ) {
      const rowEntities = groupedEntity.entities.slice(
        groupEntityIndex,
        groupEntityIndex + columnCount,
      )

      if (rowEntities.length === 0) {
        continue
      }

      const nextItemIndex = items.length

      for (const entity of rowEntities) {
        nextScrollIndexByEntityId.set(entity.id, nextItemIndex)
      }

      items.push({
        kind: 'card-row',
        id: `card:${groupId}:${rowEntities[0].id}`,
        entities: rowEntities,
        startingIndex: entityIndex,
      })

      entityIndex += rowEntities.length
    }
  }

  return {
    items,
    scrollIndexByEntityId: nextScrollIndexByEntityId,
  }
})

$effect(() => {
  scrollIndexByEntityId = flattenedModel.scrollIndexByEntityId
})

function getGroupId(group: Record<string, unknown>): string {
  if (!group) {
    return 'undefined-group'
  }
  if ('id' in group && typeof group.id === 'string') {
    return group.id
  }
  if ('id' in group && typeof group.id === 'number') {
    return group.id.toString()
  }
  try {
    return JSON.stringify(group)
  } catch {
    return Object.prototype.toString.call(group)
  }
}
</script>

{#snippet children(item: GroupedResourceIndexItem<T, G>, _index: number)}
  {#if item.kind === 'header'}
    <div class="pt-4 pb-2">
      <GroupHeader
        group={item.group}
        isCollapsed={item.isCollapsed}
        entityCount={item.entityCount}
        onToggle={() => toggleGroup(item.groupId)}
      />
    </div>
  {:else if item.kind === 'row'}
    <div class="pb-1.5">
      <ResourceTableRow entity={item.entity} index={item.entityIndex} {row} />
    </div>
  {:else}
    <div class="pb-4">
      <ResourceCardRow
        entities={item.entities}
        startingIndex={item.startingIndex}
        {columnCount}
        {cardWidth}
        {card}
      />
    </div>
  {/if}
{/snippet}

<div
  bind:this={listContainer}
  bind:clientWidth={gridWidth}
  class="flex h-full min-h-0 flex-col overflow-hidden"
>
  {#if groupedEntities.length > 0 && flattenedModel.items.length > 0}
    <div class="bits-resource-index-wrapper relative min-h-0 flex-1">
      <VirtualList
        items={flattenedModel.items}
        {children}
        getKey={item => item.id}
        height="100%"
        {itemHeight}
        canResize={true}
        rowGap={0}
        bufferBefore={6}
        bufferAfter={8}
        padding={RESOURCE_INDEX_LIST_HORIZONTAL_PADDING_PX}
        applyBottomOverflow={true}
      />
    </div>
  {:else}
    <div
      class="bits-resource-index-wrapper bits-resource-index-wrapper--empty relative min-h-0 flex-1"
    >
      <ResourceEmptyState />
    </div>
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
