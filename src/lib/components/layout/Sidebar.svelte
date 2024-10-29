<script lang="ts">
import { page } from '$app/stores';
import { Icon } from '@steeze-ui/svelte-icon';
import { Bolt, Bars3BottomRight as Menu, ChevronRight, Plus, Minus } from '@steeze-ui/heroicons';
import { goto } from '$app/navigation';

import {
  type ResourceType,
  type ResourceToEntity,
  type FilterableResourceToEntityId,
  type ApiEntity,
  type FilterableResourceType
} from '$lib/types';
import { resources, filteredResources, queryFilters } from '$lib/stores/resources.svelte';
import { navItems } from '$lib/stores/navigation.svelte';
import { getRouterState } from '$lib/context/router.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';

// CONFIG
const filterableByQueryParams: FilterableResourceType[] = ['organisation', 'project', 'layer'];

// STATE
let isSidebarExpanded = $state(true);

// STATE : CONTEXT
const routerState = getRouterState();

// STATE : EFFECTS

/**
 * Effect to fetch resources and update query params based on active resource
 *
 * This effect runs whenever the routerState.resource changes. It performs two main actions:
 * 1. Fetches resources for the active resource type
 * 2. Removes query parameters for child resources of the active resource
 *
 * @effect
 */
$effect(() => {
  if (routerState.resource) {
    const resourceType = routerState.resource as keyof typeof navItems;

    // Fetch resources for the active resource type
    fetchResources(resourceType);

    // Remove the Query Params for child resources
    deleteQueryParamsForChildResources(resourceType);
  }
});

/**
 * Effect to update query filters based on URL search params
 *
 * This effect runs whenever the page URL changes. It iterates through
 * the filterable resource types and updates the queryFilters store
 * with the values from the URL search params for each resource type.
 */
$effect(() => {
  if ($page.url.searchParams) {
    filterableByQueryParams.forEach((resourceType: FilterableResourceType) => {
      queryFilters[resourceType] = $page.url.searchParams.getAll(resourceType);
    });
  }
});

/**
 * Effect to fetch resources based on query filters
 *
 * This effect runs whenever the queryFilters store changes. It iterates through
 * the filterable resource types and fetches resources for each type that has
 * non-empty query filters. Additionally, it always fetches features regardless
 * of filters.
 */
$effect(() => {
  // Fetch resources for each filterable type with non-empty query filters
  filterableByQueryParams.forEach((resourceType: FilterableResourceType) => {
    if (queryFilters[resourceType]?.length > 0) {
      fetchResources(resourceType);
    }
  });

  // Always refresh the features, regardless of filters
  fetchResources('feature');
});

// FUNCTIONS

/**
 * Toggles the sidebar expansion state
 *
 * This function toggles the `isExpanded` state variable between true and false,
 * effectively expanding or collapsing the sidebar when called.
 */
const toggleSidebar = () => {
  isSidebarExpanded = !isSidebarExpanded;
};

// FUNCTIONS : QUERY PARAMS

/**
 * Toggles a query parameter for a specific resource type and ID
 *
 * This function manages the query parameters in the URL for filtering resources.
 * It adds or removes a specific ID for a given resource type in the query parameters.
 *
 * @param {string} resourceType - The type of resource (e.g., 'organisation', 'project')
 * @param {string} entityId - The ID of the resource to toggle in the query parameters
 */
function toggleQueryParam(resourceType: string, entityId: string) {
  const queryParams = getQueryParams();

  if (queryParams.has(resourceType)) {
    // If the resource type exists in query params
    if (queryParams.has(resourceType, entityId)) {
      // If the specific ID exists, remove it
      queryParams.delete(resourceType, entityId);
    } else {
      // If the ID doesn't exist, add it
      queryParams.append(resourceType, entityId);
    }
  } else {
    // If the resource type doesn't exist, add it with the ID
    queryParams.append(resourceType, entityId);
  }

  // Update the URL with the new query parameters
  goto(`?${queryParams.toString()}`, { replaceState: false });
}

