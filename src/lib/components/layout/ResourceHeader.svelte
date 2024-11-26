<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';
// CONFIG
import { navItems } from '$lib/stores/navigation.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { ResourceRouter } from '$lib/types';

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as ResourceRouter;

// STATE : DERIVED :: RESOURCE MODE
let resourceMode = $derived(routerState.entity === false);

// STATE : DERIVED :: TITLE
let title = $derived(navItems[routerState.resource].name);
</script>

<header
  class="navbar h-17.5 px-12 py-4 shadow-lg"
  class:bg-base-300={resourceMode}
  class:bg-gradient-to-r={!resourceMode}
  class:from-rose-500={!resourceMode}
  class:to-fuchsia-800={!resourceMode}>
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[routerState.resource].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title}</h2>
    </div>
  </div>
  <div class="flex flex-none items-center space-x-5">
    {#if routerState.resource !== 'task'}
      <NewEntityButton />
      <div class="divider divider-horizontal"></div>
    {/if}
    <FilterInput
      resourceType={routerState.resource}
      rounded={true}
      showUnpublishedToggle={routerState.resource !== 'task'}
      showReviewedToggle={routerState.resource === 'task'}
    />
  </div>
</header>
