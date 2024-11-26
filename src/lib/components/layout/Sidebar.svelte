<script lang="ts">
import { goto } from '$app/navigation';
import { getURLfromImage } from '$lib/db/services/image';
// STORES
import { page } from '$app/stores';
import {
  resources,
  filteredResources,
  queryPrimsParams,
  queryFilterParams
} from '$lib/stores/resources.svelte';
import { navItems } from '$lib/stores/navigation.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import {
  Bolt,
  Bars3BottomRight as Menu,
  ChevronRight,
  Plus,
  Minus
} from '@steeze-ui/heroicons';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
// TYPES
import type {
  Resource,
  ResourceType,
  ResourceToEntity,
  FilterableResourceToEntityId,
  ApiEntity,
  FilterableResourceType,
  EntityWithData,
  Ref,
  FacetType,
  GetImageAPI
} from '$lib/types';

// CONFIG
const filterableByQueryParams: FilterableResourceType[] = [
  'organisation',
  'project',
  'layer'
];

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
    const resource = routerState.resource;

    // Fetch resources for the active resource type
    fetchResources(resource);

    // Remove the Query Params for child resources
    deleteQueryParamsForChildResources(resource);
  }
});

/**
 * Effect to update query filters based on URL search params
 *
 * This effect runs whenever the page URL changes. It iterates through
 * the filterable resource types and updates the queryPrimsParams store
 * with the values from the URL search params for each resource type.
 */
$effect(() => {
  if ($page.url.searchParams) {
    filterableByQueryParams.forEach((resource: FilterableResourceType) => {
      queryPrimsParams[resource] = $page.url.searchParams.getAll(resource);
    });
  }
});

/**
 * Effect to fetch resources based on query filters
 *
 * This effect runs whenever the queryPrimsParams store changes. It iterates through
 * the filterable resource types and fetches resources for each type that has
 * non-empty query filters. Additionally, it always fetches features regardless
 * of filters.
 */
