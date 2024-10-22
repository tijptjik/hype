<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { navItems } from '$lib/stores/navigation.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import { appMeta } from '$lib/stores/resources.svelte';
import { getRouterState } from '$lib/context/router.svelte';
import type { ResourceType } from '$lib/types';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';

// STATE : PROPS
const routerState = getRouterState();
</script>

<header
  class="navbar h-17.5 px-12 py-4 shadow-lg {routerState.entity === false
    ? 'bg-base-300'
    : 'bg-gradient-to-r from-rose-500 to-fuchsia-800'}">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[routerState.resource as ResourceType].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{appMeta.meta.title}</h2>
    </div>
  </div>
  <div class="flex-none flex items-center space-x-4">
    <NewEntityButton resourceType={routerState.resource as ResourceType} />
    <div class="divider divider-horizontal"></div>
    <FilterInput resourceType={routerState.resource as ResourceType} rounded={true} />
  </div>
</header>
