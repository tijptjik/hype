<script lang="ts" generics="T extends Resource, G extends Record<string, any>">
// SVELTE
import { slide } from 'svelte/transition';
// COMPONENTS
import ResourceFilterBar from './common/ResourceFilterBar.svelte';
import ResourceVirtualList from './common/ResourceVirtualList.svelte';
import GroupHeader from './common/GroupHeader.svelte';
import ResourceEmptyState from './common/ResourceEmptyState.svelte';
// TYPES
import type { Resource } from '$lib/types';
import type { Snippet } from 'svelte';

let {
  groupedEntities,
  card,
  row,
  controlBar,
  listContainer = $bindable()
}: {
  groupedEntities: Array<{ group: G; entities: T[] }>;
  card?: (entity: T, index: number) => any;
  row?: (entity: T, index: number) => any;
  controlBar?: Snippet;
  listContainer?: HTMLElement | null;
} = $props();

// STATE - Track collapsed state for each group
let collapsedGroups = $state<Record<string, boolean>>({});

// Initialize collapsed state for all groups
$effect(() => {
  groupedEntities.forEach(({ group }) => {
    const groupId = (group as any).id ?? JSON.stringify(group);
    if (!(groupId in collapsedGroups)) {
      collapsedGroups[groupId] = false; // Default to expanded
    }
  });
});

function getGroupId(group: G): string {
  return (group as any).id ?? JSON.stringify(group);
}
</script>

<ResourceFilterBar {controlBar} />
<div bind:this={listContainer}>
  {#if groupedEntities.length > 0}
    {#each groupedEntities as { group, entities }, groupIndex (getGroupId(group))}
      {@const groupId = getGroupId(group)}
      {@const isCollapsed = collapsedGroups[groupId] ?? false}

      <div class="flex flex-col">
        <GroupHeader
          {group}
          bind:isCollapsed={collapsedGroups[groupId]}
          entityCount={entities.length} />

        {#if !isCollapsed}
          <div transition:slide={{ duration: 300 }}>
            <ResourceVirtualList {entities} {card} {row} />
          </div>
        {/if}
      </div>
    {/each}
  {:else}
    <ResourceEmptyState />
  {/if}
</div>