$effect(() => {
  // Fetch resources for each filterable type with non-empty query filters
  filterableByQueryParams.forEach((resource: FilterableResourceType) => {
    if (queryPrimsParams[resource]?.length > 0) {
      fetchResources(resource);
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
 * @param {string} resource - The type of resource (e.g., 'organisation', 'project')
 * @param {string} entityId - The ID of the resource to toggle in the query parameters
 */
function toggleQueryParam(resource: string, entityId: string) {
  const queryParams = getQueryParams();

  if (queryParams.has(resource)) {
    // If the resource type exists in query params
    if (queryParams.has(resource, entityId)) {
      // If the specific ID exists, remove it
      queryParams.delete(resource, entityId);
    } else {
      // If the ID doesn't exist, add it
      queryParams.append(resource, entityId);
    }
  } else {
    // If the resource type doesn't exist, add it with the ID
    queryParams.append(resource, entityId);
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
 * @param {keyof typeof navItems} resource - The type of resource to use as a reference point
 */
const deleteQueryParamsForChildResources = (resource: ResourceType) => {
  const activeSeq = navItems[resource]?.seq;
  if (activeSeq) {
    const queryParams = getQueryParams();
    Object.entries(navItems).forEach(([type, item]) => {
      if (item.seq > activeSeq && Object.keys(queryPrimsParams).includes(type)) {
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
 * @param {ResourceType} resource - The type of resource to fetch
 */
// TODO Move this to /admin/+layout.svelte
const fetchResources = async (resource: ResourceType) => {
  if (resource) {
    try {
      const queryParams = getQueryParams();
      const response = await fetch(
        `/api/${navItems[resource].path}${queryParams ? `?${queryParams}` : ''}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: ApiEntity[] = await response.json();
      resources[resource] = result.map(toEntity);
    } catch (error) {
      console.error(`Error fetching ${resource}:`, error);
    }
  }
};

// UTILS

/**
 * Checks if a given resource type has more than 3 entities.
 *
 * @param {ResourceType} resource - The type of resource to check.
 * @returns {boolean} True if the resource type has more than 3 entities, false otherwise.
 */
const hasManyEntities = (resource: ResourceType): boolean =>
  resources[resource].length > 3;

/**
 * Gets the count of filtered resources for a given resource type.
 *
 * This function returns the number of filtered resources for a specified resource type.
 * If the resource type is the current router state's resource type or 'feature',
 * it returns the length of the filtered resources array for that type.
 * Otherwise, it returns the length of the query filters array for that type, or 0 if not present.
 *
 * @param {ResourceType} resource - The type of resource to get the count for
 * @returns {number} The count of filtered resources for the given type
 */
const getFilteredResourceCount = (resource: ResourceType): number => {
  if (expandedState[resource]) {
    // If the resource is expanded, return the filtered resources
    return filteredResources[resource].length;
  } else {
    // Since the filtered entities are pinned, even if the resource is not expanded,
    // the maximum height should allow for the pinned entities.
    return queryPrimsParams[resource as FilterableResourceType]?.length || 0;
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
 * @param {ResourceType} resource - The type of resource to calculate the max height for
 * @returns {string} A Tailwind CSS class string for the max-height
 */
const getMaxHeightItemsContainer = (
  resource: ResourceType,
  isFilterable: boolean = false
): string => {
  const count = getFilteredResourceCount(resource);
  let height = count * 54; // 54px is the height of an entity
  if (isFilterable) {
    height += 54; // Add 54px for the filter
    height += 32; // Add 32px for the footer
  }
  return `${Math.min(height, 540)}px`; // Limit to 10 items (540px) max
};

/**
 * Retrieves the current URL query parameters.
 *
 * This function creates and returns a new URLSearchParams object
 * based on the current page's URL search parameters. It allows
 * easy access and manipulation of query parameters.
 *
 * @returns {URLSearchParams} A new URLSearchParams object containing the current query parameters
 */
const getQueryParams = (includeParams: string[] = ['organisation', 'project', 'layer']): URLSearchParams => {
  const queryParams = new URLSearchParams($page.url.searchParams.toString());
  
  // Get all parameter names
  const paramNames = Array.from(queryParams.keys());
  
  // Remove parameters that aren't in includeParams
  paramNames.forEach(param => {
    if (!includeParams.includes(param)) {
      queryParams.delete(param);
    }
  });
  
  return queryParams;
};

const toImage = (image: GetImageAPI | undefined): string => {
  if (image) {
    return getURLfromImage(image, 'c_fit,h_320,w_320');
  }
  return 'https://generative-placeholders.glitch.me/image?width=720&height=720&style=cellular-automata&cells=9';
}

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
const toEntity = (apiEntity: ApiEntity): EntityWithData<Resource> => {
  let entity: EntityWithData<Resource> = {
    id: apiEntity.id,
    name: apiEntity.name || apiEntity.title || apiEntity.feature?.title || '',
    nameShort: apiEntity.title || apiEntity.nameShort || apiEntity.name || apiEntity.project?.name || '',
    description: apiEntity.description || apiEntity.description || apiEntity.feature?.description || '',
    address: apiEntity.displayAddress || apiEntity.feature?.displayAddress || '',
    ref: apiEntity.ref || apiEntity.code || apiEntity.id,
    image: toImage(apiEntity.image),
    data: apiEntity
  };
  if (apiEntity.feature) {
    console.log(entity);
  }
  return entity;
};

// Replace the isResourceExpanded function with a derived object
let expandedState : Record<ResourceType, boolean> = $derived({
  organisation: routerState.resource === 'organisation',
  project: routerState.resource === 'project',
  layer: routerState.resource === 'layer',
  feature: true,
  task: false
})

const goToResource = (e: Event, resourceType: ResourceType) => {
  e.preventDefault();
  const url = new URL(window.location.href);
  url.pathname = `/admin/${navItems[resourceType].path}`;
  // UPDATE ROUTER STATE
  routerState.updateWith({
    resource: resourceType,
    entity: false,
    facet: false
  });
  // NAVIGATE
  navigate(url.toString());
};

const goToEntity = (e: Event, resourceType: ResourceType, entityPath: Ref) => {
  e.preventDefault();
  let facet = 'core';
  const url = new URL(window.location.href);
  url.pathname = `/admin/${navItems[resourceType].path}/${entityPath}`;
  if (resourceType === routerState.resource && routerState.facet) {
    facet = routerState.facet;
  }
  // url.hash = `#${facet}`;
  // UPDATE ROUTER STATE
  routerState.updateWith({
    resource: resourceType,
    entity: entityPath,
    facet: facet as FacetType
  });
  // NAVIGATE
  navigate(url.toString());
};

const navigate = (url: string) => {
  goto(url).then(() => goto(url));
}
</script>

<!-- SNIPPETS -->

{#snippet filterToggleButton(
  resource: FilterableResourceType,
  itemId: string,
  onHoverOnly = true
)}
  <button
    class="btn btn-circle btn-ghost btn-sm transition-all {onHoverOnly
      ? 'absolute right-4 top-1/2 -translate-y-1/2  opacity-0 active:-translate-y-1/2 group-hover:opacity-100'
      : ''} hover:bg-base-200"
    aria-label={queryPrimsParams[resource]?.includes(itemId)
      ? 'Remove item from filters'
      : 'Add item to filters'}
    onclick={() => toggleQueryParam(resource, itemId)}>
    <Icon
      src={queryPrimsParams[resource]?.includes(itemId) ? Minus : Plus}
      class="h-4 w-4" />
  </button>
{/snippet}

{#snippet filterStat(
  source: ResourceToEntity & FilterableResourceToEntityId,
  resource: ResourceType | FilterableResourceType,
  label: string
)}
  <p class="flex-grow">
    <span>{source[resource]?.length || '-'}</span>
    <span class="text-3xs">{label}</span>
  </p>
{/snippet}

<!-- COMPONENT -->
<aside
  class="flex-shrink-1 flex h-screen flex-col bg-base-300 transition-all w-{isSidebarExpanded
    ? '96'
    : '20'}"
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

  <div
    class="flex flex-shrink-0 flex-grow flex-col overflow-hidden border-r-2 border-base-300 p-0">
    {#each Object.entries(navItems).filter(([_, resource]) => resource.isShownInSidebar) as [resourceType, resource]}
      {@const isFilterable = hasManyEntities(resourceType as ResourceType)}

      <!-- RESOURCE -->
      <div class="flex-shrink-0">
        <a
          draggable="false"
          href="/admin/{resource.path}{$page.url.search}"
          onclick={(e) => goToResource(e, resourceType as ResourceType)}
          class="flex items-center border-l-3 p-6 select-none {routerState.resource ===
            resourceType && !routerState.entity
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
        {isFilterable && expandedState[resourceType as ResourceType] ? 'flex-grow' : ''}"
        style="max-height: {resourceType != 'feature'
          ? getMaxHeightItemsContainer(resourceType as ResourceType, isFilterable)
          : ''}">
        <!-- ENTITIES : FILTER -->
        {#if isSidebarExpanded && expandedState[resourceType as ResourceType] && isFilterable}
          <FilterInput {resourceType}/>
        {/if}

        <!-- ENTITIES : LIST -->
        <ul
          class="divide-y divide-base-300 bg-base-300
          {expandedState[resourceType as ResourceType] && isFilterable
            ? 'h-0 flex-grow overflow-y-auto'
            : 'overflow-scroll'}">
          {#each filteredResources[resourceType as FilterableResourceType] as entity}
            {#if (routerState.resource === resourceType || queryPrimsParams[resourceType as FilterableResourceType]?.includes(entity.id) || navItems[resourceType as ResourceType].isAlwaysExpanded) && navItems[resourceType as ResourceType].isShownInSidebar}
              <li class="group relative bg-base-100 drag-none">
                <div class="relative drag-none">
                  <a
                    draggable="false"
                    href="/admin/{resource.path}/{entity.ref}{$page.url.search}"
                    onclick={(e) =>
                      goToEntity(e, resourceType as ResourceType, entity.ref)}
                    class="flex select-none drag-none items-center border-l-3 {routerState.entity ===
                    entity.ref
                      ? 'border-primary'
                      : queryPrimsParams[resourceType as FilterableResourceType]?.includes(
                            entity.id
                          )
                        ? 'border-secondary'
                        : 'border-base-300'}
                        {!isSidebarExpanded && routerState.entity === entity.ref
                      ? 'h-[52px] p-[18px]'
                      : 'p-4 pl-6'}
                        ">
                    {#if isSidebarExpanded || routerState.entity !== entity.ref}
                      <Icon src={ChevronRight} class="h-5 w-5" />
                    {:else if routerState.entity === entity.ref}
                      {@render filterToggleButton(
                        resourceType as FilterableResourceType,
                        entity.id,
                        false
                      )}
                    {/if}
                    {#if isSidebarExpanded}
                      <span class="ml-3 text-sm">
                        {entity.nameShort}
                      </span>
                    {/if}
                  </a>
                  {#if isSidebarExpanded && filterableByQueryParams.includes(resourceType as FilterableResourceType)}
                    {@render filterToggleButton(
                      resourceType as FilterableResourceType,
                      entity.id
                    )}
                  {/if}
                </div>
              </li>
            {/if}
          {/each}
        </ul>

        <!-- ITEMS : FOOTER -->
        {#if isSidebarExpanded && isFilterable && expandedState[resourceType as ResourceType]}
          <footer
            class="base-content flex w-full flex-shrink-0 flex-row justify-between border-b-1 border-base-100 px-3 py-2 text-center font-mono text-sm font-light uppercase opacity-60">
            {@render filterStat(
              resources as ResourceToEntity & FilterableResourceToEntityId,
              resourceType as ResourceType,
              'Total'
            )}
            {@render filterStat(
              filteredResources as ResourceToEntity & FilterableResourceToEntityId,
              resourceType as FilterableResourceType,
              'Filtered'
            )}
            {@render filterStat(
              queryPrimsParams as ResourceToEntity & FilterableResourceToEntityId,
              resourceType as FilterableResourceType,
              'Selected'
            )}
          </footer>
        {/if}
      </div>
    {/each}
  </div>
</aside>
