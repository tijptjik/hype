<script lang="ts">
import { type ResourceType, type FilterableResourceToEntityId } from '$lib/types';
import {
  resources,
  filteredResources,
  filterTexts,
  queryFilters
} from '$lib/stores/resources.svelte';
import { MagnifyingGlass, XMark } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';

// STATE : PROPS
const {
  resourceType,
  rounded = false
}: {
  resourceType: ResourceType;
  rounded?: boolean;
} = $props();

// CONFIG

$effect(() => {
  Object.keys(resources).forEach((resourceType) => {
    const type = resourceType;
    filteredResources[type as keyof typeof filteredResources] = resources[type as keyof typeof resources].filter((item) => {
      return (
        filterTexts[type as keyof typeof filterTexts] === '' ||
        item.name.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        item.nameShort?.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        item.description?.toLowerCase().includes(filterTexts[type as keyof typeof filterTexts].toLowerCase()) ||
        queryFilters[type as keyof FilterableResourceToEntityId]?.includes(item.id)
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
    class="input m-0 w-full bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none {rounded ? 'min-w-72 h-10 rounded-xl' : 'rounded-none'}"
    bind:value={filterTexts[resourceType as keyof typeof filterTexts]}
    onkeydown={handleKeydown} />
  <div class="absolute inset-y-0 right-2 flex items-center pr-3">
    {#if filterTexts[resourceType as keyof typeof filterTexts]}
      <button onclick={resetInput} class="focus:outline-none">
        <Icon src={XMark} class="h-6 w-6" />
      </button>
      {:else}
      <Icon src={MagnifyingGlass} class="h-6 w-6" />
    {/if}
  </div>
</div>
