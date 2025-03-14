<script lang="ts">
// NAVIGATION
import { afterNavigate } from '$app/navigation';
// ICONS
import { MagnifyingGlass, XMark, Sun } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { ResourceType, AdminFilterStates } from '$lib/types';

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

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

// Reset filter text after navigation if it's for the current resource
afterNavigate(() => {
  if (resourceState.activeResource === resourceType && resourceType !== 'feature') {
    resetInput();
  }
});

$effect(() => {
  if (clearInput) {
    resetInput();
  }
});

// HANDLERS : INPUTS EVENTS
function handleUnpublishedOnlyToggle(e: Event) {
  // TODO - detach the display in the main view from the sidebar, otherwise
  // the sidebar will display will also hide the unpublished items and potentially
  // hide the pinned filters.
  e.preventDefault();
  let showUnpublishedOnly = (e.target as HTMLInputElement).checked;
  resourceState.state.filters[resourceType as keyof AdminFilterStates].isPublished =
    showUnpublishedOnly ? false : null;
}
let showUnpublishedOnly = $derived(
  resourceState.state.filters[resourceType as keyof AdminFilterStates].isPublished ===
    false
);

function handleReviewedToggle(e: Event) {
  e.preventDefault();
  let showUnreviewedOnly = (e.target as HTMLInputElement).checked;
  resourceState.state.filters[resourceType as keyof AdminFilterStates].isReviewed =
    showUnreviewedOnly ? false : null;
}
let showUnreviewedOnly = $derived(
  resourceState.state.filters[resourceType as keyof AdminFilterStates].isReviewed ===
    false
);

// HANDLERS : KEYBOARD EVENTS
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    resetInput();
  }
}

// UTILS
function resetInput() {
  resourceState.state.filters[resourceType as keyof AdminFilterStates].text = '';
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  resourceState.state.filters[resourceType as keyof AdminFilterStates].text =
    target.value;
}
</script>

<div class={showUnpublishedToggle || showReviewedToggle ? 'flex gap-4' : ''}>
  {#if showUnpublishedToggle}
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="unpublished-toggle"
        class="toggle toggle-primary toggle-sm"
        checked={showUnpublishedOnly}
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
        checked={showUnreviewedOnly}
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
      bind:value={
        resourceState.state.filters[resourceType as keyof AdminFilterStates].text
      }
      oninput={handleInput}
      onkeydown={handleKeydown}
      tabindex="1"
      aria-label="Filter {resourceType}s" />
    <div class="absolute inset-y-0 right-2 flex items-center pr-3">
      {#if resourceState.state.filters[resourceType as keyof AdminFilterStates].text}
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
