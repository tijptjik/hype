<script lang="ts">
import { page } from '$app/stores';
import { Icon } from '@steeze-ui/svelte-icon';
import {
  Bolt,
  Bars3BottomRight as Menu,
  Users,
  Squares2x2 as Projects,
  Square3Stack3d as Layers,
  MapPin,
  ChevronRight,
  Plus,
  Minus
} from '@steeze-ui/heroicons';
import { goto } from '$app/navigation';

import type { ResourceTypes, ResourceFilters, Resource } from '$lib/types';
import { filteredResources } from '$lib/stores/resources.svelte';

// STATE
let isExpanded = $state(true);
let resources = $state<{ [key in ResourceTypes]: Resource[] }>({
  organisation: [],
  project: [],
  layer: [],
  feature: []
});
let filterTexts = $state<{ [key in ResourceTypes]: string }>({
  organisation: '',
  project: '',
  layer: '',
  feature: ''
});
// let filteredResources = $state<{ [key in ResourceTypes]: Resource[] }>({
//   organisation: [],
//   project: [],
//   layer: [],
//   feature: []
// });
let maxHeightItemsContainer = $state<{ [key in ResourceTypes]: string }>({
  organisation: '',
  project: '',
  layer: '',
  feature: ''
});

// STATE : PROPS
let queryFilters = $state<ResourceFilters>({
  organisation: [],
  project: [],
  layer: []
});

// STATE : DERIVED
let active = $derived(() => {
  const path = $page.url.pathname;
  const parts = path
    .replace(/^\/admin\//, '')
    .split('/')
    .filter(Boolean);

  if (parts.length === 2) {
    return { resourceType: parts[0].slice(0, -1) as ResourceTypes, ref: parts[1] };
  } else if (parts.length === 1) {
    return { resourceType: parts[0].slice(0, -1) as ResourceTypes, ref: false };
  } else {
    return { resourceType: false, ref: false };
  }
});

// STATE : EFFECTS

$effect(() => {
  if ($page.url.searchParams) {
    const newQueryFilters: ResourceFilters = {};
    filterableByQueryParams.forEach((resourceType) => {
      newQueryFilters[resourceType as keyof ResourceFilters] =
        $page.url.searchParams.getAll(resourceType);
    });
    queryFilters = newQueryFilters;
  }
});

$effect(() => {
  ['organisation', 'project', 'layer'].forEach((resourceType) => {
    if (queryFilters[resourceType as keyof ResourceFilters].length > 0) {
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
    // $inspect(queryFilters);
    // $inspect(filteredResources['layer']);
    // $inspect(resources['layer']);
    filteredResources[type] = resources[type].filter(
      (item) =>
        filterTexts[type] === '' ||
        item.nameShort.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        item.description?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        queryFilters[type as keyof ResourceFilters]?.includes(item.id)
    );
  });
});

$effect(() => {
  Object.keys(resources).forEach((resourceType) => {
    const type = resourceType as ResourceTypes;
    maxHeightItemsContainer[type] = getMaxHeightItemsContainer(type);
  });
});

// CONFIG
const navItems = {
  organisation: { name: 'Organisations', icon: Users, seq: 1, ref: 'organisations' },
  project: { name: 'Projects', icon: Projects, seq: 2, ref: 'projects' },
  layer: { name: 'Layers', icon: Layers, seq: 3, ref: 'layers' },
  feature: { name: 'Features', icon: MapPin, seq: 4, ref: 'features' }
};

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

const resetFilteredForChildResources = (resourceType: keyof typeof navItems) => {
  const activeSeq = navItems[resourceType]?.seq;
  if (activeSeq) {
    Object.keys(filteredResources).forEach((key) => {
      if (navItems[key as keyof typeof navItems]?.seq > activeSeq) {
        filteredResources[key as keyof typeof filteredResources] = [
          ...resources[key as keyof typeof resources]
        ];
      }
    });
  }
};

// FUNCTIONS : FETCH
const fetchResources = async (resourceType: keyof typeof navItems) => {
  if (resourceType) {
    try {
      const queryParams = new URLSearchParams($page.url.searchParams.toString());
      const response = await fetch(`/api/${navItems[resourceType].ref}?${queryParams}`);
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
        properties?: { title: string };
      }[] = await response.json();
      resources[resourceType] = data.map((item) => ({
        data: item,
        id: item.id,
        nameShort: item.properties?.title || item.nameShort || item.name || '',
        ref: item.ref || item.code || item.id,
        description: item.properties?.description || item.description || '',
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
  $inspect(filteredResources['feature']);
  const itemCount =
    active().resourceType === resourceType || resourceType === 'feature'
      ? filteredResources[resourceType].length
      : queryFilters[resourceType as keyof ResourceFilters]?.length || 0;
  return `${Math.max(itemCount * 54, 54)}px`; // Ensure a minimum of 52px
}
</script>

<!-- SNIPPETS -->
{#snippet filterInput(resourceType)}
  <div class="relative flex-shrink-0 border-l-3 border-base-200">
    <input
      type="text"
      placeholder="Match name and description"
      class="input m-0 w-full rounded-none bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none"
      bind:value={filterTexts[resourceType as keyof typeof filterTexts]} />
    <div class="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-3">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        class="h-4 w-4 stroke-current">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
    </div>
  </div>
{/snippet}

{#snippet filterToggleButton(resourceType, itemId, onHoverOnly = true)}
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

{#snippet filterStat(source, resourceType, label)}
  <p class="flex-grow">
    <span>{source[resourceType]?.length || '-'}</span>
    <span class="text-3xs">{label}</span>
  </p>
{/snippet}
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
          href="/admin/{resource.ref}{$page.url.search}"
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
          {@render filterInput(resourceType)}
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
                    href="/admin/{resource.ref}/{item.ref}{$page.url.search}"
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
                      {@render filterToggleButton(resourceType, item.id, false)}
                    {/if}
                    {#if isExpanded}
                      <span class="ml-3 text-sm">
                        {item.nameShort}
                      </span>
                    {/if}
                  </a>
                  {#if isExpanded && filterableByQueryParams.includes(resourceType)}
                    {@render filterToggleButton(resourceType, item.id)}
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
            {@render filterStat(queryFilters, resourceType, 'Selected')}
          </footer>
        {/if}
      </div>
    {/each}
  </div>
</aside>
