<script lang="ts">
import { slide } from 'svelte/transition';
// LIB
import { navItems } from '$lib/navigation';
// COMPONENTS
import Entities from '$lib/components/sidebar/Entities.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import StatBar from '$lib/components/sidebar/StatBar.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
import { getSidebarState } from '$lib/context/sidebar.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';

let resourceState = getHierarchicalResourceState();
let sidebarState = getSidebarState();

let { resourceType }: { resourceType: HierarchicalResource } = $props();

let isFilterable = $derived(resourceState.hasManyEntities(resourceType));
let showFilters = $derived(
  sidebarState.isOpen() && sidebarState.isSectionOpen(resourceType) && isFilterable
);

/**
 * Calculates the maximum height for the items container based on the resource type.
 *
 * This function determines the appropriate maximum height for the container
 * that holds the list of items for a given resource type. It uses the count
 * of filtered resources and applies a limit to ensure the container doesn't
 * grow too large.
 *
 * @param {HierarchicalResource} resource - The type of resource to calculate the max height for
 * @returns {string} A Tailwind CSS class string for the max-height
 */
const getMaxHeightItemsContainer = (
  resource: HierarchicalResource,
  isFilterable: boolean = false
): string => {
  const count = resourceState.getFilteredResource(resource).length;
  let height = count * 54; // 54px is the height of an entity
  if (isFilterable) {
    height += 54; // Add 54px for the filter
    height += 32; // Add 32px for the footer
  }
  return `${Math.min(height, 540)}px`; // Limit to 10 items (540px) max
};
</script>

<!-- CONTAINER -->
<div
  class="flex flex-col transition-[max-height] duration-300 ease-in-out"
  class:flex-grow={showFilters || navItems[resourceType].isAlwaysExpanded}
  style="max-height: {resourceType != 'feature'
    ? getMaxHeightItemsContainer(resourceType, isFilterable)
    : ''}">
  <!-- FILTER -->
  {#if showFilters}
    <FilterInput {resourceType} />
  {/if}

  <!-- ENTITIES -->
  <Entities {resourceType} />

  <!-- FOOTER -->
  {#if showFilters}
    <StatBar {resourceType} />
  {/if}
</div>
