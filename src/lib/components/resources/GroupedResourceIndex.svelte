<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// COMPONENTS
import ResourceFilterBar from './common/ResourceFilterBar.svelte'
import ResourceVirtualList from './common/ResourceVirtualList.svelte'
import GroupHeader from './common/GroupHeader.svelte'
import ResourceEmptyState from './common/ResourceEmptyState.svelte'
// TYPES
import type { Resource } from '$lib/types'
import type { Snippet } from 'svelte'

type GroupedEntity = { group: Record<string, unknown>; entities: Resource[] }

let {
  groupedEntities,
  card,
  row,
  controlBar,
  listContainer = $bindable(),
}: {
  groupedEntities: GroupedEntity[]
  card?: (entity: Resource, index: number) => unknown
  row?: (entity: Resource, index: number) => unknown
  controlBar?: Snippet
  listContainer?: HTMLElement | null
} = $props()

// STATE - Track collapsed state for each group
let collapsedGroups = $state<Record<string, boolean>>({})

// Initialize collapsed state for all groups
$effect(() => {
  groupedEntities.forEach(({ group }) => {
    const groupId = getGroupId(group)
    if (!(groupId in collapsedGroups)) {
      collapsedGroups[groupId] = false // Default to expanded
    }
  })
})

function getGroupId(group: Record<string, unknown>): string {
  if (!group) {
    return 'undefined-group-' + Math.random().toString(36)
  }
  if ('id' in group && typeof group.id === 'string') {
    return group.id
  }
  if ('id' in group && typeof group.id === 'number') {
    return group.id.toString()
  }
  try {
    return JSON.stringify(group)
  } catch (error) {
    // Fallback for circular references or non-serializable objects
    return Object.prototype.toString.call(group) + Math.random().toString(36)
  }
}
</script>

<ResourceFilterBar {controlBar} />
<div bind:this={listContainer} class="h-full">
  {#if groupedEntities.length > 0}
    {#each groupedEntities as groupedEntity, groupIndex}
      <div class="flex flex-col">
        <GroupHeader
          group={groupedEntity.group}
          bind:isCollapsed={collapsedGroups[getGroupId(groupedEntity.group)]}
          entityCount={groupedEntity.entities.length}
        />

        {#if !(collapsedGroups[getGroupId(groupedEntity.group)] ?? false)}
          <div transition:slide={{ duration: 300 }}>
            <ResourceVirtualList
              entities={groupedEntity.entities}
              {card}
              {row}
              applyBottomOverflow={groupIndex === groupedEntities.length - 1}
            />
          </div>
        {/if}
      </div>
    {/each}
  {:else}
    <ResourceEmptyState />
  {/if}
</div>
