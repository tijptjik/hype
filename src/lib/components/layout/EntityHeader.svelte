<script lang="ts">
import { page } from '$app/stores';
import { Icon } from '@steeze-ui/svelte-icon';
import { Bars3 } from '@steeze-ui/heroicons';
import { navItems } from '$lib/stores/navigation.svelte';
import * as m from '$lib/paraglide/messages.js';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import OrganisationActions from '$lib/components/menu/OrganisationActions.svelte';
import ProjectActions from '$lib/components/menu/ProjectActions.svelte';
import LayerActions from '$lib/components/menu/LayerActions.svelte';
import FeatureActions from '$lib/components/menu/FeatureActions.svelte';
import { meta } from '$lib/stores/resources.svelte';
import { getRouterState } from '$lib/context/router.svelte';
import type { ResourceType } from '$lib/types';

// STATE : PROPS
const routerState = getRouterState();

// STATE : DERIVED
const title = $derived(() => {
  return meta.title;
});

// CONFIG

const menuActions = {
  organisation: OrganisationActions,
  project: ProjectActions,
  layer: LayerActions,
  feature: FeatureActions
};

const menuItems = {
  organisation: [
    {
      label: m.organisation__core(),
      ref: 'core'
    },
    {
      label: m.organisation__images(),
      ref: 'images'
    }
  ],
  project: [
    {
      label: m.project__core(),
      ref: 'core'
    },
    {
      label: m.project__images(),
      ref: 'images'
    }
  ],
  layer: [
    {
      label: m.layer__core(),
      ref: 'core'
    }
  ],
  feature: [
    {
      label: m.feature__core(),
      ref: 'core'
    },
    {
      label: m.feature__address(),
      ref: 'address'
    },
    {
      label: m.feature__images(),
      ref: 'images'
    }
  ]
};

// UTILS

</script>

<header class="navbar h-17.5 px-12 py-4 shadow-lg sticky top-0 z-10 {routerState.entity === false ? 'bg-base-300' : 'bg-gradient-to-r from-rose-500 to-fuchsia-800'}">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[routerState.resource as ResourceType].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title()}</h2>
    </div>
  </div>
  <div class="flex-none">
    <!-- ENTITY MODE -->
    {#if routerState.entity !== false}
    {@const Actions = menuActions[routerState.resource as ResourceType]}
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each menuItems[routerState.resource as ResourceType] as facet}
        <MenuItem {facet} />
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <Actions />
    </ul>
    {/if}
  </div>
</header>
