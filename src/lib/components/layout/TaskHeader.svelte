<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';
// CONFIG
import { navItems } from '$lib/navigation';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// TYPES
import type { HierarchicalResource } from '$lib/enums';

// STATE : CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// STATE : DERIVED :: RESOURCE MODE
let resource = $derived(resourceState.activeResource);
let resourceMode = $derived(resourceState.isShowIndex);

// STATE : DERIVED :: TITLE
let title = $derived(resource ? navItems[resource].name : '');
</script>

{#if resource}
  <header
    class="navbar h-17.5 px-12 py-4 shadow-lg"
    class:bg-base-300={resourceMode}
    class:bg-gradient-to-r={!resourceMode}
    class:from-rose-500={!resourceMode}
    class:to-fuchsia-800={!resourceMode}>
    <div class="flex-1">
      <div class="flex items-center space-x-4">
        <Icon src={navItems[resource as HierarchicalResource].icon} class="h-6 w-6" />
        <h2 class="text-2xl font-semibold">{title}</h2>
      </div>
    </div>
    <div class="flex flex-none items-center space-x-5">
      {#if resource !== 'task'}
        <NewEntityButton />
        <div class="divider divider-horizontal"></div>
      {/if}
      <FilterInput
        resourceType={resource as Extract<HierarchicalResource, 'task'>}
        rounded={true}
        showUnpublishedToggle={false}
        showReviewedToggle={true} />
    </div>
  </header>
{/if}
