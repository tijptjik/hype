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
import { getOperators } from 'drizzle-orm';

// TYPES
type ResourceTypes = 'organisations' | 'projects' | 'layers' | 'features';
type FilterableResourceTypes = 'organisations' | 'projects' | 'layers';
type ResourceFilters = { [key in FilterableResourceTypes]?: string[] };
type Resource = { id: string; nameShort: string; ref: string };

// STATE
let isExpanded = $state(true);
let resources = $state<{ [key in ResourceTypes]: Resource[] }>({
  organisations: [],
  projects: [],
  layers: [],
  features: []
});

// STATE : PROPS
let simpleSignal = $state(false);
let queryFilters = $state<ResourceFilters>({
  organisations: [],
  projects: [],
  layers: []
});

// STATE : DERIVED
let active = $derived(() => {
  const path = $page.url.pathname;
  const parts = path
    .replace(/^\/admin\//, '')
    .split('/')
    .filter(Boolean);

  if (parts.length === 2) {
    return { resourceType: parts[0], ref: parts[1] };
  } else if (parts.length === 1) {
    return { resourceType: parts[0], ref: false };
  } else {
    return { resourceType: false, ref: false };
  }
});

// STATE : EFFECTS
$effect(() => {
  if (active().resourceType) {
    const resourceType = active().resourceType as keyof typeof navItems;
    // Fetch resources for the active resource type
    fetchResources(resourceType);
    // Remove the Query Params for child resources
    deleteQueryParamsForChildResources(resourceType);
  }
});

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
  ['organisations', 'projects', 'layers'].forEach((resourceType) => {
    if (queryFilters[resourceType].length > 0) {
      fetchResources(resourceType as keyof typeof navItems);
    }
  });
});

// CONFIG
const navItems = {
  organisations: { name: 'Organisations', icon: Users, seq: 1, ref: 'organisations' },
  projects: { name: 'Projects', icon: Projects, seq: 2, ref: 'projects' },
  layers: { name: 'Layers', icon: Layers, seq: 3, ref: 'layers' },
  features: { name: 'Features', icon: MapPin, seq: 4, ref: 'features' }
};

const filterableByQueryParams = ['organisations', 'projects', 'layers'];

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
  // console.log('deleteQueryParamsForChildResources', resourceType);
  const activeSeq = navItems[resourceType]?.seq;
  // console.log('activeSeq', activeSeq);
  if (activeSeq) {
    const queryParams = new URLSearchParams($page.url.searchParams.toString());
    // console.log('queryParams', queryParams);
    // console.log('cookie', { filterableByQueryParams });
    $inspect(queryFilters);
    Object.entries(navItems).forEach(([resourceType, item]) => {
      console.log('resourceType', resourceType);
      console.log('item', item);
      if (item.seq > activeSeq && Object.keys(queryFilters).includes(resourceType)) {
        console.log('deleting', resourceType);
        queryParams.delete(resourceType);
      }
    });
    console.log('new queryParams', queryParams);
    goto(`?${queryParams.toString()}`, { replaceState: true });
  }
};

// FUNCTIONS : FETCH

const fetchResources = async (resourceType: keyof typeof navItems) => {
  if (resourceType) {
    try {
      const response = await fetch(`/api/${resourceType}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: {
        id: string;
        nameShort: string;
        name?: string;
        ref?: string;
        code?: string;
        properties?: { title: string };
      }[] = await response.json();
      resources[resourceType] = data.map((item) => ({
        id: item.id,
        nameShort: item.properties?.title || item.nameShort || item.name || '',
        ref: item.ref || item.code || item.id
      }));
    } catch (error) {
      console.error(`Error fetching ${resourceType}:`, error);
    }
  }
};
</script>

<aside
  class="h-screen bg-base-300 transition-all duration-300 ease-in-out {isExpanded
    ? 'w-96'
    : 'w-20'}">
  <div class="flex h-20 items-center justify-between bg-black p-4">
    {#if isExpanded}
      <div class="invisible h-12 w-12"></div>
      <div class="flex w-full items-center justify-center">
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
      <button class="btn btn-circle btn-ghost" onclick={toggleSidebar}>
        <Icon src={Menu} class="h-6 w-6" />
      </button>
    {:else}
      <div class="flex w-full items-center justify-center" onclick={toggleSidebar}>
        <Icon src={Bolt} class="h-8 w-8 text-primary" />
      </div>
    {/if}
  </div>

  <ul class="p-0 border-r-2 border-base-300">
    {#each Object.entries(navItems) as [resourceType, resource]}
      <li class="">
        <a
          href="/admin/{resource.ref}{$page.url.search}"
          class="flex items-center border-l-4 p-6 {active().resourceType === resourceType &&
          !active().ref
            ? 'border-primary'
            : 'border-base-300'} rounded-none">
          <Icon src={resource.icon} class="h-6 w-6" />
          {#if isExpanded}
            <span class="ml-3">{resource.name}</span>
          {/if}
        </a>
        <ul class="max-h-64 min-h-0 divide-y divide-base-300 overflow-y-auto bg-base-100">
          {#each resources[resourceType as keyof typeof resources] as item}
            {#if active().resourceType === resourceType || queryFilters[resourceType]?.includes(item.id)}
              <li class="group relative">
                <div class="relative">
                  <a
                    href="/admin/{resource.ref}/{item.ref}{$page.url.search}"
                    class="flex items-center border-l-4 p-4 pl-6 {active().ref === item.ref
                      ? 'border-primary'
                      : queryFilters[resourceType]?.includes(item.id)
                        ? 'border-secondary'
                        : 'border-base-300'}">
                    <Icon src={ChevronRight} class="h-5 w-5" />
                    {#if isExpanded}
                      <span class="ml-3 text-sm">
                        {item.nameShort}
                      </span>
                    {/if}
                  </a>
                  {#if filterableByQueryParams.includes(resourceType)}
                    <button
                      class="btn btn-circle btn-ghost btn-sm absolute right-4 top-1/2 -translate-y-1/2 opacity-0 transition-all hover:bg-base-200 active:-translate-y-1/2 group-hover:opacity-100"
                      aria-label={queryFilters[resourceType]?.includes(item.id)
                        ? 'Remove item from filters'
                        : 'Add item to filters'}
                      onclick={() => {
                        toggleQueryParam(resourceType, item.id);
                      }}>
                      <Icon
                        src={queryFilters[resourceType]?.includes(item.id) ? Minus : Plus}
                        class="h-4 w-4" />
                    </button>
                  {/if}
                </div>
              </li>
            {/if}
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
</aside>
