<script lang="ts">
// NAVIGATION
import { afterNavigate } from '$app/navigation';
// ICONS
import { MagnifyingGlass, XMark } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { ResourceType, AdminFilterStates } from '$lib/types';

// STATE : CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

// STATE : PROPS
const {
  rounded = false,
  resourceType,
  clearInput = false,
  showUnpublishedToggle = false,
  showReviewedToggle = false,
  ontabout
}: {
  rounded?: boolean;
  resourceType: ResourceType;
  clearInput?: boolean;
  showUnpublishedToggle?: boolean;
  showReviewedToggle?: boolean;
  ontabout?: (event: KeyboardEvent) => void;
} = $props();

// Reset filter text after navigation if it's for the current resource
afterNavigate(() => {
  if (adminCtx.activeResourceType === resourceType && resourceType !== 'feature') {
    resetInput();
  }
});

$effect(() => {
  if (clearInput) {
    resetInput();
  }
});
// HANDLERS : KEYBOARD EVENTS
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    resetInput();
  }
  if (event.key === 'Tab' && !event.shiftKey) {
    ontabout?.(event);
  }
}

// UTILS
function resetInput() {
  adminCtx.state.filters[resourceType as keyof AdminFilterStates].text = '';
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  adminCtx.state.filters[resourceType as keyof AdminFilterStates].text = target.value;
}
</script>

<div class={showUnpublishedToggle || showReviewedToggle ? 'flex gap-4' : ''}>

  <div
    class="relative {rounded ? '' : 'flex-shrink-0 border-l-3 border-base-200'}"
    role="search">
    <input
      name="text"
      type="text"
      placeholder=""
      class="input m-0 w-full bg-neutral px-6 pr-10 text-sm caret-white focus:border-none focus:outline-none focus:placeholder:text-transparent {rounded
        ? 'h-10 min-w-72 rounded-xl'
        : 'rounded-none'}"
      bind:value={adminCtx.state.filters[resourceType as keyof AdminFilterStates].text}
      oninput={handleInput}
      onkeydown={handleKeydown}
      aria-label="Filter {resourceType}s" />
    <div class="absolute inset-y-0 right-2 flex items-center pr-3">
      {#if adminCtx.state.filters[resourceType as keyof AdminFilterStates].text}
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
