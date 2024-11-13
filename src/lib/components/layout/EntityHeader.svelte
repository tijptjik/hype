<script lang="ts">
import { Icon } from '@steeze-ui/svelte-icon';
import { Bars3 } from '@steeze-ui/heroicons';
import { navItems } from '$lib/stores/navigation.svelte';
import * as m from '$lib/paraglide/messages.js';
import MenuItem from '$lib/components/menu/MenuItem.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FalsableRef, ResourceType } from '$lib/types';

type Props = {
  entity: FalsableRef;
  resourceType: ResourceType;
  title: string;
};

// STATE : PROPS
let { entity, resourceType, title }: Props = $props();

// STATE : CONTEXT
const routerState = getRouterState();

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
      label: m.project__fields(),
      ref: 'fields'
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

</script>

<header class="flex-none navbar h-17.5 px-12 py-4 shadow-lg sticky top-0 z-10 bg-gradient-to-r from-rose-500 to-fuchsia-800">
  <div class="flex-1">
    <div class="flex items-center space-x-4">
      <Icon src={navItems[routerState.resource as ResourceType].icon} class="h-6 w-6" />
      <h2 class="text-2xl font-semibold">{title}</h2>
    </div>
  </div>
  <div class="flex-none">
    <ul class="mt-1 flex flex-row space-x-2 px-2">
      {#each menuItems[routerState.resource as ResourceType] as facet}
        <MenuItem {facet} />
      {/each}
    </ul>
    <Icon src={Bars3} class="mx-2 h-6 w-6 text-black" />
    <ul class="menu menu-horizontal space-x-2">
      <EntityActions {entity} {resourceType} />
    </ul>
  </div>
</header>
