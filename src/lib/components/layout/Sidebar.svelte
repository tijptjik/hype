<script lang="ts">
import { page } from '$app/stores';
import { Icon } from '@steeze-ui/svelte-icon';
import { Bolt, Bars3BottomRight as Menu, ChevronRight, Plus, Minus } from '@steeze-ui/heroicons';
import { goto } from '$app/navigation';

import type { Resource, ResourceTypes, ResourceFilters } from '$lib/types';
import {
  resources,
  filteredResources,
  queryFilters
} from '$lib/stores/resources.svelte';
import { navItems } from '$lib/stores/navigation.svelte';
import { getActiveFromPath } from '$lib';
import FilterInput from '$lib/components/menu/FilterInput.svelte';

// STATE

let isExpanded = $state(true);

let maxHeightItemsContainer = $state<{ [key in ResourceTypes]: string }>({
  organisation: '',
  project: '',
  layer: '',
  feature: ''
});

// STATE : DERIVED

const active = $derived(() => {
  return getActiveFromPath($page.url.pathname);
});

// STATE : EFFECTS

$effect(() => {
  if ($page.url.searchParams) {
    filterableByQueryParams.forEach((resourceType) => {
      queryFilters[resourceType as keyof ResourceFilters] =
        $page.url.searchParams.getAll(resourceType);
    });
  }
});

$effect(() => {
  ['organisation', 'project', 'layer'].forEach((resourceType: string) => {
    if (queryFilters[resourceType as keyof ResourceFilters]?.length > 0) {
      fetchResources(resourceType as keyof typeof navItems);
    }
  });
  // Always refetch features
  fetchResources('feature');
});

$effect(() => {
  if (active().resourceType) {
    const resourceType = active().resourceType as keyof typeof navItems;
    // Fetch resources for the active resource type
    fetchResources(resourceType);
    // Remove the Query Params for child resources
    deleteQueryParamsForChildResources(resourceType);
    // Reset filteredResources for child resources
    // resetFilteredForChildResources(resourceType);
  }
});


$effect(() => {
  Object.keys(resources).forEach((resourceType) => {
    const type = resourceType as ResourceTypes;
    maxHeightItemsContainer[type] = getMaxHeightItemsContainer(type);
  });
});

// CONFIG
const filterableByQueryParams = ['organisation', 'project', 'layer'];

// FUNCTIONS
const toggleSidebar = () => {
  isExpanded = !isExpanded;
};

// FUNCTIONS : QUERY PARAMS
function toggleQueryParam(resourceType: string, id: string) {
  let queryParams = new URLSearchParams($page.url.searchParams.toString());
  if (queryParams.has(resourceType)) {
    if (queryParams.has(resourceType, id)) {
      queryParams.delete(resourceType, id);
    } else {
      queryParams.append(resourceType, id);
    }
  } else {
    queryParams.append(resourceType, id);
  }
  goto(`?${queryParams.toString()}`, { replaceState: false });
}

const deleteQueryParamsForChildResources = (resourceType: keyof typeof navItems) => {
  const activeSeq = navItems[resourceType]?.seq;
  if (activeSeq) {
    const queryParams = new URLSearchParams($page.url.searchParams.toString());
    Object.entries(navItems).forEach(([resourceType, item]) => {
      if (item.seq > activeSeq && Object.keys(queryFilters).includes(resourceType)) {
        queryParams.delete(resourceType);
      }
    });
    goto(`?${queryParams.toString()}`, { replaceState: true });
  }
};

