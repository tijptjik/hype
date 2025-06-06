<script lang="ts">
// I18N
import { getI18n } from '$lib/i18n';
// TRANSITIONS
import { slide } from 'svelte/transition';
// LIB
import { ADMIN_PATH, NEW_REF } from '$lib/index';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
import { getSidebarState } from '$lib/context/sidebar.svelte';
// COMPONENTS
import FilterToggle from '$lib/components/sidebar/FilterButton.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/enums';
// NAVIGATION
import { navItems, navigateOnAdmin } from '$lib/navigation';
// ICONS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight } from '@steeze-ui/heroicons';
// TYPES
import type {
  Resource,
  ResourceTypeWithChildren,
  Id,
  Code,
  FilterableResourceType,
  FacetType,
  Task
} from '$lib/types';
import { MapCtx } from '$lib/context/map.svelte';

// CONTEXT
let mapCtx = getMapCtx();

let resourceState = getHierarchicalResourceState();
let sidebarState = getSidebarState();
let { resourceType } = $props();

let isCollapsed = $derived(
  resourceState.hasManyEntities(resourceType) &&
    !sidebarState.isSectionOpen(resourceType)
);

let entities = $derived.by(() => {
  return resourceState.getFilteredResource(resourceType as HierarchicalResource);
});

// CONFIG
const filterableByQueryParams: FilterableResourceType[] = [
  HierarchicalResource.organisation,
  HierarchicalResource.project,
  HierarchicalResource.layer
];

let isFilterable = $derived(resourceState.hasManyEntities(resourceType));
let showFilters = $derived(
  sidebarState.isOpen() && sidebarState.isSectionOpen(resourceType) && isFilterable
);

let isVisible = (id: Id) => {
  return (
    showFilters ||
    (navItems[resourceType as HierarchicalResource].isShownInSidebar &&
      (resourceState.activeResource === resourceType ||
        resourceState.state.prisms[resourceType as ResourceTypeWithChildren]?.includes(
          id
        ) ||
        navItems[resourceType as HierarchicalResource].isAlwaysExpanded))
  );
};

let isPrism = (id: Id) =>
  resourceState.state.prisms[resourceType as ResourceTypeWithChildren]?.includes(id);

let getDisplayName = (entity: Exclude<Resource, Task>) => {
  return getI18n(
    entity,
    {
      [HierarchicalResource.task]: 'title',
      [HierarchicalResource.organisation]: 'name',
      [HierarchicalResource.project]: 'name',
      [HierarchicalResource.layer]: 'name',
      [HierarchicalResource.feature]: 'title'
    }[resourceType as HierarchicalResource],
    mapCtx.getUserPreferences()
  );
};
</script>

<!-- ENTITIES : LIST -->
{#if resourceType}
  <ul
    class="scrollbar-thin divide-y divide-base-300 bg-base-300 {isCollapsed
      ? 'flex-grow-0 overflow-y-auto'
      : 'overflow-y-scroll'}
        {navItems[resourceType as HierarchicalResource].isAlwaysExpanded
      ? 'h-0 flex-grow'
      : ''}"
    in:slide={{ duration: 400, axis: 'y' }}
    out:slide={{ duration: 400, axis: 'y' }}>
    {#each entities as entity}
      {@const entityRef: Id | Code = resourceState.getEntityRef(
      resourceType as HierarchicalResource,
      entity.id as Id
    ) as Id | Code}
      {@const isActive = resourceState.activeEntity === entityRef}
      {@const href = `${ADMIN_PATH}/${resourceState.getEntityPath(
        resourceType as HierarchicalResource,
        entity.id as Id
      )}`}
      {#if isVisible(entity.id as Id)}
        <li class="group relative bg-base-100 drag-none">
          <div class="relative drag-none">
            <a
              draggable="false"
              {href}
              onclick={(e) => {
                e.preventDefault();
                // UGLY HACK - TODO: Fix once SuperForms has proper support for Svelte 5
                if (resourceState.activeEntity === NEW_REF) {
                  window.location.href = href;
                } else {
                  navigateOnAdmin(
                    resourceState,
                    resourceType as HierarchicalResource,
                    entityRef,
                    resourceState.activeFacet as FacetType
                  );
                }
              }}
              class="flex select-none items-center border-l-3 drag-none {!sidebarState.isOpen() &&
              isActive
                ? 'h-[52px] px-4'
                : 'h-[52px] px-6'}"
              class:border-primary={isActive}
              class:border-secondary={!isActive && isPrism(entity.id as Id)}
              class:border-base-300={!isActive && !isPrism(entity.id as Id)}>
              {#if sidebarState.isOpen() || !isActive}
                <span class="ml-[6px] h-4 w-4 text-xs text-white/80"> ●</span>
              {:else if isActive}
                <p class="ml-[3px]">
                  <FilterToggle
                    {resourceType}
                    id={entity.id as Id}
                    onHoverOnly={false} />
                </p>
              {/if}
              {#if sidebarState.isOpen()}
                <span class="ml-3 text-sm font-light">
                  {getDisplayName(entity as Exclude<Resource, Task>)}
                </span>
              {/if}
            </a>
            {#if sidebarState.isOpen() && filterableByQueryParams.includes(resourceType)}
              <FilterToggle {resourceType} id={entity.id as Id} />
            {/if}
          </div>
        </li>
      {/if}
    {/each}
  </ul>
{/if}