/**
 * Deletes query parameters for child resources based on the given resource type.
 *
 * This function removes query parameters for resources that are considered "children"
 * of the specified resource type. It determines this based on the sequence number
 * of the resources in the navigation items.
 *
 * @param {keyof typeof navItems} resourceType - The type of resource to use as a reference point
 */
const deleteQueryParamsForChildResources = (resourceType: ResourceType) => {
  const activeSeq = navItems[resourceType]?.seq;
  if (activeSeq) {
    const queryParams = getQueryParams();
    Object.entries(navItems).forEach(([type, item]) => {
      if (item.seq > activeSeq && Object.keys(queryFilters).includes(type)) {
        queryParams.delete(type);
      }
    });
    goto(`?${queryParams.toString()}`, { replaceState: true });
  }
};

// FUNCTIONS : FETCH

/**
 * Fetches resources for a given resource type
 *
 * This function fetches resources for a specified resource type from the API.
 * It constructs the URL with the current query parameters and fetches the data.
 * The fetched data is then stored in the resources store.
 *
 * @param {ResourceType} resourceType - The type of resource to fetch
 */
const fetchResources = async (resourceType: ResourceType) => {
  if (resourceType) {
    try {
      const queryParams = getQueryParams();
      const response = await fetch(
        `/api/${navItems[resourceType].path}${queryParams ? `?${queryParams}` : ''}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiEntity[] = await response.json();
      resources[resourceType] = result.map(toEntity);
    } catch (error) {
      console.error(`Error fetching ${resourceType}:`, error);
    }
  }
};

// UTILS

/**
 * Checks if a given resource type has more than 3 entities.
 *
 * @param {ResourceType} resourceType - The type of resource to check.
 * @returns {boolean} True if the resource type has more than 3 entities, false otherwise.
 */
const hasManyEntities = (resourceType: ResourceType): boolean => resources[resourceType].length > 3;

/**
 * Gets the count of filtered resources for a given resource type.
 *
 * This function returns the number of filtered resources for a specified resource type.
 * If the resource type is the current router state's resource type or 'feature',
 * it returns the length of the filtered resources array for that type.
 * Otherwise, it returns the length of the query filters array for that type, or 0 if not present.
 *
 * @param {ResourceType} resourceType - The type of resource to get the count for
 * @returns {number} The count of filtered resources for the given type
 */
const getFilteredResourceCount = (resourceType: ResourceType): number => {
  if (isResourceExpanded(resourceType)) {
    // If the resource is expanded, return the filtered resources
    return filteredResources[resourceType].length;
  } else {
    // Since the filtered entities are pinned, even if the resource is not expanded,
    // the maximum height should allow for the pinned entities.
    return queryFilters[resourceType as FilterableResourceType]?.length || 0;
  }
};

/**
 * Calculates the maximum height for the items container based on the resource type.
 *
 * This function determines the appropriate maximum height for the container
 * that holds the list of items for a given resource type. It uses the count
 * of filtered resources and applies a limit to ensure the container doesn't
 * grow too large.
 *
 * @param {ResourceType} resourceType - The type of resource to calculate the max height for
 * @returns {string} A Tailwind CSS class string for the max-height
 */
const getMaxHeightItemsContainer = (resourceType: ResourceType, isFilterable: boolean = false): string => {
  const count = getFilteredResourceCount(resourceType);
  let height = count * 54; // 54px is the height of an entity
  if (isFilterable) {
    height += 54; // Add 54px for the filter
    height += 32; // Add 32px for the footer
  }
  return `${Math.min(height, 540)}px`; // Limit to 10 items (540px) max
};

/**
 * Calculates the maximum height for the items container based on the resource type.
 *
 * This function determines the appropriate maximum height for the container
 * that holds the list of items for a given resource type. It uses the count
 * of filtered resources and applies a limit to ensure the container doesn't
 * grow too large.
 *
 * @param {ResourceType} resourceType - The type of resource to calculate the max height for
 * @returns {string} A Tailwind CSS class string for the max-height
 */
// TODO: Remove this of getMaxHeightItemsContainer
// const getEntityContainerMaxHeight = (resourceType: ResourceType): string => {
//   const itemCount = isResourceExpanded(resourceType)
//     ? filteredResources[resourceType].length
//     : queryFilters[resourceType as FilterableResourceType]?.length || 0;
//   return `max-h-[${Math.max(itemCount * 54, 54)}px]`; // Ensure a minimum of 52px
// };

/**
 * Retrieves the current URL query parameters.
 *
 * This function creates and returns a new URLSearchParams object
 * based on the current page's URL search parameters. It allows
 * easy access and manipulation of query parameters.
 *
 * @returns {URLSearchParams} A new URLSearchParams object containing the current query parameters
 */
const getQueryParams = (): URLSearchParams => {
  return new URLSearchParams($page.url.searchParams.toString());
};

/**
 * Converts an API entity to a standardized entity format.
 *
 * This function takes an ApiEntity object and transforms it into a standardized
 * entity format with consistent property names and fallback values.
 *
 * @param {ApiEntity} apiEntity - The API entity to be converted
 * @returns {Object} A standardized entity object with the following properties:
 *   - id: The unique identifier of the entity
 *   - name: The full name of the entity (fallback to title or empty string)
 *   - nameShort: A short name or title for the entity (fallback to name or empty string)
 *   - description: A description of the entity (fallback to empty string)
 *   - ref: A reference code for the entity (fallback to id)
 *   - data: The original API entity object
 */
const toEntity = (apiEntity: ApiEntity) => {
  return {
    id: apiEntity.id,
    name: apiEntity.name || apiEntity.properties?.title || '',
    nameShort: apiEntity.properties?.title || apiEntity.nameShort || apiEntity.name || '',
    description: apiEntity.description || apiEntity.properties?.description || '',
    ref: apiEntity.ref || apiEntity.code || apiEntity.id,
    data: apiEntity
  };
};

const isResourceExpanded = (resourceType: ResourceType) => {
  return routerState.resource === resourceType || resourceType === 'feature';
};
</script>

<!-- SNIPPETS -->

{#snippet filterToggleButton(
  resourceType: FilterableResourceType,
  itemId: string,
  onHoverOnly = true
)}
  <button
    class="btn btn-circle btn-ghost btn-sm transition-all {onHoverOnly
      ? 'absolute right-4 top-1/2 -translate-y-1/2  opacity-0 active:-translate-y-1/2 group-hover:opacity-100'
      : ''} hover:bg-base-200"
    aria-label={queryFilters[resourceType]?.includes(itemId)
      ? 'Remove item from filters'
      : 'Add item to filters'}
    onclick={() => toggleQueryParam(resourceType, itemId)}>
    <Icon src={queryFilters[resourceType]?.includes(itemId) ? Minus : Plus} class="h-4 w-4" />
  </button>
{/snippet}

{#snippet filterStat(
  source: ResourceToEntity & FilterableResourceToEntityId,
  resourceType: ResourceType | FilterableResourceType,
  label: string
)}
  <p class="flex-grow">
    <span>{source[resourceType]?.length || '-'}</span>
    <span class="text-3xs">{label}</span>
  </p>
{/snippet}

<!-- DEBUG -->

<!-- <pre>
  {JSON.stringify(queryFilters, null, 2)}
  {JSON.stringify(filteredResources['layer'], null, 2)}
</pre> -->

<!-- COMPONENT -->
<aside
  class="flex h-screen flex-shrink-1 flex-col bg-base-300 transition-all w-{isSidebarExpanded ? '96' : '20'}"
  style="width: {isSidebarExpanded ? '400px' : '80px'};">
  <div class="flex flex-shrink-0 flex-row items-center justify-between bg-black p-4">
    {#if isSidebarExpanded}
      <div class="invisible h-12 w-12"></div>
      <div class="flex w-full items-center justify-center">
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
      <button class="btn btn-circle btn-ghost" onclick={toggleSidebar}>
        <Icon src={Menu} class="h-6 w-6" />
      </button>
    {:else}
      <div class="flex w-full items-center justify-center py-2" onclick={toggleSidebar}>
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
    {/if}
  </div>

  <div class="flex flex-shrink-0 flex-grow flex-col overflow-hidden border-r-2 border-base-300 p-0">
    {#each Object.entries(navItems) as [resourceType, resource]}
      {@const isFilterable = hasManyEntities(resourceType as ResourceType)}
      {@const isSectionExpanded = isResourceExpanded(resourceType as ResourceType)}

      <!-- RESOURCE -->
      <div class="flex-shrink-0">
        <a
          href="/admin/{resource.path}{$page.url.search}"
          class="flex items-center border-l-3 p-6 {routerState.resource === resourceType &&
          !routerState.entity
            ? 'border-primary'
            : 'border-base-300'} rounded-none">
          <Icon src={resource.icon} class="h-6 w-6" />
          {#if isSidebarExpanded}
            <span class="ml-3 font-mono">{resource.name}</span>
          {/if}
        </a>
      </div>

      <!-- ENTITIES -->
      <div
        class="flex flex-col transition-[max-height] duration-300 ease-in-out
        {isFilterable && isSectionExpanded ? 'flex-grow' : ''}"
        style="max-height: {resourceType != 'feature' ? getMaxHeightItemsContainer(resourceType as ResourceType, isFilterable) : ''}">
        
        <!-- ENTITIES : FILTER -->
        {#if isSidebarExpanded && isSectionExpanded && isFilterable}
          <FilterInput {resourceType} />
        {/if}

        <!-- ENTITIES : LIST -->
        <ul
          class="divide-y divide-base-300 bg-base-300
          {isSectionExpanded && isFilterable
            ? 'h-0 flex-grow overflow-y-auto'
            : 'overflow-scroll'}">
          {#each filteredResources[resourceType as FilterableResourceType] as entity}
            {#if routerState.resource === resourceType || queryFilters[resourceType as FilterableResourceType]?.includes(entity.id) || resourceType === 'feature'}
              <li class="group relative bg-base-100">
                <div class="relative">
                  <a
                    href="/admin/{resource.path}/{entity.ref}{$page.url.search}"
                    class="flex items-center border-l-3 {routerState.entity === entity.ref
                      ? 'border-primary'
                      : queryFilters[resourceType as FilterableResourceType]?.includes(entity.id)
                        ? 'border-secondary'
                        : 'border-base-300'}
                        {!isSidebarExpanded && routerState.entity === entity.ref
                      ? 'h-[52px] p-[18px]'
                      : 'p-4 pl-6'}
                        ">
                    {#if isSidebarExpanded || routerState.entity !== entity.ref}
                      <Icon src={ChevronRight} class="h-5 w-5" />
                    {:else if routerState.entity === entity.ref}
                      {@render filterToggleButton(resourceType as FilterableResourceType, entity.id, false)}
                    {/if}
                    {#if isSidebarExpanded}
                      <span class="ml-3 text-sm">
                        {entity.nameShort}
                      </span>
                    {/if}
                  </a>
                  {#if isSidebarExpanded && filterableByQueryParams.includes(resourceType as FilterableResourceType)}
                    {@render filterToggleButton(resourceType as FilterableResourceType, entity.id)}
                  {/if}
                </div>
              </li>
            {/if}
          {/each}
        </ul>

        <!-- ITEMS : FOOTER -->
        {#if isSidebarExpanded && isFilterable && isSectionExpanded}
          <footer
            class="base-content flex w-full flex-shrink-0 flex-row justify-between border-b-1 border-base-100 px-3 py-2 text-center font-mono text-sm font-light uppercase opacity-60">
            {@render filterStat(resources as ResourceToEntity & FilterableResourceToEntityId, resourceType as ResourceType, 'Total')}
            {@render filterStat(filteredResources as ResourceToEntity & FilterableResourceToEntityId, resourceType as FilterableResourceType, 'Filtered')}
            {@render filterStat(queryFilters as ResourceToEntity & FilterableResourceToEntityId, resourceType as FilterableResourceType, 'Selected')}
          </footer>
        {/if}
      </div>
    {/each}
  </div>
</aside>
