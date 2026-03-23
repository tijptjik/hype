<script lang="ts" generics="T extends Resource, G extends Record<string, unknown>">
// SVELTE
import { untrack } from 'svelte'
import { slide } from 'svelte/transition'
// COMPONENTS
import GroupHeader from './components/GroupHeader.svelte'
import ResourceEmptyState from './components/ResourceEmptyState.svelte'
// BITS
import ResourceIndex from './ResourceIndex.svelte'
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

// STATE - Track collapsed state for each group
let collapsedGroups = $state(createCollapsedGroups(groupedEntities))

// Keep group state aligned when the grouped dataset changes.
$effect(() => {
  collapsedGroups = createCollapsedGroups(
    groupedEntities,
    untrack(() => collapsedGroups),
  )
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

<div bind:this={listContainer} class="flex h-full flex-col gap-0 px-4 pt-4">
  {#if groupedRows.length > 0}
    {#each groupedRows as groupedRow (groupedRow.groupId)}
      <section class="flex flex-col">
        <GroupHeader
          group={groupedRow.group}
          bind:isCollapsed={collapsedGroups[groupedRow.groupId]}
          entityCount={groupedRow.entities.length}
        />

        {#if !groupedRow.isCollapsed}
          <div class="min-h-0" transition:slide={{ duration: 300 }}>
            <ResourceIndex
              {resource}
              entities={groupedRow.entities}
              {card}
              {row}
              applyBottomOverflow={groupedRow.groupIndex === groupedRows.length - 1}
            />
          </div>
        {/if}
      </section>
    {/each}
  {:else}
    <ResourceEmptyState />
  {/if}
</div>
