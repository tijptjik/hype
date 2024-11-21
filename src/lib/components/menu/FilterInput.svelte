<script lang="ts">
// COMPONENTS
import { MagnifyingGlass, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import {
  resources,
  filteredResources,
  filterTexts,
  queryFilters
} from '$lib/stores/resources.svelte';
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type {
  ResourceRouter,
  ResourceType,
  FilterableResourceToEntityId,
  EntityWithData
} from '$lib/types';

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as ResourceRouter;

// STATE : PROPS
const {
  rounded = false
}: {
  rounded?: boolean;
} = $props();

// STATE : DERIVED :: FILTERED RESOURCES
$effect(() => {
  Object.keys(resources).forEach((resource) => {
    const type = resource as ResourceType;
    filteredResources[type] = resources[type].filter((item) => {
      return (
        filterTexts[type] === '' ||
        item.name.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        item.nameShort?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        item.description?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        item.address?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
        queryFilters[type as keyof FilterableResourceToEntityId]?.includes(item.id)
      );
    }) as EntityWithData<typeof type>[];
  });
});

// Function to reset the input field
function resetInput() {
  filterTexts[routerState.resource as keyof typeof filterTexts] = '';
}

// Function to handle keydown events
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    resetInput();
  }
}
</script>

<div class="relative {rounded ? '' : 'flex-shrink-0 border-l-3 border-base-200'}">
  <input
    type="text"
    placeholder="Match name and description"
    class="input m-0 w-full bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none {rounded
      ? 'h-10 min-w-72 rounded-xl'
      : 'rounded-none'}"
    bind:value={filterTexts[routerState.resource as keyof typeof filterTexts]}
    onkeydown={handleKeydown} />
  <div class="absolute inset-y-0 right-2 flex items-center pr-3">
    {#if filterTexts[routerState.resource as keyof typeof filterTexts]}
      <button onclick={resetInput} class="focus:outline-none">
        <Icon src={XMark} class="h-6 w-6" />
      </button>
    {:else}
      <Icon src={MagnifyingGlass} class="h-6 w-6" />
    {/if}
  </div>
</div>
