<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ICONS
import { UserPlus, XMark } from '@steeze-ui/heroicons';
// TYPES
import type { FieldProps, ModalProps, EntityRouter } from '$lib/types';

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false)
}: FieldProps & ModalProps = $props();

const toggleSearch = (e: Event) => {
  e.preventDefault();
  searchMode = !searchMode;
};

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};

// Add and remove event listener
$effect(() => {
  window.addEventListener('keydown', handleKeydown);
  return () => {
    window.removeEventListener('keydown', handleKeydown);
  };
});

// Handle escape key
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && removeMode) {
    removeMode = false;
  } else if (event.key === 'Escape' && searchMode) {
    searchMode = false;
  }
}
</script>

<div>
  {#if !searchMode && resourceState.activeResource !== 'feature'}
    <button
      class="btn-rounded btn btn-ghost ml-auto bg-base-100"
      onclick={toggleRemoveMode}>
      {#if !removeMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        <span class="hidden md:block"> Remove User </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" />
        <span class="hidden md:block"> Stop Removing </span>
      {/if}
    </button>
  {/if}
  {#if !removeMode}
    <button
      class="btn-rounded btn btn-ghost ml-auto bg-base-100"
      onclick={toggleSearch}
      data-testid="addUserButton">
      {#if !searchMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" />
        <span class="hidden md:block"> Add User </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" /><span class="hidden md:block">
          Stop Adding
        </span>
      {/if}
    </button>
  {/if}
</div>
