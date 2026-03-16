<script lang="ts" generics="T extends Resource, G extends Record<string, unknown>">
// SVELTE
import { slide } from 'svelte/transition'
// COMPONENTS
import GroupHeader from '$lib/components/resources/common/GroupHeader.svelte'
import ResourceEmptyState from '$lib/components/resources/common/ResourceEmptyState.svelte'
// BITS
import BitsResourceIndex from '$lib/bits/custom/index/ResourceIndex.svelte'
// TYPES
import type { Resource } from '$lib/types'
import type { GroupedResourceIndexProps } from './resourceIndex.types'

let {
  resource,
  groupedEntities,
  card,
  row,
  listContainer = $bindable(),
}: GroupedResourceIndexProps<T, G> = $props()

// STATE - Track collapsed state for each group
let collapsedGroups = $state<Record<string, boolean>>({})

// Initialize collapsed state for all groups
$effect(() => {
  groupedEntities.forEach(({ group }) => {
    const groupId = getGroupId(group)
    if (!(groupId in collapsedGroups)) {
      collapsedGroups[groupId] = false
    }
  })
})

const groupedRows = $derived(
  groupedEntities.map((groupedEntity, groupIndex) => {
    const groupId = getGroupId(groupedEntity.group)

    return {
      ...groupedEntity,
      groupId,
      groupIndex,
      isCollapsed: collapsedGroups[groupId] ?? false,
    }
  }),
)

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

<div bind:this={listContainer} class="h-full">
  {#if groupedRows.length > 0}
    {#each groupedRows as groupedRow (groupedRow.groupId)}
      <div class="flex flex-col">
        <GroupHeader
          group={groupedRow.group}
          bind:isCollapsed={collapsedGroups[groupedRow.groupId]}
          entityCount={groupedRow.entities.length}
        />

        {#if !groupedRow.isCollapsed}
          <div transition:slide={{ duration: 300 }}>
            <BitsResourceIndex
              {resource}
              entities={groupedRow.entities}
              {card}
              {row}
              applyBottomOverflow={groupedRow.groupIndex === groupedRows.length - 1}
            />
          </div>
        {/if}
      </div>
    {/each}
  {:else}
    <ResourceEmptyState />
  {/if}
</div>
