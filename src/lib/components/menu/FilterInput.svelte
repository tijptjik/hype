<script lang="ts">
import { type ResourceTypes, type ResourceFilters } from '$lib/types';
import {
  resources,
  filteredResources,
  filterTexts,
  queryFilters
} from '$lib/stores/resources.svelte';

// STATE : PROPS
const {
  resourceType,
  rounded = false
}: {
  resourceType: ResourceTypes;
  rounded?: boolean;
} = $props();

// CONFIG

$effect(() => {
  Object.keys(resources).forEach((resourceType) => {
    const type = resourceType;
    filteredResources[type] = resources[type as keyof typeof resources].filter((item) => {
      return (
        filterTexts[type as keyof typeof filterTexts] === '' ||
        item.name.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        item.nameShort?.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        item.description?.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        queryFilters[type as keyof ResourceFilters]?.includes(item.id)
      );
    });
  });
});

// Function to reset the input field
function resetInput() {
  filterTexts[resourceType as keyof typeof filterTexts] = '';
}

// Function to handle keydown events
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    resetInput();
  }
}
</script>

<div class="relative border-l-3 border-base-200 {rounded ? '' : 'flex-shrink-0'}">
  <input
    type="text"
    placeholder="Match name and description"
    class="input m-0 w-full bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none {rounded ? 'min-w-72 h-11 rounded-xl' : 'rounded-none'}"
    bind:value={filterTexts[resourceType as keyof typeof filterTexts]}
    onkeydown={handleKeydown} />
  <div class="absolute inset-y-0 right-2 flex items-center pr-3">
    {#if filterTexts[resourceType as keyof typeof filterTexts]}
      <button onclick={resetInput} class="focus:outline-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="h-4 w-4 stroke-current">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    {:else}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        class="pointer-events-none h-4 w-4 stroke-current">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
    {/if}
  </div>
</div>
