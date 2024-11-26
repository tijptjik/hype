<script lang="ts">
// APP
import { goto } from '$app/navigation';
// COMPONENTS
import { MagnifyingGlass, XMark, Sun } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
import { afterNavigate } from '$app/navigation';
// CONTEXT
import {
  resources,
  filteredResources,
  filterTexts,
  queryPrimsParams,
  queryFilterParams
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
  rounded = false,
  resourceType,
  clearInput = false,
  showUnpublishedToggle = false,
  showReviewedToggle = false
}: {
  rounded?: boolean;
  resourceType: ResourceType;
  clearInput?: boolean;
  showUnpublishedToggle?: boolean;
  showReviewedToggle?: boolean;
} = $props();

// STATE :: LOCAL
let showUnpublishedOnly: boolean = $state(
  queryFilterParams[routerState.resource].isPublished == false
);
let showUnreviewedOnly: boolean = $state(
  queryFilterParams[routerState.resource].isReviewed == false
);

// Reset filter text after navigation if it's for the current resource
afterNavigate(() => {
  if (routerState.resource === resourceType && resourceType !== 'feature') {
    resetInput();
  }
});

$effect(() => {
  if (clearInput) {
    resetInput();
  }
});

// STATE : DERIVED :: FILTERED RESOURCES
$effect(() => {
  const type = resourceType;
  filteredResources[type] = resources[type].filter((item) => {
    const matchesSearch =
      filterTexts[type] === '' ||
      item.name.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
      item.nameShort?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
      item.description?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
      item.address?.toLowerCase().includes(filterTexts[type].toLowerCase()) ||
      queryPrimsParams[type as keyof FilterableResourceToEntityId]?.includes(item.id);

    const matchesPublished = !showUnpublishedOnly || !item.data.isPublished;
    const matchesReviewed = !showReviewedToggle || item.data.isReviewed;
    return matchesSearch && matchesPublished;
  }) as EntityWithData<typeof type>[];
});

// HANDLERS : INPUTS EVENTS
function handleUnpublishedOnlyToggle(e: Event) {
  e.preventDefault();
  showUnpublishedOnly = (e.target as HTMLInputElement).checked;
  queryFilterParams[routerState.resource].isPublished = showUnpublishedOnly
    ? false
    : null;
}

function handleReviewedToggle(e: Event) {
  e.preventDefault();
  showUnreviewedOnly = (e.target as HTMLInputElement).checked;
  queryFilterParams[routerState.resource].isReviewed = showUnreviewedOnly
    ? false
    : null;
}

// HANDLERS : KEYBOARD EVENTS
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    resetInput();
  }
}

// UTILS
function resetInput() {
  filterTexts[resourceType] = '';
}
</script>

<div class={showUnpublishedToggle || showReviewedToggle ? 'flex gap-4' : ''}>
  {#if showUnpublishedToggle}
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="unpublished-toggle"
        class="toggle toggle-primary toggle-sm"
        bind:checked={showUnpublishedOnly}
        onchange={(e) => handleUnpublishedOnlyToggle(e)}
        aria-label="Show only unpublished items" />
      <label for="unpublished-toggle" class="text-sm"> Only Unpublished </label>
    </div>
  {/if}
  {#if showReviewedToggle}
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="reviewed-toggle"
        class="toggle toggle-primary toggle-sm"
        bind:checked={showUnreviewedOnly}
        onchange={(e) => handleReviewedToggle(e)}
        aria-label="Hide reviewed items" />
      <label for="reviewed-toggle" class="text-sm"> Hide Reviewed </label>
    </div>
  {/if}
  <div
    class="relative {rounded ? '' : 'flex-shrink-0 border-l-3 border-base-200'}"
    role="search">
    <input
      type="text"
      placeholder="Match name and description"
      class="input m-0 w-full bg-neutral px-6 pr-10 text-sm focus:border-none focus:outline-none {rounded
        ? 'h-10 min-w-72 rounded-xl'
        : 'rounded-none'}"
      bind:value={filterTexts[resourceType]}
      onkeydown={handleKeydown}
      tabindex="1"
      aria-label="Filter {resourceType}s" />
    <div class="absolute inset-y-0 right-2 flex items-center pr-3">
      {#if filterTexts[resourceType]}
        <button
          onclick={resetInput}
          class="focus:outline-none"
          tabindex="-1"
          aria-label="Clear {resourceType} filter">
          <Icon src={XMark} class="h-6 w-6" />
        </button>
      {:else}
        <Icon src={MagnifyingGlass} class="h-6 w-6" aria-hidden="true" />
      {/if}
    </div>
  </div>
</div>