// FUNCTIONS : FETCH
const fetchResources = async (resourceType: keyof typeof navItems) => {
  if (resourceType) {
    try {
      const queryParams = new URLSearchParams($page.url.searchParams.toString());
      const response = await fetch(`/api/${navItems[resourceType].path}?${queryParams}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: {
        id: string;
        nameShort: string;
        name?: string;
        description?: string;
        ref?: string;
        code?: string;
        properties?: { title: string; description: string };
      }[] = await response.json();
      resources[resourceType] = data.map((item) => ({
        id: item.id,
        name: item.name || item.properties?.title || '',
        nameShort: item.properties?.title || item.nameShort || item.name || '',
        description: item.description || item.properties?.description || '',
        ref: item.ref || item.code || item.id,
        data: item,
      }));
    } catch (error) {
      console.error(`Error fetching ${resourceType}:`, error);
    }
  }
};

// UTILS
const hasManyResources = (resourceType: string) =>
  resources[resourceType as keyof typeof resources].length > 3;

const getFilteredResourceCount = (resourceType: ResourceTypes) => {
  if (active().resourceType == resourceType || resourceType === 'feature') {
    return filteredResources[resourceType].length;
  } else {
    return queryFilters[resourceType as keyof ResourceFilters]?.length || 0;
  }
};

const getMaxHeightItemsContainer = (resourceType: ResourceTypes) => {
  const count = getFilteredResourceCount(resourceType);
  const maxHeight = Math.min(count * 52, 520); // Limit to 10 items (520px) max
  return `max-h-${maxHeight / 4}`;
};

function getMaxHeight(resourceType: ResourceTypes): string {
  const itemCount =
    active().resourceType === resourceType || resourceType === 'feature'
      ? filteredResources[resourceType].length
      : queryFilters[resourceType as keyof ResourceFilters]?.length || 0;
  return `${Math.max(itemCount * 54, 54)}px`; // Ensure a minimum of 52px
}
</script>

<!-- SNIPPETS -->

{#snippet filterToggleButton(resourceType: ResourceTypes, itemId: string, onHoverOnly = true)}
  <button
    class="btn btn-circle btn-ghost btn-sm transition-all {onHoverOnly
      ? 'absolute right-4 top-1/2 -translate-y-1/2  opacity-0 active:-translate-y-1/2 group-hover:opacity-100'
      : ''} hover:bg-base-200"
    aria-label={queryFilters[resourceType as keyof ResourceFilters]?.includes(itemId)
      ? 'Remove item from filters'
      : 'Add item to filters'}
    onclick={() => toggleQueryParam(resourceType, itemId)}>
    <Icon
      src={queryFilters[resourceType as keyof ResourceFilters]?.includes(itemId) ? Minus : Plus}
      class="h-4 w-4" />
  </button>
{/snippet}

{#snippet filterStat(source: { [key in ResourceTypes]: Resource[] }, resourceType: ResourceTypes, label: string )}
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
  class="flex h-screen flex-col bg-base-300 transition-all w-{isExpanded ? '96' : '20'}"
  style="width: {isExpanded ? '400px' : '80px'};">
  <div class="flex flex-shrink-0 flex-row items-center justify-between bg-black p-4">
    {#if isExpanded}
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
      <!-- RESOURCE -->
      <div class="flex-shrink-0">
        <a
          href="/admin/{resource.path}{$page.url.search}"
          class="flex items-center border-l-3 p-6 {active().resourceType === resourceType &&
          !active().ref
            ? 'border-primary'
            : 'border-base-300'} rounded-none">
          <Icon src={resource.icon} class="h-6 w-6" />
          {#if isExpanded}
            <span class="ml-3 font-mono">{resource.name}</span>
          {/if}
        </a>
      </div>

      <!-- ITEMS -->
      <div
        class="duration-00 flex flex-col transition-[max-height] ease-in-out {hasManyResources(
          resourceType
        ) &&
        (active().resourceType === resourceType || resourceType === 'feature')
          ? 'flex-grow'
          : ''}"
        style={hasManyResources(resourceType)
          ? ''
          : 'max-height: ' + getMaxHeight(resourceType as ResourceTypes)}>
        <!-- ITEMS : FILTER -->
        {#if isExpanded && hasManyResources(resourceType) && (active().resourceType === resourceType || resourceType === 'feature')}
          <FilterInput {resourceType} />
        {/if}

        <!-- ITEMS : LIST -->
        <ul
          class="divide-y divide-base-300 bg-base-300
          {hasManyResources(resourceType) &&
          (active().resourceType === resourceType || resourceType === 'feature')
            ? 'h-0 flex-grow overflow-y-auto'
            : 'overflow-scroll'}">
          {#each filteredResources[resourceType as keyof typeof filteredResources] as item}
            {#if active().resourceType === resourceType || queryFilters[resourceType as keyof ResourceFilters]?.includes(item.id) || resourceType === 'feature'}
              <li class="group relative bg-base-100">
                <div class="relative">
                  <a
                    href="/admin/{resource.path}/{item.ref}/core{$page.url.search}"
                    class="flex items-center border-l-3 {active().ref === item.ref
                      ? 'border-primary'
                      : queryFilters[resourceType as keyof ResourceFilters]?.includes(item.id)
                        ? 'border-secondary'
                        : 'border-base-300'}
                        {!isExpanded && active().ref === item.ref
                      ? 'h-[52px] p-[18px]'
                      : 'p-4 pl-6'}
                        ">
                    {#if isExpanded || active().ref !== item.ref}
                      <Icon src={ChevronRight} class="h-5 w-5" />
                    {:else if active().ref === item.ref}
                      {@render filterToggleButton(resourceType as ResourceTypes, item.id, false)}
                    {/if}
                    {#if isExpanded}
                      <span class="ml-3 text-sm">
                        {item.nameShort}
                      </span>
                    {/if}
                  </a>
                  {#if isExpanded && filterableByQueryParams.includes(resourceType)}
                    {@render filterToggleButton(resourceType as ResourceTypes, item.id)}
                  {/if}
                </div>
              </li>
            {/if}
          {/each}
        </ul>

        <!-- ITEMS : FOOTER -->
        {#if isExpanded && hasManyResources(resourceType) && (active().resourceType === resourceType || resourceType === 'feature')}
          <footer
            class="base-content flex w-full flex-shrink-0 flex-row justify-between border-b-1 border-base-100 px-3 py-2 text-center font-mono text-sm font-light uppercase opacity-60">
            {@render filterStat(resources, resourceType, 'Total')}
            {@render filterStat(filteredResources, resourceType, 'Filtered')}
            {@render filterStat(queryFilters[resourceType], resourceType, 'Selected')}
          </footer>
        {/if}
      </div>
    {/each}
  </div>
</aside>
